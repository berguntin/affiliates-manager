import { and, desc, eq, gte, inArray, like } from 'drizzle-orm'
import { nextTick } from '../../shared/queue-cycle'
import { callTelegram } from '../channels/telegram-api'
import { isAutomaticChannel } from '../channels'
import {
  HELP_TEXT,
  decodeCallback,
  draftCard,
  extractPrice,
  extractUrls,
  guessTitle,
  parseAllowedUserIds,
  parseDraftReply,
  pickAmazonUrl,
  queuedCard,
  type InlineButton,
  type TelegramEntity,
} from '../domain/intake'
import { affiliateTagFrom, isAffiliateShortLink, parseAsin, type OwnAffiliateLink } from '../domain/affiliate'
import { withFeatureBullets } from '../domain/amazon-page'
import { TransitionError } from '../domain/publication'
import type { Db } from '../utils/db'
import { schema } from '../utils/db'
import type { AppEnv } from '../utils/env'
import { createCopywriter } from './copywriter'
import { addManualProduct } from './manual-products'
import { ProductLookupError, lookupProduct, type ProductLookup } from './product-lookup'
import { QueueError, applyAction, publish } from './queue'
import { withRun } from './runs'
import { scanTheme } from './scan'
import { getTheme, listThemes } from './themes'

const { intakeDrafts, publications, deals, channels } = schema

// --- Tipos mínimos de la Bot API ---

interface TgMessage {
  message_id: number
  chat: { id: number; type: string }
  from?: { id: number }
  text?: string
  caption?: string
  entities?: TelegramEntity[]
  caption_entities?: TelegramEntity[]
  reply_to_message?: { message_id: number }
}

interface TgCallbackQuery {
  id: string
  from: { id: number }
  data?: string
  message?: { message_id: number; chat: { id: number } }
}

export interface TgUpdate {
  update_id: number
  message?: TgMessage
  callback_query?: TgCallbackQuery
}

export interface IntakeContext {
  db: Db
  env: AppEnv
  timezone: string
  /** Origen público del panel, para el botón «Abrir la cola». */
  origin: string | null
  now?: number
  /** Inyectable en tests. */
  fetchFn?: typeof fetch
}

/** User-Agent con el que el buzón se identifica (Licencia de Afiliados, «Agentes»). */
export const INTAKE_USER_AGENT = 'Agent/OfertasBuzon (resolución de enlaces cortos; sin acceso a páginas)'

/**
 * Obtiene el ASIN de un enlace corto (amzn.eu…) siguiendo SOLO las redirecciones:
 * se detiene en cuanto la cabecera Location contiene el ASIN y nunca pide la página
 * de amazon.es.
 */
export async function resolveShortLink(url: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  return (await resolveShortLinkDetails(url, fetchFn))?.asin ?? null
}

/**
 * Like `resolveShortLink`, and also returns the affiliate `tag` found in the redirect
 * targets (null if none). Reads only `Location` headers; no extra requests.
 */
export async function resolveShortLinkDetails(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ asin: string; tag: string | null } | null> {
  let current = url
  let tag: string | null = null
  for (let hop = 0; hop < 4; hop++) {
    const host = new URL(current).hostname
    if (/(^|\.)amazon\.[a-z.]+$/i.test(host)) return null // no se accede a páginas de Amazon
    const res = await fetchFn(current, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'user-agent': INTAKE_USER_AGENT },
    })
    const location = res.headers.get('location')
    if (!location || res.status < 300 || res.status >= 400) return null
    const next = new URL(location, current).toString()
    tag = affiliateTagFrom(next) ?? tag
    const asin = parseAsin(next)
    if (asin) return { asin, tag }
    current = next
  }
  return null
}

/** Product reference from what a person pastes or shares, plus their own short link if tagged. */
export interface ProductInput {
  asin: string
  /** The pasted Amazon short link, kept only if it resolves with an affiliate tag. */
  affiliateLink: OwnAffiliateLink | null
}

/**
 * ASIN a partir de lo que pega o comparte una persona: un ASIN, una URL de amazon.es o
 * un enlace corto (link.amazon, amzn.eu…). Lo usan el bot buzón y el alta manual del panel.
 */
export async function resolveAsinInput(input: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  return (await resolveProductInput(input, fetchFn))?.asin ?? null
}

/** Like `resolveAsinInput`, and keeps the user's own affiliate short link when it has a tag. */
export async function resolveProductInput(input: string, fetchFn: typeof fetch = fetch): Promise<ProductInput | null> {
  const direct = parseAsin(input)
  if (direct) return { asin: direct, affiliateLink: null }
  return resolvePickedUrl(pickAmazonUrl(extractUrls(input.trim())), fetchFn)
}

async function resolvePickedUrl(
  picked: ReturnType<typeof pickAmazonUrl>,
  fetchFn: typeof fetch | undefined,
): Promise<ProductInput | null> {
  if (!picked) return null
  if ('asin' in picked) return { asin: picked.asin, affiliateLink: null }
  try {
    const resolved = await resolveShortLinkDetails(picked.shortUrl, fetchFn)
    if (!resolved) return null
    const url = new URL(picked.shortUrl)
    url.hash = ''
    const affiliateLink =
      resolved.tag != null && isAffiliateShortLink(url.href) ? { url: url.href, tag: resolved.tag } : null
    return { asin: resolved.asin, affiliateLink }
  } catch {
    return null
  }
}

function shortId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export class IntakeBot {
  private readonly token: string
  private readonly allowed: string[]

  constructor(private readonly ctx: IntakeContext) {
    if (!ctx.env.INTAKE_BOT_TOKEN) throw new Error('Falta INTAKE_BOT_TOKEN')
    this.token = ctx.env.INTAKE_BOT_TOKEN
    this.allowed = parseAllowedUserIds(ctx.env.INTAKE_ALLOWED_USER_IDS)
  }

  private api<T = unknown>(method: string, payload: Record<string, unknown>) {
    return callTelegram<T>(this.token, method, payload, intakeApiOptions(this.ctx.env))
  }

  private send(chatId: number | string, text: string, keyboard?: InlineButton[][], html = true) {
    return this.api<{ message_id: number }>('sendMessage', {
      chat_id: chatId,
      text,
      ...(html ? { parse_mode: 'HTML' } : {}),
      link_preview_options: { is_disabled: true },
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    })
  }

  private edit(chatId: number | string, messageId: number, text: string, keyboard: InlineButton[][] = []) {
    return this.api('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: keyboard },
    }).catch((error: Error) => {
      // «message is not modified» no es un error real
      if (!/not modified/i.test(error.message)) throw error
    })
  }

  private formatTime = (ms: number) =>
    new Intl.DateTimeFormat('es-ES', { timeStyle: 'short', timeZone: this.ctx.timezone }).format(new Date(ms))

  private now() {
    return this.ctx.now ?? Date.now()
  }

  private isAllowed(userId: number | undefined) {
    return userId != null && this.allowed.includes(String(userId))
  }

  async handle(update: TgUpdate): Promise<void> {
    if (update.message) return this.onMessage(update.message)
    if (update.callback_query) return this.onCallback(update.callback_query)
  }

  // --- Mensajes ---

  private async onMessage(msg: TgMessage) {
    if (msg.chat.type !== 'private') return
    const chatId = msg.chat.id
    if (!this.isAllowed(msg.from?.id)) {
      await this.send(chatId, `No estás autorizado. Tu ID de Telegram es <code>${msg.from?.id ?? '?'}</code>.`)
      return
    }
    const text = msg.text ?? msg.caption ?? ''
    if (/^\/(start|ayuda|help)\b/i.test(text)) {
      await this.send(chatId, HELP_TEXT)
      return
    }

    if (msg.reply_to_message) {
      const draft = await this.ctx.db.query.intakeDrafts.findFirst({
        where: and(
          eq(intakeDrafts.chatId, String(chatId)),
          eq(intakeDrafts.cardMessageId, msg.reply_to_message.message_id),
        ),
      })
      if (draft) return this.editDraft(draft, text)
    }

    const urls = extractUrls(text, msg.entities ?? msg.caption_entities)
    const picked = pickAmazonUrl(urls)
    if (!picked) {
      await this.send(chatId, 'No veo ningún enlace de Amazon. Compárteme un producto desde la app de Amazon o pega su enlace de amazon.es.')
      return
    }
    const resolved = await resolvePickedUrl(picked, this.ctx.fetchFn)
    if (!resolved) {
      await this.send(chatId, 'No he podido sacar el ASIN de ese enlace. Prueba con el enlace completo de amazon.es.')
      return
    }
    const { asin, affiliateLink } = resolved

    const { priceCents: typedPrice, rest } = extractPrice(text)
    let product: ProductLookup | null = null
    let warning: string | null = null
    try {
      product = await lookupProduct(asin, { fetchFn: this.ctx.fetchFn })
      if (product.priceCents == null && typedPrice == null) warning = 'Amazon no muestra precio; responde con él si lo sabes'
    } catch (error) {
      warning = error instanceof ProductLookupError ? error.message : `No se ha podido leer Amazon: ${(error as Error).message}`
    }
    // Un precio escrito en el mensaje manda sobre el leído de Amazon
    const priceCents = typedPrice ?? product?.priceCents ?? null
    const draft = {
      id: shortId(),
      chatId: String(chatId),
      userId: String(msg.from!.id),
      asin,
      title: product?.title ?? guessTitle(rest, urls),
      brand: product?.brand ?? null,
      note: '',
      priceCents,
      basisPriceCents: product?.basisPriceCents ?? null,
      basisType: product?.basisType ?? null,
      features: product?.features ?? [],
      affiliateUrl: affiliateLink?.url ?? null,
      affiliateTag: affiliateLink?.tag ?? null,
    }
    await this.ctx.db.insert(intakeDrafts).values(draft)
    const card = draftCard(draft, await this.manualThemes(), { warning })
    const sent = await this.send(chatId, card.text, card.keyboard)
    await this.ctx.db
      .update(intakeDrafts)
      .set({ cardMessageId: sent.message_id })
      .where(eq(intakeDrafts.id, draft.id))
  }

  private async manualThemes() {
    return (await listThemes(this.ctx.db))
      .filter((t) => t.active && t.provider === 'manual')
      .map((t) => ({ id: t.id, name: t.name }))
  }

  private async editDraft(draft: typeof intakeDrafts.$inferSelect, text: string) {
    if (draft.queuedAt || draft.cancelledAt) {
      await this.send(draft.chatId, 'Esa oferta ya no es un borrador. Gestiónala con los botones o en el panel.')
      return
    }
    const edit = parseDraftReply(text)
    if (!edit) return
    const changes =
      edit.field === 'price'
        ? { priceCents: edit.priceCents }
        : edit.field === 'title'
          ? { title: edit.title }
          : edit.field === 'features'
            ? { features: edit.features }
            : { note: edit.note }
    await this.ctx.db.update(intakeDrafts).set(changes).where(eq(intakeDrafts.id, draft.id))
    const updated = { ...draft, ...changes }
    const card = draftCard(updated, await this.manualThemes())
    if (draft.cardMessageId) await this.edit(draft.chatId, draft.cardMessageId, card.text, card.keyboard)
  }

  // --- Botones ---

  private async onCallback(cq: TgCallbackQuery) {
    const answer = (text: string, alert = false) =>
      this.api('answerCallbackQuery', { callback_query_id: cq.id, text: text.slice(0, 200), show_alert: alert })
    if (!this.isAllowed(cq.from.id)) return void (await answer('No autorizado', true))
    const cb = cq.data ? decodeCallback(cq.data) : null
    if (!cb) return void (await answer('Botón no válido'))

    try {
      switch (cb.kind) {
        case 'theme':
          return void (await answer(await this.queueDraft(cb.draftId, cb.themeId), true))
        case 'cancel': {
          const draft = await this.ctx.db.query.intakeDrafts.findFirst({ where: eq(intakeDrafts.id, cb.draftId) })
          if (draft && !draft.queuedAt) {
            await this.ctx.db.update(intakeDrafts).set({ cancelledAt: this.now() }).where(eq(intakeDrafts.id, draft.id))
            if (draft.cardMessageId) await this.edit(draft.chatId, draft.cardMessageId, '✖️ Cancelado')
          }
          return void (await answer('Cancelado'))
        }
        default:
          return void (await answer(await this.publicationAction(cb.kind, cb.publicationId, cq), false))
      }
    } catch (error) {
      const message =
        error instanceof QueueError || error instanceof TransitionError
          ? error.message
          : `Error: ${(error as Error).message}`
      await answer(message, true)
    }
  }

  private queueContext() {
    return { timezone: this.ctx.timezone, env: this.ctx.env, now: this.ctx.now }
  }

  private async queueDraft(draftId: string, themeId: string): Promise<string> {
    const db = this.ctx.db
    const draft = await db.query.intakeDrafts.findFirst({ where: eq(intakeDrafts.id, draftId) })
    if (!draft || draft.cancelledAt) return 'Ese borrador ya no existe'
    if (draft.queuedAt) return 'Ya está en la cola'
    if (!draft.title) return 'Falta el título: responde a la tarjeta con «t: título»'
    const theme = await getTheme(db, themeId)
    if (!theme || theme.provider !== 'manual' || !theme.active) return 'Esa temática ya no admite altas manuales'

    const startedAt = this.now()
    await addManualProduct(db, {
      themeId,
      asin: draft.asin,
      title: draft.title,
      brand: draft.brand,
      note: withFeatureBullets(draft.note, draft.features),
      priceCents: draft.priceCents,
      basisPriceCents: draft.priceCents != null ? draft.basisPriceCents : null,
      basisType: draft.basisType,
      affiliateUrl: draft.affiliateUrl,
      affiliateTag: draft.affiliateTag,
    })
    const { runId } = await withRun(db, 'scan', 'manual', themeId, (log) =>
      scanTheme(db, theme, log, {
        timezone: this.ctx.timezone,
        copywriter: createCopywriter(this.ctx.env),
        now: this.ctx.now,
      }),
    )
    const ids = await this.createdPublications(draft.asin, themeId, startedAt)

    if (ids.length === 0) {
      const run = await db.query.runs.findFirst({ where: (r, { eq: e }) => e(r.id, runId) })
      const why = run?.errors.join(' · ') || 'no se creó ninguna candidata'
      return `No se ha metido en la cola: ${why}`
    }
    await db
      .update(intakeDrafts)
      .set({ themeId, publicationIds: ids, queuedAt: this.now() })
      .where(eq(intakeDrafts.id, draft.id))
    await this.refreshQueuedCard({ ...draft, themeId, publicationIds: ids })
    return `En la cola de ${ids.length} canal${ids.length === 1 ? '' : 'es'}`
  }

  /** Publicaciones de la oferta que acaba de crear el escaneo (no otras anteriores del mismo ASIN). */
  private async createdPublications(asin: string, themeId: string, since: number): Promise<string[]> {
    const [deal] = await this.ctx.db
      .select({ id: deals.id })
      .from(deals)
      .where(and(eq(deals.asin, asin), eq(deals.themeId, themeId), gte(deals.detectedAt, since - 1000)))
      .orderBy(desc(deals.detectedAt))
      .limit(1)
    if (!deal) return []
    const pubs = await this.ctx.db
      .select({ id: publications.id })
      .from(publications)
      .where(eq(publications.dealId, deal.id))
    return pubs.map((p) => p.id)
  }

  private async refreshQueuedCard(draft: { chatId: string; cardMessageId: number | null; title: string | null; priceCents: number | null; themeId: string | null; publicationIds: string[] }) {
    if (!draft.cardMessageId || draft.publicationIds.length === 0) return
    const pubs = await this.ctx.db
      .select({
        id: publications.id,
        channelName: channels.name,
        channelType: channels.type,
        channelIdentifier: channels.identifier,
        status: publications.status,
        needsReview: publications.needsReview,
        reviewReason: publications.reviewReason,
        scheduledAt: publications.scheduledAt,
        publishedAt: publications.publishedAt,
        error: publications.error,
      })
      .from(publications)
      .innerJoin(channels, eq(publications.channelId, channels.id))
      .where(inArray(publications.id, draft.publicationIds))
    const theme = draft.themeId ? await getTheme(this.ctx.db, draft.themeId) : null
    const card = queuedCard(
      { title: draft.title ?? '', themeName: theme?.name ?? '', priceCents: draft.priceCents },
      pubs.map(({ channelIdentifier, ...p }) => ({
        ...p,
        automatic: isAutomaticChannel({ type: p.channelType, identifier: channelIdentifier }, this.ctx.env),
      })),
      {
        formatTime: this.formatTime,
        nextCycle: nextTick(this.now()),
        panelUrl: this.ctx.origin ? `${this.ctx.origin}/cola` : null,
      },
    )
    await this.edit(draft.chatId, draft.cardMessageId, card.text, card.keyboard)
  }

  private async publicationAction(
    kind: 'publish' | 'next' | 'discard' | 'text' | 'done',
    publicationId: string,
    cq: TgCallbackQuery,
  ): Promise<string> {
    const db = this.ctx.db
    const draft = await db.query.intakeDrafts.findFirst({
      where: like(intakeDrafts.publicationIds, `%"${publicationId}"%`),
    })
    let reply: string
    switch (kind) {
      case 'publish':
      case 'done': {
        // 🚀 sends (automatic channels); ✅ only marks what the user already shared (assisted).
        const result = await publish(db, publicationId, this.queueContext(), kind === 'publish' ? 'send' : 'mark')
        reply = result.published ? 'Publicada ✅' : `Requiere revisión: ${result.item.reviewReason ?? 'cambio de precio'}`
        break
      }
      case 'next': {
        const item = await applyAction(db, publicationId, 'schedule', { scheduledAt: nextTick(this.now()) }, this.queueContext())
        reply = `Se publicará a las ${this.formatTime(item.scheduledAt!)}`
        break
      }
      case 'discard':
        await applyAction(db, publicationId, 'discard', {}, this.queueContext())
        reply = 'Descartada'
        break
      case 'text': {
        const pub = await db.query.publications.findFirst({ where: eq(publications.id, publicationId) })
        if (!pub) return 'No encontrada'
        // Texto tal cual (formato WhatsApp) para copiarlo o reenviarlo
        await this.send(cq.message?.chat.id ?? draft?.chatId ?? '', pub.text, undefined, false)
        return 'Te he enviado el texto: cópialo y publícalo, luego pulsa «✅ Hecho»'
      }
    }
    if (draft) await this.refreshQueuedCard(draft)
    return reply
  }
}

/** Comparación en tiempo constante del token secreto del webhook. */
export function safeEqual(a: string | undefined, b: string): boolean {
  if (!a || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Opciones de la Bot API del buzón (en desarrollo admite una base simulada). */
export function intakeApiOptions(env: AppEnv) {
  return { base: import.meta.dev ? env.TELEGRAM_API_BASE : undefined, retries: 2 }
}

export function intakeEnabled(env: AppEnv): boolean {
  return Boolean(env.INTAKE_BOT_TOKEN && env.INTAKE_WEBHOOK_SECRET && env.INTAKE_ALLOWED_USER_IDS)
}

