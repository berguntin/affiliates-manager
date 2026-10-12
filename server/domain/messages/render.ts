import type { MessageFormat } from '../../../shared/types'
import { truncate } from '../text'
import { renderTemplate, validateTemplate, type TemplateValues } from './template'

/** Textos exigidos por Amazon (ver docs/creators-api.md §7). No editables. */
export const LEGAL = {
  affiliate:
    'En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables.',
  priceDisclaimer:
    'Los precios y disponibilidad del Producto son precisos en la fecha y hora indicados y están sujetos a cambios. Se aplicará a la compra del producto el precio e información de disponibilidad que aparezca en Amazon.es en el momento de la compra.',
  noPrice: 'Consulta el precio actual en Amazon.',
} as const

/** Variables disponibles en las plantillas. */
export const TEMPLATE_VARIABLES = [
  'entradilla',
  'titulo',
  'marca',
  'nota',
  'enlace',
  'descuento',
  'precio_anterior',
  'pvp_recomendado',
  'oferta_flash',
  'bloque_precio',
] as const

export const FORMAT_LIMITS: Record<MessageFormat, number> = {
  'telegram-html': 4096,
  whatsapp: 4096,
}

export const TITLE_MAX = 120

export interface MessageData {
  title: string
  brand: string | null
  note: string | null
  /** Entradilla redactada por IA y ya validada (ver intro.ts). null = solo plantilla. */
  intro?: string | null
  link: string
  /** null = se publica sin precio (alta manual). */
  price: {
    priceCents: number
    savingBasisCents: number | null
    /** El precio de referencia es el PVP recomendado (no un precio anterior real). */
    basisIsListPrice: boolean
    /** Descuento a mostrar (el efectivo calculado). */
    discountPct: number | null
    dealBadge: string | null
    checkedAt: number
  } | null
  timezone: string
}

export interface RenderedMessage {
  format: MessageFormat
  text: string
  length: number
  warnings: string[]
}

interface FormatRules {
  escape: (value: string) => string
  bold: (value: string) => string
  italic: (value: string) => string
}

const RULES: Record<MessageFormat, FormatRules> = {
  'telegram-html': {
    escape: (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    bold: (v) => `<b>${v}</b>`,
    italic: (v) => `<i>${v}</i>`,
  },
  whatsapp: {
    escape: (v) => v,
    bold: (v) => `*${v}*`,
    italic: (v) => `_${v}_`,
  },
}

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })

export function formatEuros(cents: number): string {
  return euros.format(cents / 100)
}

/** "12/10/2026 a las 14:11, hora peninsular" */
export function formatCheckedAt(ms: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const zone = timezone === 'Europe/Madrid' ? 'hora peninsular' : timezone
  return `${get('day')}/${get('month')}/${get('year')} a las ${get('hour')}:${get('minute')}, ${zone}`
}

function priceBlock(data: MessageData, rules: FormatRules): string {
  if (!data.price) return `💶 ${rules.escape(LEGAL.noPrice)}`
  const when = formatCheckedAt(data.price.checkedAt, data.timezone)
  return `💶 Precio: ${rules.bold(rules.escape(formatEuros(data.price.priceCents)))} ${rules.escape(`(consultado el ${when})`)}`
}

function legalFooter(data: MessageData, rules: FormatRules): string {
  const lines = []
  if (data.price) lines.push(rules.italic(rules.escape(LEGAL.priceDisclaimer)))
  lines.push(rules.italic(rules.escape(LEGAL.affiliate)))
  return lines.join('\n\n')
}

/**
 * Renderiza un mensaje. El bloque de precio (con fecha y hora) y los avisos legales
 * los añade siempre el renderizador: no dependen de la plantilla.
 */
export function renderMessage(format: MessageFormat, template: string, data: MessageData): RenderedMessage {
  const rules = RULES[format]
  const warnings = validateTemplate(template, TEMPLATE_VARIABLES)
  const block = priceBlock(data, rules)

  const basis =
    data.price?.savingBasisCents && data.price.savingBasisCents > data.price.priceCents
      ? data.price.savingBasisCents
      : null
  const values: TemplateValues = {
    entradilla: data.intro || null,
    titulo: truncate(data.title, TITLE_MAX),
    marca: data.brand,
    nota: data.note,
    enlace: data.link,
    descuento: data.price?.discountPct && data.price.discountPct > 0 ? data.price.discountPct : null,
    // «antes» solo con un precio anterior real; el PVP recomendado se rotula como tal
    precio_anterior: basis && !data.price?.basisIsListPrice ? formatEuros(basis) : null,
    pvp_recomendado: basis && data.price?.basisIsListPrice ? formatEuros(basis) : null,
    oferta_flash: data.price?.dealBadge ?? null,
  }

  // El bloque de precio ya viene formateado: se inserta tras renderizar.
  const PLACEHOLDER = '\u0000PRECIO\u0000'
  let body = renderTemplate(template, { ...values, bloque_precio: PLACEHOLDER }, rules.escape)
  // Plantillas guardadas antes de existir {{entradilla}}: va al principio.
  if (data.intro && !/\{\{[#^]?entradilla\}\}/.test(template)) {
    body = `${rules.escape(data.intro)}\n\n${body}`
  }
  body = body.includes(PLACEHOLDER) ? body.replace(PLACEHOLDER, block) : `${body.trimEnd()}\n\n${block}`

  const escapedLink = rules.escape(data.link)
  if (!body.includes(escapedLink)) {
    body = `${body.trimEnd()}\n\n${escapedLink}`
    warnings.push('La plantilla no incluye {{enlace}}: se ha añadido al final')
  }

  const text = `${body.trimEnd()}\n\n${legalFooter(data, rules)}`.replace(/\n{3,}/g, '\n\n').trim()
  if (text.length > FORMAT_LIMITS[format]) {
    warnings.push(`El mensaje supera ${FORMAT_LIMITS[format]} caracteres`)
  }
  return { format, text, length: text.length, warnings }
}

/** Comprueba que un texto (p. ej. editado a mano) mantiene los elementos obligatorios. */
export function checkRequiredElements(text: string, opts: { link: string; withPrice: boolean }): string[] {
  const missing: string[] = []
  const plain = text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/[*_]/g, '')
  if (!plain.includes(opts.link)) missing.push('el enlace del producto')
  if (!plain.includes(LEGAL.affiliate)) missing.push('el aviso de afiliado')
  if (opts.withPrice) {
    if (!plain.includes(LEGAL.priceDisclaimer)) missing.push('el aviso de que el precio puede cambiar')
    if (!/consultado el \d{2}\/\d{2}\/\d{4} a las \d{2}:\d{2}/.test(plain)) {
      missing.push('la fecha y hora de consulta del precio')
    }
  }
  return missing
}
