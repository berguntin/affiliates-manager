import { and, eq, gte, inArray } from 'drizzle-orm'
import type { ChannelType, MessageFormat } from '../../shared/types'
import { evaluateDeal, type DealEvaluation } from '../domain/deals'
import { checkDedupe, type PreviousProposal } from '../domain/dedupe'
import { renderMessage, type MessageData } from '../domain/messages/render'
import type { ProductSnapshot } from '../domain/product'
import { computeExpiresAt } from '../domain/publication'
import type { Db } from '../utils/db'
import { schema } from '../utils/db'
import type { Channel } from './channels'
import { generateIntros, type Copywriter } from './copywriter'
import { markManualProductsConsumed } from './manual-products'
import { getPriceHistoryProvider, getProvider } from './providers'
import type { RunLog } from './runs'
import { resolveTemplate } from './templates'
import { listThemes, type ThemeWithChannels } from './themes'

const { deals, publications, channels: channelsTable } = schema
const DAY = 86_400_000

/** Candidatas por escaneo = límite diario × este factor (margen para descartar). */
export const CANDIDATES_FACTOR = 2
/** Máximo de productos que se piden al proveedor por temática. */
export const SEARCH_LIMIT = 50

export const FORMAT_BY_CHANNEL: Record<ChannelType, MessageFormat> = {
  telegram: 'telegram-html',
  whatsapp: 'whatsapp',
}

export interface ScanOptions {
  now?: number
  timezone: string
  /** Redacción de entradillas con IA; sin él, solo plantilla. */
  copywriter?: Copywriter
}

export function messageDataFrom(
  snapshot: ProductSnapshot,
  evaluation: Pick<DealEvaluation, 'effectiveDiscountPct' | 'reliability'>,
  timezone: string,
  intro: string | null = null,
): MessageData {
  const offer = snapshot.offer
  return {
    title: snapshot.title,
    brand: snapshot.brand,
    note: snapshot.note || null,
    intro,
    link: snapshot.detailPageUrl,
    timezone,
    price: offer
      ? {
          priceCents: offer.priceCents,
          savingBasisCents: offer.savingBasisCents,
          basisIsListPrice: offer.savingBasisType === 'LIST_PRICE',
          discountPct: evaluation.effectiveDiscountPct,
          dealBadge: offer.dealType === 'LIGHTNING_DEAL' ? (offer.dealBadge ?? 'Oferta flash') : null,
          checkedAt: snapshot.capturedAt,
        }
      : null,
  }
}

/**
 * Propuestas anteriores del ASIN (en cualquier temática) dentro de la ventana.
 * Las que caducaron sin que nadie actuara no cuentan.
 */
async function previousProposals(db: Db, asin: string, since: number): Promise<PreviousProposal[]> {
  const rows = await db
    .select({
      dealId: deals.id,
      detectedAt: deals.detectedAt,
      dealPrice: deals.priceCents,
      status: publications.status,
      shown: publications.priceCentsShown,
    })
    .from(deals)
    .innerJoin(publications, eq(publications.dealId, deals.id))
    .where(and(eq(deals.asin, asin), gte(deals.detectedAt, since)))

  const byDeal = new Map<string, PreviousProposal & { live: boolean }>()
  for (const r of rows) {
    const entry = byDeal.get(r.dealId) ?? { at: r.detectedAt, priceCents: r.dealPrice, live: false }
    if (r.status !== 'caducada') entry.live = true
    if (r.status === 'publicada' && r.shown != null) {
      entry.priceCents = entry.priceCents == null ? r.shown : Math.min(entry.priceCents, r.shown)
    }
    byDeal.set(r.dealId, entry)
  }
  return [...byDeal.values()].filter((p) => p.live).map(({ at, priceCents }) => ({ at, priceCents }))
}

/** Escanea una temática y crea candidatas (una publicación por canal activo). */
export async function scanTheme(
  db: Db,
  theme: ThemeWithChannels,
  log: RunLog,
  options: ScanOptions,
): Promise<number> {
  const now = options.now ?? Date.now()
  const label = `«${theme.name}»`

  const channels: Channel[] = theme.channelIds.length
    ? (await db.select().from(channelsTable).where(inArray(channelsTable.id, theme.channelIds))).filter(
        (c) => c.active,
      )
    : []
  if (channels.length === 0) {
    log.error(`${label}: no tiene canales activos`)
    return 0
  }

  const provider = getProvider(theme.provider, db)
  const history = getPriceHistoryProvider()

  let snapshots: ProductSnapshot[]
  try {
    snapshots = await provider.search({
      themeId: theme.id,
      keywords: theme.keywords,
      browseNodes: theme.browseNodes,
      searchIndex: theme.searchIndex,
      minPriceCents: theme.minPriceCents,
      maxPriceCents: theme.maxPriceCents,
      minSavingPercent: theme.minDiscountPct > 0 ? theme.minDiscountPct : null,
      minRating: theme.minRating,
      partnerTag: channels[0]!.trackingId,
      limit: SEARCH_LIMIT,
    })
  } catch (error) {
    log.error(`${label}: error al buscar productos (${(error as Error).message})`)
    return 0
  }
  log.count('encontrados', snapshots.length)

  const filters = {
    minDiscountPct: theme.minDiscountPct,
    minPriceCents: theme.minPriceCents,
    maxPriceCents: theme.maxPriceCents,
    excludeKeywords: theme.excludeKeywords,
    excludeBrands: theme.excludeBrands,
  }

  const accepted: { snapshot: ProductSnapshot; evaluation: DealEvaluation }[] = []
  for (const snapshot of snapshots) {
    const evaluation = evaluateDeal(snapshot, filters, await history.getStats(snapshot.asin))
    if (!evaluation.eligible) {
      log.count('descartados')
      continue
    }
    // Las altas manuales son decisión explícita: no se deduplican.
    if (snapshot.source !== 'manual') {
      const decision = checkDedupe({
        priceCents: snapshot.offer?.priceCents ?? null,
        previous: await previousProposals(db, snapshot.asin, now - theme.dedupeDays * DAY),
        now,
        dedupeDays: theme.dedupeDays,
      })
      if (!decision.allowed) {
        log.count('repetidos')
        continue
      }
    }
    accepted.push({ snapshot, evaluation })
  }

  if (theme.provider === 'manual') {
    await markManualProductsConsumed(db, theme.id, snapshots.map((s) => s.asin))
  }

  accepted.sort((a, b) => b.evaluation.score - a.evaluation.score)
  const selected =
    theme.provider === 'manual' ? accepted : accepted.slice(0, theme.dailyLimit * CANDIDATES_FACTOR)
  if (selected.length === 0) return 0

  // Enlaces y precios por canal: cada canal lleva su propio tracking ID (SPEC §13.A.4).
  const asins = selected.map((s) => s.snapshot.asin)
  const freshByChannel = new Map<string, Map<string, ProductSnapshot>>()
  for (const channel of channels) {
    try {
      const fresh = await provider.refresh(asins, channel.trackingId)
      freshByChannel.set(channel.id, new Map(fresh.map((f) => [f.asin, f])))
    } catch (error) {
      log.error(`${label} → ${channel.name}: error al obtener enlaces (${(error as Error).message})`)
    }
  }

  // Una entradilla por oferta, compartida por todos sus canales.
  const intros = options.copywriter
    ? await generateIntros(
        options.copywriter,
        selected.map(({ snapshot }) => ({
          key: snapshot.asin,
          input: { title: snapshot.title, brand: snapshot.brand, themeName: theme.name, tone: theme.tone },
        })),
      )
    : new Map()
  const introErrors = new Map<string, number>()
  for (const result of intros.values()) {
    log.count(result.source === 'ia' ? 'entradillas_ia' : 'entradillas_plantilla')
    if (result.source === 'plantilla' && result.error) {
      introErrors.set(result.reason, (introErrors.get(result.reason) ?? 0) + 1)
    }
  }
  for (const [reason, n] of introErrors) {
    log.error(`${label}: entradilla con IA no disponible en ${n} oferta(s), se usa la plantilla: ${reason}`)
  }

  const templates = new Map<MessageFormat, string>()
  for (const format of new Set(channels.map((c) => FORMAT_BY_CHANNEL[c.type]))) {
    templates.set(format, await resolveTemplate(db, theme.id, format))
  }

  const statements = []
  let created = 0
  for (const { snapshot, evaluation } of selected) {
    const dealId = crypto.randomUUID()
    const intro = intros.get(snapshot.asin)?.intro ?? null
    const offer = snapshot.offer
    const pubs = []
    for (const channel of channels) {
      const fresh = freshByChannel.get(channel.id)?.get(snapshot.asin)
      if (!fresh) continue
      const format = FORMAT_BY_CHANNEL[channel.type]
      const rendered = renderMessage(format, templates.get(format)!, messageDataFrom(fresh, evaluation, options.timezone, intro))
      for (const warning of rendered.warnings) log.error(`${label} (${channel.name}): ${warning}`)
      pubs.push(
        db.insert(publications).values({
          id: crypto.randomUUID(),
          dealId,
          channelId: channel.id,
          status: 'candidata',
          text: rendered.text,
          link: fresh.detailPageUrl,
          priceCentsShown: fresh.offer?.priceCents ?? null,
          priceCheckedAt: fresh.offer ? fresh.capturedAt : null,
        }),
      )
    }
    if (pubs.length === 0) continue
    created++
    statements.push(
      db.insert(deals).values({
        id: dealId,
        themeId: theme.id,
        asin: snapshot.asin,
        source: snapshot.source,
        detectedAt: now,
        expiresAt: computeExpiresAt(now, offer?.dealEndsAt ?? null),
        title: snapshot.title,
        brand: snapshot.brand,
        imageUrl: snapshot.imageUrl,
        priceCents: offer?.priceCents ?? null,
        savingBasisCents: offer?.savingBasisCents ?? null,
        savingBasisType: offer?.savingBasisType ?? null,
        savingsPct: offer?.savingsPercent ?? null,
        dealType: offer?.dealType ?? null,
        dealEndsAt: offer?.dealEndsAt ?? null,
        effectiveDiscountPct: evaluation.effectiveDiscountPct,
        reliability: evaluation.reliability,
        suspicious: evaluation.suspicious,
        reasons: evaluation.notes,
        score: evaluation.score,
        intro,
      }),
      ...pubs,
    )
  }
  if (statements.length > 0) {
    await db.batch(statements as [(typeof statements)[number], ...typeof statements])
  }
  log.count('candidatas', created)
  return created
}

/** Escaneo de todas las temáticas activas (cron diario) sin código por temática. */
export async function scanAllThemes(db: Db, log: RunLog, options: ScanOptions): Promise<void> {
  const active = (await listThemes(db)).filter((t) => t.active)
  log.count('tematicas', active.length)
  for (const theme of active) {
    try {
      await scanTheme(db, theme, log, options)
    } catch (error) {
      log.error(`«${theme.name}»: ${(error as Error).message}`)
    }
  }
}
