/**
 * Bot buzón (SPEC §14.8): lógica pura para convertir lo que se comparte desde la app de
 * Amazon en un borrador de alta manual, y para componer las tarjetas del chat.
 */
import { parseAsin } from './affiliate'
import { truncate } from './text'

/** Dominios de enlaces cortos de Amazon: solo se resuelve su redirección (nunca la página). */
export const SHORT_LINK_HOSTS = ['amzn.eu', 'amzn.to', 'a.co', 'link.amazon', 'amzlinks.in'] as const

export interface TelegramEntity {
  type: string
  offset: number
  length: number
  url?: string
}

/** URLs del mensaje: entidades de Telegram primero y, de respaldo, una expresión regular. */
export function extractUrls(text: string, entities: TelegramEntity[] = []): string[] {
  const found: string[] = []
  for (const e of entities) {
    if (e.type === 'text_link' && e.url) found.push(e.url)
    if (e.type === 'url') found.push(text.slice(e.offset, e.offset + e.length))
  }
  for (const m of text.matchAll(/https?:\/\/[^\s<>"]+/gi)) found.push(m[0])
  return [...new Set(found.map((u) => u.replace(/[).,;]+$/, '')))]
}

export function isShortLink(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    // `.amazon` es el dominio propio de Amazon (p. ej. link.amazon, el de la app al compartir)
    return (SHORT_LINK_HOSTS as readonly string[]).includes(host) || host.endsWith('.amazon')
  } catch {
    return false
  }
}

/** Primer enlace de Amazon útil: uno de amazon.es con ASIN, o un enlace corto por resolver. */
export function pickAmazonUrl(urls: string[]): { asin: string } | { shortUrl: string } | null {
  for (const url of urls) {
    const asin = parseAsin(url)
    if (asin) return { asin }
  }
  const short = urls.find(isShortLink)
  return short ? { shortUrl: short } : null
}

const PRICE_RE = /(?:€\s*)?(\d{1,3}(?:[.\s]\d{3})*|\d+)(?:[,.](\d{1,2}))?\s*(?:€|eur(?:os)?)?/i

/** "19,99", "19.99 €", "€19,99", "1.299,99 €", "20 euros" → céntimos. */
export function parsePriceCents(input: string): number | null {
  const text = input.trim()
  const m = text.match(new RegExp(`^${PRICE_RE.source}$`, 'i'))
  if (!m) return null
  const units = Number(m[1]!.replace(/[.\s]/g, ''))
  const decimals = m[2] ? Number(m[2].padEnd(2, '0')) : 0
  const cents = units * 100 + decimals
  return cents > 0 && cents < 10_000_000 ? cents : null
}

const PRICE_IN_TEXT = /(?:€\s*\d[\d.]*(?:,\d{1,2})?|\d[\d.]*(?:,\d{1,2})?\s*(?:€|eur(?:os)?\b))/i

/** Busca un precio con símbolo de euro dentro de un texto libre (p. ej. un comentario). */
export function findPriceInText(text: string): number | null {
  return extractPrice(text).priceCents
}

/** Separa un precio con € del resto del texto (para no meterlo en el título). */
export function extractPrice(text: string): { priceCents: number | null; rest: string } {
  const m = text.match(PRICE_IN_TEXT)
  const priceCents = m ? parsePriceCents(m[0]) : null
  return { priceCents, rest: priceCents != null && m ? text.replace(m[0], ' ') : text }
}

const SHARE_NOISE = [
  /^mira este producto( en amazon)?:?/i,
  /^echa un vistazo a( este producto)?:?/i,
  /^he encontrado (esto|este producto) en amazon:?/i,
  /^amazon\.es:?/i,
  /\s+en amazon(\.es)?\.?$/i,
  /\s*[|:-]\s*amazon\.es.*$/i,
]

/** Título probable a partir del texto compartido por la app de Amazon (sin URLs ni coletillas). */
export function guessTitle(text: string, urls: string[]): string | null {
  let t = text
  for (const url of urls) t = t.split(url).join(' ')
  t = t.replace(/https?:\/\/\S+/gi, ' ').replace(/\s+/g, ' ').trim()
  for (const re of SHARE_NOISE) t = t.replace(re, '').trim()
  t = t.replace(/^["«“']+|["»”']+$/g, '').trim()
  return t.length >= 3 ? truncate(t, 300) : null
}

export type DraftEdit =
  | { field: 'price'; priceCents: number | null }
  | { field: 'title'; title: string }
  | { field: 'note'; note: string }

/** Interpreta una respuesta a la tarjeta del borrador. */
export function parseDraftReply(text: string): DraftEdit | null {
  const t = text.trim()
  if (!t) return null
  if (/^(sin precio|quitar precio|-)$/i.test(t)) return { field: 'price', priceCents: null }
  const labeledPrice = t.match(/^precio\s*:?\s*(.+)$/i)
  const price = parsePriceCents(labeledPrice ? labeledPrice[1]! : t)
  if (price != null) return { field: 'price', priceCents: price }
  const title = t.match(/^(?:t|título|titulo)\s*:\s*(.+)$/is)
  if (title) return { field: 'title', title: truncate(title[1]!.trim(), 300) }
  const note = t.match(/^(?:c|comentario|nota)\s*:\s*(.*)$/is)
  return { field: 'note', note: truncate((note ? note[1]! : t).trim(), 500) }
}

export function parseAllowedUserIds(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => /^\d+$/.test(v))
}

// --- Botones (callback_data ≤ 64 bytes) ---

export type IntakeCallback =
  | { kind: 'theme'; draftId: string; themeId: string }
  | { kind: 'cancel'; draftId: string }
  | { kind: 'publish' | 'next' | 'discard' | 'text' | 'done'; publicationId: string }

const PUB_KINDS = { p: 'publish', n: 'next', d: 'discard', w: 'text', h: 'done' } as const
const PUB_CODES = Object.fromEntries(Object.entries(PUB_KINDS).map(([k, v]) => [v, k])) as Record<
  (typeof PUB_KINDS)[keyof typeof PUB_KINDS],
  string
>

export function encodeCallback(cb: IntakeCallback): string {
  switch (cb.kind) {
    case 'theme':
      return `t:${cb.draftId}:${cb.themeId}`
    case 'cancel':
      return `x:${cb.draftId}`
    default:
      return `${PUB_CODES[cb.kind]}:${cb.publicationId}`
  }
}

export function decodeCallback(data: string): IntakeCallback | null {
  const [code, a, b] = data.split(':')
  if (!code || !a) return null
  if (code === 't' && b) return { kind: 'theme', draftId: a, themeId: b }
  if (code === 'x') return { kind: 'cancel', draftId: a }
  const kind = PUB_KINDS[code as keyof typeof PUB_KINDS]
  return kind ? { kind, publicationId: a } : null
}

// --- Tarjetas (HTML de Telegram) ---

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export interface DraftView {
  id: string
  asin: string
  title: string | null
  note: string
  priceCents: number | null
}

export interface InlineButton {
  text: string
  callback_data?: string
  url?: string
}

export function draftCard(draft: DraftView, themes: { id: string; name: string }[]) {
  const lines = [
    '📥 <b>Nueva oferta</b>',
    draft.title ? `<b>${esc(draft.title)}</b>` : '⚠️ <b>Falta el título</b>: responde «t: título»',
    `ASIN: <code>${draft.asin}</code>`,
    `Precio: ${draft.priceCents != null ? esc(eur.format(draft.priceCents / 100)) : 'sin precio'}`,
    `Comentario: ${draft.note ? esc(draft.note) : '—'}`,
    '',
    '<i>Responde a este mensaje para cambiarlo: un precio (19,99), «t: título», «sin precio» o cualquier otro texto como comentario.</i>',
  ]
  if (themes.length === 0) {
    lines.push('', '⚠️ No hay temáticas activas con fuente «Alta manual». Crea una en el panel.')
  } else {
    lines.push('', 'Elige la temática para meterla en la cola:')
  }
  const keyboard: InlineButton[][] = themes.map((t) => [
    { text: `➕ ${t.name}`, callback_data: encodeCallback({ kind: 'theme', draftId: draft.id, themeId: t.id }) },
  ])
  keyboard.push([{ text: '✖️ Cancelar', callback_data: encodeCallback({ kind: 'cancel', draftId: draft.id }) }])
  return { text: lines.join('\n'), keyboard }
}

export interface QueuedPublicationView {
  id: string
  channelName: string
  channelType: 'telegram' | 'whatsapp'
  status: string
  needsReview: boolean
  reviewReason: string | null
  scheduledAt: number | null
  publishedAt: number | null
  error: string | null
}

const STATUS_TEXT: Record<string, string> = {
  candidata: 'en la cola',
  aprobada: 'aprobada',
  programada: 'programada',
  publicada: 'publicada ✅',
  descartada: 'descartada',
  caducada: 'caducada',
}

const OPEN = ['candidata', 'aprobada', 'programada']

export function queuedCard(
  info: { title: string; themeName: string; priceCents: number | null },
  pubs: QueuedPublicationView[],
  opts: { formatTime: (ms: number) => string; nextCycle: number; panelUrl: string | null },
) {
  const lines = [
    `✅ <b>En la cola</b> · ${esc(info.themeName)}`,
    `<b>${esc(info.title)}</b>`,
    info.priceCents != null ? `Precio: ${esc(eur.format(info.priceCents / 100))}` : 'Sin precio',
    '',
  ]
  const keyboard: InlineButton[][] = []
  for (const p of pubs) {
    let status = STATUS_TEXT[p.status] ?? p.status
    if (p.status === 'programada' && p.scheduledAt) status = `se publica a las ${opts.formatTime(p.scheduledAt)}`
    if (p.status === 'publicada' && p.publishedAt) status = `publicada a las ${opts.formatTime(p.publishedAt)} ✅`
    if (p.needsReview) status = `⚠️ revisar: ${p.reviewReason ?? 'cambio de precio'}`
    lines.push(`• ${p.channelType === 'telegram' ? '✈️' : '💬'} ${esc(p.channelName)}: ${esc(status)}`)
    if (p.error) lines.push(`  ❌ ${esc(p.error)}`)

    if (!OPEN.includes(p.status) || p.needsReview) continue
    const short = p.channelName.length > 18 ? `${p.channelName.slice(0, 17)}…` : p.channelName
    if (p.channelType === 'telegram') {
      const row: InlineButton[] = [
        { text: `🚀 ${short}`, callback_data: encodeCallback({ kind: 'publish', publicationId: p.id }) },
      ]
      if (p.status !== 'programada') {
        row.push({
          text: `⏰ ${opts.formatTime(opts.nextCycle)}`,
          callback_data: encodeCallback({ kind: 'next', publicationId: p.id }),
        })
      }
      row.push({ text: '🗑️', callback_data: encodeCallback({ kind: 'discard', publicationId: p.id }) })
      keyboard.push(row)
    } else {
      keyboard.push([
        { text: `📋 Texto ${short}`, callback_data: encodeCallback({ kind: 'text', publicationId: p.id }) },
        { text: '✅ Hecho', callback_data: encodeCallback({ kind: 'done', publicationId: p.id }) },
        { text: '🗑️', callback_data: encodeCallback({ kind: 'discard', publicationId: p.id }) },
      ])
    }
  }
  if (opts.panelUrl) keyboard.push([{ text: 'Abrir la cola en el panel', url: opts.panelUrl }])
  return { text: lines.join('\n').trimEnd(), keyboard }
}

export const HELP_TEXT = [
  '👋 <b>Buzón de ofertas</b>',
  '',
  '1. En la app de Amazon pulsa <b>Compartir</b> y elige este chat (o pega el enlace).',
  '2. Si quieres, responde a la tarjeta con el <b>precio</b> (19,99), un <b>comentario</b> o «t: título».',
  '3. Elige la temática: se crea en la cola con la entradilla de IA.',
  '4. Publica, programa o descarta con los botones.',
].join('\n')
