import { and, desc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { alignToTick, nextTick } from '../../shared/queue-cycle'
import type { ChannelType, PublicationStatus } from '../../shared/types'
import { getChannelAdapter } from '../channels'
import { evaluateDeal } from '../domain/deals'
import { checkRequiredElements, formatCheckedAt, renderMessage } from '../domain/messages/render'
import {
  CANDIDATE_TTL_MS,
  OPEN_STATUSES,
  availableActions,
  isExpired,
  nextStatus,
  priceChangeReason,
  type PublicationAction,
} from '../domain/publication'
import { localParts, nextSlot, startOfLocalDay } from '../domain/schedule'
import type { Db } from '../utils/db'
import { schema } from '../utils/db'
import { getProvider } from './providers'
import type { RunLog } from './runs'
import { FORMAT_BY_CHANNEL, messageDataFrom } from './scan'
import { resolveTemplate } from './templates'

const { publications, deals, channels, themes } = schema

/** Antigüedad máxima de la comprobación de precio para publicar (doc. API: TTL ofertas 1 h). */
export const PRICE_CHECK_MAX_AGE_MS = 60 * 60 * 1000

/** Canales que publica el sistema (el resto son asistidos). */
const AUTOMATIC_CHANNEL_TYPES: ChannelType[] = ['telegram']

export class QueueError extends Error {
  constructor(
    message: string,
    readonly statusCode = 409,
  ) {
    super(message)
    this.name = 'QueueError'
  }
}

export interface QueueContext {
  timezone: string
  env: { TELEGRAM_BOT_TOKEN?: string }
  now?: number
}

const queueColumns = {
  id: publications.id,
  status: publications.status,
  text: publications.text,
  link: publications.link,
  priceCentsShown: publications.priceCentsShown,
  priceCheckedAt: publications.priceCheckedAt,
  needsReview: publications.needsReview,
  reviewReason: publications.reviewReason,
  scheduledAt: publications.scheduledAt,
  publishedAt: publications.publishedAt,
  externalId: publications.externalId,
  error: publications.error,
  createdAt: publications.createdAt,
  updatedAt: publications.updatedAt,
  dealId: deals.id,
  asin: deals.asin,
  source: deals.source,
  title: deals.title,
  brand: deals.brand,
  imageUrl: deals.imageUrl,
  detectedAt: deals.detectedAt,
  expiresAt: deals.expiresAt,
  effectiveDiscountPct: deals.effectiveDiscountPct,
  reliability: deals.reliability,
  suspicious: deals.suspicious,
  reasons: deals.reasons,
  score: deals.score,
  intro: deals.intro,
  themeId: themes.id,
  themeName: themes.name,
  channelId: channels.id,
  channelName: channels.name,
  channelType: channels.type,
}

function baseQuery(db: Db) {
  return db
    .select(queueColumns)
    .from(publications)
    .innerJoin(deals, eq(publications.dealId, deals.id))
    .innerJoin(themes, eq(deals.themeId, themes.id))
    .innerJoin(channels, eq(publications.channelId, channels.id))
}

export async function listQueue(
  db: Db,
  filter: { statuses: PublicationStatus[]; channelId?: string; themeId?: string; limit?: number },
) {
  const conditions = [inArray(publications.status, filter.statuses)]
  if (filter.channelId) conditions.push(eq(publications.channelId, filter.channelId))
  if (filter.themeId) conditions.push(eq(deals.themeId, filter.themeId))
  const rows = await baseQuery(db)
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${publications.publishedAt}, ${publications.scheduledAt}, ${deals.detectedAt})`), desc(deals.score))
    .limit(filter.limit ?? 200)
  return rows.map(withActions)
}

export async function getQueueItem(db: Db, id: string) {
  const [row] = await baseQuery(db).where(eq(publications.id, id)).limit(1)
  return row ? withActions(row) : null
}

function withActions<T extends { status: PublicationStatus; needsReview: boolean; channelType: string }>(row: T) {
  return { ...row, actions: availableActions(row.status, row.needsReview) }
}

async function requireItem(db: Db, id: string) {
  const item = await getQueueItem(db, id)
  if (!item) throw new QueueError('Publicación no encontrada', 404)
  return item
}

async function setStatus(
  db: Db,
  id: string,
  status: PublicationStatus,
  extra: Partial<typeof publications.$inferInsert> = {},
) {
  await db
    .update(publications)
    .set({ status, updatedAt: Date.now(), ...extra })
    .where(eq(publications.id, id))
}

function ensureNotExpired(item: { status: PublicationStatus; expiresAt: number }, now: number) {
  if (isExpired(item.status, item.expiresAt, now)) {
    throw new QueueError('La oferta ha caducado (más de 24 h o fin de la oferta flash)')
  }
}

/** Acciones simples del panel (aprobar, descartar, editar, programar…). */
export async function applyAction(
  db: Db,
  id: string,
  action: Exclude<PublicationAction, 'publish' | 'expire'>,
  payload: { text?: string; scheduledAt?: number | null },
  ctx: QueueContext,
) {
  const now = ctx.now ?? Date.now()
  const item = await requireItem(db, id)
  const to = nextStatus(item.status, action)
  if (action !== 'discard') ensureNotExpired(item, now)

  switch (action) {
    case 'edit': {
      const text = payload.text?.trim()
      if (!text) throw new QueueError('El texto no puede estar vacío', 400)
      const missing = checkRequiredElements(text, { link: item.link, withPrice: item.priceCentsShown != null })
      if (missing.length) throw new QueueError(`Al texto le falta: ${missing.join(', ')}`, 400)
      await setStatus(db, id, to, { text })
      break
    }
    case 'schedule': {
      if (item.needsReview) throw new QueueError('Revisa el cambio de precio antes de programar')
      // Toda hora se ajusta al ciclo de la cola: es cuando se publicará de verdad.
      const requested = payload.scheduledAt ?? (await suggestSlot(db, item, ctx.timezone, now))
      if (requested == null) throw new QueueError('No hay huecos libres en las franjas antes de que caduque')
      if (requested < now - 60_000) throw new QueueError('La hora elegida ya ha pasado', 400)
      const scheduledAt = Math.max(alignToTick(requested), nextTick(now))
      if (scheduledAt >= item.expiresAt) throw new QueueError('La hora elegida es posterior a la caducidad')
      await setStatus(db, id, to, { scheduledAt })
      break
    }
    case 'unschedule':
      await setStatus(db, id, to, { scheduledAt: null })
      break
    default:
      await setStatus(db, id, to)
  }
  return requireItem(db, id)
}

/** Siguiente hueco libre según franjas y límite diario de la temática en ese canal. */
async function suggestSlot(
  db: Db,
  item: { themeId: string; channelId: string; expiresAt: number },
  timezone: string,
  now: number,
): Promise<number | null> {
  const theme = await db.query.themes.findFirst({ where: eq(themes.id, item.themeId) })
  if (!theme) return null
  const dayStart = startOfLocalDay(now, timezone)
  const taken = await db
    .select({ at: sql<number>`coalesce(${publications.publishedAt}, ${publications.scheduledAt})` })
    .from(publications)
    .innerJoin(deals, eq(publications.dealId, deals.id))
    .where(
      and(
        eq(deals.themeId, item.themeId),
        eq(publications.channelId, item.channelId),
        or(
          and(eq(publications.status, 'programada'), sql`${publications.scheduledAt} >= ${dayStart}`),
          and(eq(publications.status, 'publicada'), sql`${publications.publishedAt} >= ${dayStart}`),
        ),
      ),
    )
  return nextSlot({
    now,
    windows: theme.publishWindows,
    timezone,
    taken: taken.map((t) => t.at),
    dailyLimit: theme.dailyLimit,
    deadline: item.expiresAt,
  })
}

/**
 * Recomprueba el precio con el tracking ID del canal y actualiza enlace y hora de
 * consulta en el texto. Si el precio ha cambiado, marca la publicación para revisión.
 */
export async function recheck(db: Db, id: string, ctx: QueueContext) {
  const now = ctx.now ?? Date.now()
  const item = await requireItem(db, id)
  if (!OPEN_STATUSES.includes(item.status)) throw new QueueError('La publicación ya no está en la cola')
  ensureNotExpired(item, now)

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, item.channelId) })
  if (!channel) throw new QueueError('Canal no encontrado', 404)
  const provider = getProvider(item.source, db)
  const [fresh] = await provider.refresh([item.asin], channel.trackingId)
  if (!fresh) {
    await setStatus(db, id, item.status, { needsReview: true, reviewReason: 'El producto ya no está disponible' })
    return { ok: false as const, item: await requireItem(db, id) }
  }

  const currentPrice = fresh.offer?.priceCents ?? null
  const reason = priceChangeReason(item.priceCentsShown, currentPrice)
  if (reason) {
    await setStatus(db, id, item.status, { needsReview: true, reviewReason: reason })
    return { ok: false as const, item: await requireItem(db, id) }
  }

  let text = item.text
  if (fresh.offer) {
    text = text.replace(
      /consultado el \d{2}\/\d{2}\/\d{4} a las \d{2}:\d{2}, [^)]+/,
      `consultado el ${formatCheckedAt(fresh.capturedAt, ctx.timezone)}`,
    )
  }
  if (fresh.detailPageUrl !== item.link) {
    text = text.split(item.link).join(fresh.detailPageUrl)
    text = text.split(item.link.replace(/&/g, '&amp;')).join(fresh.detailPageUrl.replace(/&/g, '&amp;'))
  }
  await setStatus(db, id, item.status, {
    text,
    link: fresh.detailPageUrl,
    priceCheckedAt: fresh.offer ? fresh.capturedAt : null,
    needsReview: false,
    reviewReason: null,
    error: null,
  })
  return { ok: true as const, item: await requireItem(db, id) }
}

/**
 * Acepta el cambio tras revisarlo: vuelve a evaluar la oferta y regenera el mensaje
 * desde la plantilla con los datos actuales (descuento, precio y hora de consulta).
 */
export async function acceptReview(db: Db, id: string, ctx: QueueContext) {
  const item = await requireItem(db, id)
  if (!item.needsReview) return item
  const [channel, theme] = await Promise.all([
    db.query.channels.findFirst({ where: eq(channels.id, item.channelId) }),
    db.query.themes.findFirst({ where: eq(themes.id, item.themeId) }),
  ])
  if (!channel || !theme) throw new QueueError('Canal o temática no encontrados', 404)
  const [fresh] = await getProvider(item.source, db).refresh([item.asin], channel.trackingId)
  if (!fresh) throw new QueueError('El producto ya no está disponible: descártalo')

  const evaluation = evaluateDeal(fresh, {
    minDiscountPct: theme.minDiscountPct,
    minPriceCents: theme.minPriceCents,
    maxPriceCents: theme.maxPriceCents,
    excludeKeywords: theme.excludeKeywords,
    excludeBrands: theme.excludeBrands,
  })
  if (!evaluation.eligible) {
    throw new QueueError(`Ya no cumple los filtros: ${evaluation.rejections.join('; ')}. Descártala.`)
  }
  const format = FORMAT_BY_CHANNEL[channel.type]
  const rendered = renderMessage(
    format,
    await resolveTemplate(db, theme.id, format),
    messageDataFrom(fresh, evaluation, ctx.timezone, item.intro),
  )
  await setStatus(db, id, item.status, {
    text: rendered.text,
    link: fresh.detailPageUrl,
    priceCentsShown: fresh.offer?.priceCents ?? null,
    priceCheckedAt: fresh.offer ? fresh.capturedAt : null,
    needsReview: false,
    reviewReason: null,
  })
  return requireItem(db, id)
}

/**
 * Publica: recomprueba precio y, si no ha cambiado, envía (canales automáticos)
 * o marca como publicada (canales asistidos, tras compartir desde el panel).
 */
export async function publish(db: Db, id: string, ctx: QueueContext) {
  const now = ctx.now ?? Date.now()
  let item = await requireItem(db, id)
  nextStatus(item.status, 'publish')
  if (item.needsReview) throw new QueueError(`Pendiente de revisión: ${item.reviewReason ?? 'cambio de precio'}`)

  const adapter = getChannelAdapter(item.channelType, ctx.env)
  const priceIsFresh = item.priceCheckedAt != null && now - item.priceCheckedAt < PRICE_CHECK_MAX_AGE_MS
  if (adapter.mode === 'automatic' || (item.priceCentsShown != null && !priceIsFresh)) {
    const result = await recheck(db, id, ctx)
    if (!result.ok) return { published: false as const, item: result.item }
    item = result.item
  }

  const missing = checkRequiredElements(item.text, { link: item.link, withPrice: item.priceCentsShown != null })
  if (missing.length) throw new QueueError(`Al texto le falta: ${missing.join(', ')}`, 400)

  let externalId: string | null = null
  if (adapter.mode === 'automatic' && adapter.publish) {
    const channel = await db.query.channels.findFirst({ where: eq(channels.id, item.channelId) })
    if (!channel) throw new QueueError('Canal no encontrado', 404)
    try {
      externalId = (await adapter.publish(channel, { text: item.text, link: item.link })).externalId
    } catch (error) {
      await setStatus(db, id, item.status, { error: (error as Error).message })
      throw new QueueError(`No se pudo publicar: ${(error as Error).message}`, 502)
    }
  }
  await setStatus(db, id, 'publicada', { publishedAt: now, externalId, error: null })
  return { published: true as const, item: await requireItem(db, id) }
}

/** Tarea periódica: caduca, publica lo programado vencido y purga datos de más de 24 h. */
export async function tick(db: Db, log: RunLog, ctx: QueueContext) {
  const now = ctx.now ?? Date.now()

  // 1. Caducar
  const expiredDeals = db.select({ id: deals.id }).from(deals).where(lte(deals.expiresAt, now))
  const expired = await db
    .update(publications)
    .set({ status: 'caducada', updatedAt: now })
    .where(and(inArray(publications.status, [...OPEN_STATUSES]), inArray(publications.dealId, expiredDeals)))
    .returning({ id: publications.id })
  log.count('caducadas', expired.length)

  // 2. Publicar lo programado (solo canales automáticos y sin revisión pendiente)
  const due = await db
    .select({ id: publications.id })
    .from(publications)
    .innerJoin(channels, eq(publications.channelId, channels.id))
    .where(
      and(
        eq(publications.status, 'programada'),
        lte(publications.scheduledAt, now),
        eq(publications.needsReview, false),
        inArray(channels.type, AUTOMATIC_CHANNEL_TYPES),
        eq(channels.active, true),
      ),
    )
  for (const { id } of due) {
    try {
      const result = await publish(db, id, ctx)
      log.count(result.published ? 'publicadas' : 'a_revision')
    } catch (error) {
      // Se devuelve a «aprobada» para no reintentar cada 10 minutos; el error queda visible.
      const message = (error as Error).message
      await setStatus(db, id, 'aprobada', { scheduledAt: null, error: message })
      log.error(`Publicación ${id.slice(0, 8)}: ${message}`)
    }
  }

  // 3. Purgar contenido de producto de más de 24 h que no se publicó (Licencia: caché ≤ 24 h).
  //    Lo publicado se conserva: es el texto de nuestro propio mensaje.
  const limit = now - CANDIDATE_TTL_MS
  const oldDeals = db
    .select({ id: deals.id })
    .from(deals)
    .where(and(ne(deals.source, 'manual'), lte(deals.detectedAt, limit)))
  const purgedTexts = await db
    .update(publications)
    .set({ text: '', priceCentsShown: null })
    .where(
      and(
        inArray(publications.dealId, oldDeals),
        ne(publications.status, 'publicada'),
        ne(publications.text, ''),
      ),
    )
    .returning({ id: publications.id })
  const stale = await db
    .update(deals)
    .set({
      title: null,
      brand: null,
      imageUrl: null,
      priceCents: null,
      savingBasisCents: null,
      savingBasisType: null,
      savingsPct: null,
      purgedAt: now,
    })
    .where(
      and(
        isNull(deals.purgedAt),
        ne(deals.source, 'manual'),
        lte(deals.detectedAt, limit),
        sql`not exists (select 1 from ${publications} where ${publications.dealId} = ${deals.id} and ${publications.status} = 'publicada')`,
      ),
    )
    .returning({ id: deals.id })
  log.count('purgadas', stale.length + purgedTexts.length)
}

/** Resumen del día para el panel. */
export async function daySummary(db: Db, timezone: string, now = Date.now()) {
  const dayStart = startOfLocalDay(now, timezone)
  const counts = await db
    .select({ status: publications.status, n: sql<number>`count(*)` })
    .from(publications)
    .groupBy(publications.status)
    .where(inArray(publications.status, [...OPEN_STATUSES]))
  const publishedToday = await db
    .select({ n: sql<number>`count(*)` })
    .from(publications)
    .where(and(eq(publications.status, 'publicada'), sql`${publications.publishedAt} >= ${dayStart}`))
  const review = await db
    .select({ n: sql<number>`count(*)` })
    .from(publications)
    .where(and(inArray(publications.status, [...OPEN_STATUSES]), eq(publications.needsReview, true)))
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.n]))
  return {
    date: localParts(now, timezone).dateKey,
    candidatas: byStatus.candidata ?? 0,
    aprobadas: byStatus.aprobada ?? 0,
    programadas: byStatus.programada ?? 0,
    publicadasHoy: publishedToday[0]?.n ?? 0,
    pendientesRevision: review[0]?.n ?? 0,
  }
}
