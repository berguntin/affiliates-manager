/**
 * Lectura de la ficha de producto de amazon.es (respaldo cuando no hay Creators API).
 * Lógica pura: recibe el HTML y devuelve los datos que usa el alta manual.
 */
import type { ManualBasisType } from '../../shared/types'
import { normalize, truncate } from './text'

export interface ProductPageData {
  title: string | null
  brand: string | null
  priceCents: number | null
  /** Precio tachado o PVP recomendado; solo si es mayor que el precio. */
  basisPriceCents: number | null
  basisType: ManualBasisType | null
  features: string[]
}

/** Amazon ha respondido con un captcha o una página de error en lugar de la ficha. */
export function isBlockedPage(html: string): boolean {
  return (
    /\/errors\/validateCaptcha|captchacharacters|api-services-support@amazon\.com/i.test(html) ||
    !/id=["']productTitle["']/.test(html)
  )
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  euro: '€',
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return Number.isFinite(n) ? String.fromCodePoint(n) : match
    }
    return ENTITIES[code.toLowerCase()] ?? match
  })
}

/** Texto visible de un fragmento HTML, en una sola línea. */
function textOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[‎‏ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Contenido del primer elemento con ese id (sin anidar el mismo tipo de etiqueta). */
function elementById(html: string, id: string): string | null {
  const m = html.match(new RegExp(`<([a-z]+)[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)</\\1>`, 'i'))
  return m ? m[2]! : null
}

/** Bloque de HTML desde el elemento con ese id (para buscar dentro sin cerrar etiquetas). */
function sectionFrom(html: string, id: string, length = 20_000): string | null {
  const at = html.search(new RegExp(`\\bid=["']${id}["']`, 'i'))
  return at === -1 ? null : html.slice(at, at + length)
}

/** "19,99€", "1.299,99 €", "19.99" → céntimos. */
export function parseAmazonPrice(value: string): number | null {
  const text = value.replace(/[^\d.,]/g, '')
  const m = text.match(/^(\d{1,3}(?:\.\d{3})+|\d+)(?:[,.](\d{1,2}))?$/)
  if (!m) return null
  const cents = Number(m[1]!.replace(/\./g, '')) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0)
  return cents > 0 && cents < 10_000_000 ? cents : null
}

const PRICE_SECTIONS = [
  'corePriceDisplay_desktop_feature_div',
  'corePrice_desktop',
  'corePrice_feature_div',
  'apex_desktop',
]

/**
 * Price block from its id up to the next page widget (`data-feature-name`), so the search
 * neither stops halfway through a long block nor reaches prices of other offers below it.
 */
function priceBlock(html: string, id: string): string | null {
  const section = sectionFrom(html, id, 30_000)
  if (!section) return null
  const tagEnd = section.indexOf('>')
  const next = section.slice(tagEnd + 1).search(/\bdata-feature-name=/)
  return next === -1 ? section : section.slice(0, tagEnd + 1 + next)
}

function priceSections(html: string): string[] {
  return PRICE_SECTIONS.map((id) => priceBlock(html, id)).filter((s): s is string => s != null)
}

const WHOLE_FRACTION = /a-price-whole["']>([\d.]+)[\s\S]*?a-price-fraction["']>(\d+)/

/** Price of the `priceToPay` element: its offscreen text or, when empty (current layout), its whole and fraction parts. */
function priceToPay(section: string): number | null {
  const at = section.search(/<span\b[^>]*\bclass=["'][^"']*\b(?:priceToPay|apexPriceToPay)\b/)
  if (at === -1) return null
  // Stop before the struck-through price so its offscreen text is never read as the price
  const element = section.slice(at, at + 1500).split(/a-text-price|data-a-strike/)[0]!
  const offscreen = element.match(/<span class=["']a-offscreen["']>([^<]*)</)
  const fromOffscreen = offscreen ? parseAmazonPrice(decodeEntities(offscreen[1]!)) : null
  if (fromOffscreen != null) return fromOffscreen
  const whole = element.match(WHOLE_FRACTION)
  return whole ? parseAmazonPrice(`${whole[1]},${whole[2]}`) : null
}

/** Accessibility text of the price block: " 22,99 € con un ahorro del 12 % ". */
function accessiblePrice(section: string): number | null {
  const label = elementById(section, 'apex-pricetopay-accessibility-label')
  const price = label ? textOf(label).match(/\d[\d.]*(?:,\d{1,2})?\s*€/) : null
  return price ? parseAmazonPrice(price[0]) : null
}

/** Page data of the buying options: the price of the new (not used) offer. */
function newOfferAmount(html: string): number | null {
  const m = html.match(/\{[^{}]*"priceAmount"\s*:\s*(\d+(?:\.\d{1,2})?)[^{}]*"buyingOptionType"\s*:\s*"NEW"/)
  return m ? Math.round(Number(m[1]) * 100) : null
}

function findPrice(html: string, sections: string[]): number | null {
  for (const section of sections) {
    const cents = priceToPay(section) ?? accessiblePrice(section)
    if (cents != null) return cents
  }
  for (const section of sections) {
    const whole = section.match(WHOLE_FRACTION)
    if (whole) return parseAmazonPrice(`${whole[1]},${whole[2]}`)
  }
  const fromOffer = newOfferAmount(html)
  if (fromOffer != null) return fromOffer
  // Any other page data with a price, except offers that are not new (used, renewed…)
  for (const data of html.matchAll(/\{[^{}]*"priceAmount"\s*:\s*(\d+(?:\.\d{1,2})?)[^{}]*\}/g)) {
    if (!/"buyingOptionType"/.test(data[0])) return Math.round(Number(data[1]) * 100)
  }
  return null
}

/** Struck-through prices, in page order, whatever other classes the element has. */
const STRIKE_PRICE =
  /<span\b(?=[^>]*\bclass=["'][^"']*\ba-text-price\b)(?=[^>]*\bdata-a-strike=["']true["'])[^>]*>\s*<span class=["']a-offscreen["']>([^<]+)</g

/**
 * Type of reference price from its normalized label. An unknown label is not assumed to be a
 * real previous price: the caller falls back to LIST_PRICE, the conservative choice.
 */
function basisTypeOf(label: string): ManualBasisType | null {
  if (/recomendado|p\.?\s?v\.?\s?p\b/.test(label)) return 'LIST_PRICE'
  if (/anterior|mas bajo|antes\b/.test(label)) return 'WAS_PRICE'
  return null
}

/**
 * Reference price shown by Amazon next to the price: the first struck-through price that is
 * higher than the price (the one Amazon's discount refers to).
 */
function findBasis(sections: string[], priceCents: number | null): { cents: number; type: ManualBasisType } | null {
  if (priceCents == null) return null
  for (const section of sections) {
    for (const strike of section.matchAll(STRIKE_PRICE)) {
      const cents = parseAmazonPrice(decodeEntities(strike[1]!))
      if (cents == null || cents <= priceCents) continue
      // The label sits right before the price, inside the same row: «Precio recomendado:», «PVP:»,
      // «Precio anterior:», «Precio más bajo reciente:», «El precio más bajo de los últimos 30 días:»…
      const before = section.slice(Math.max(0, strike.index - 600), strike.index)
      // Look in the price's own row first and, if no label is recognised there, in the whole window
      const rowStart = before.lastIndexOf('</div>')
      const row = normalize(textOf(rowStart === -1 ? before : before.slice(rowStart + '</div>'.length)))
      return { cents, type: basisTypeOf(row) ?? basisTypeOf(normalize(textOf(before))) ?? 'LIST_PRICE' }
    }
  }
  return null
}

function findBrand(html: string): string | null {
  const byline = elementById(html, 'bylineInfo')
  if (!byline) return null
  const text = textOf(byline)
    .replace(/^visita la tienda de\s+/i, '')
    .replace(/^marca:\s*/i, '')
    .replace(/^tienda\s+/i, '')
    .trim()
  return text.length >= 1 && text.length <= 100 ? text : null
}

export const FEATURES_MAX = 5
export const FEATURE_MAX_LENGTH = 110

function findFeatures(html: string): string[] {
  const section = sectionFrom(html, 'feature-bullets') ?? sectionFrom(html, 'productFactsDesktopExpander')
  if (!section) return []
  const list = section.slice(0, section.search(/<\/ul>/i) + 1 || undefined)
  const items: string[] = []
  for (const m of list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    if (/aok-hidden|replacementPartsFitmentBullet/.test(m[0])) continue
    const text = textOf(m[1]!)
    if (text.length >= 3) items.push(text)
  }
  return items
}

export function parseProductPage(html: string): ProductPageData {
  const title = elementById(html, 'productTitle')
  const sections = priceSections(html)
  const priceCents = findPrice(html, sections)
  const basis = findBasis(sections, priceCents)
  return {
    title: title ? truncate(textOf(title), 300) || null : null,
    brand: findBrand(html),
    priceCents,
    basisPriceCents: basis?.cents ?? null,
    basisType: basis?.type ?? null,
    features: findFeatures(html),
  }
}

// --- Viñetas con emoji para el texto del mensaje ---

const FEATURE_EMOJIS: [RegExp, string][] = [
  [/bateria|autonomia|carga|recargable|usb|mah\b/, '🔋'],
  [/bluetooth|wifi|wi-fi|inalambric|conexion|app\b|aplicacion/, '📶'],
  [/sonido|audio|auricular|altavoz|cancelacion|ruido|microfono/, '🎧'],
  [/pantalla|imagen|resolucion|4k|hd\b|camara|foto/, '📺'],
  [/agua|impermeable|ipx|lavable|lavavajillas/, '💧'],
  [/temperatura|calor|termic|frio|calienta/, '🌡️'],
  [/limpi|higien|antibacter/, '🧼'],
  [/seguridad|segur|proteccion|protege|resistente|duradero|garantia/, '🛡️'],
  [/medida|tamano|dimension|\bcm\b|\bmm\b|compacto|plegable|ligero|peso|\bkg\b|\bgramos\b/, '📏'],
  [/material|algodon|acero|silicona|madera|tejido|cuero|bambu/, '🧵'],
  [/rapid|potencia|potente|velocidad|\bw\b|watios|vatios/, '⚡'],
  [/bebe|nino|infantil|recien nacido/, '👶'],
  [/mascota|perro|gato/, '🐾'],
  [/cocina|cocinar|alimento|comida|receta/, '🍳'],
  [/tiempo|minutos|horas|temporizador/, '⏱️'],
  [/ecologic|sostenible|reciclad|natural|organic/, '🌱'],
  [/regalo|incluye|pack|accesorios/, '🎁'],
  [/comodo|comodidad|ergonomic|suave/, '☁️'],
]

export function featureEmoji(feature: string): string {
  const text = normalize(feature)
  return FEATURE_EMOJIS.find(([re]) => re.test(text))?.[1] ?? '✅'
}

/**
 * Viñetas con emoji para el texto del mensaje. Las características de Amazon se recortan
 * (sin reescribirlas) y solo se usan las primeras.
 */
export function featureBullets(features: string[], max = FEATURES_MAX): string {
  return features
    .map((f) => f.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, max)
    .map((f) => `${featureEmoji(f)} ${truncate(f, FEATURE_MAX_LENGTH)}`)
    .join('\n')
}

/** Añade las viñetas al texto propio sin duplicarlas. */
export function withFeatureBullets(note: string, features: string[]): string {
  const bullets = featureBullets(features)
  if (!bullets) return note
  const current = note.trim()
  if (current.includes(bullets)) return current
  return current ? `${current}\n\n${bullets}` : bullets
}
