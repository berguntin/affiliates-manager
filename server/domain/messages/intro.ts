/**
 * Entradilla redactada por IA (SPEC §7 y §13.A.7).
 *
 * La IA solo escribe texto propio: una frase de enganche en el tono de la temática.
 * El título, la marca, el precio, el enlace y los avisos los pone el renderizador, así que
 * la entradilla no puede describir el producto ni dar cifras. Se valida antes de usarla y,
 * si no pasa, el mensaje sale solo con la plantilla.
 */

import { normalize } from '../text'

export const INTRO_MAX = 180

export interface IntroInput {
  /** Título tal cual lo da Amazon (solo como contexto; la IA no debe repetirlo). */
  title: string
  brand: string | null
  themeName: string
  tone: string
}

export const INTRO_SYSTEM_PROMPT = `Escribes la entradilla de un mensaje de ofertas de Amazon para un canal de Telegram o WhatsApp en español de España.

La entradilla es UNA frase breve de enganche (máximo ${INTRO_MAX} caracteres) que va antes de la ficha del producto. La ficha (título, marca, precio, descuento y enlace) la añade el sistema debajo, así que tú no la repites.

Reglas obligatorias (las impone la licencia de Afiliados de Amazon):
- No describas el producto ni sus características, materiales, medidas o prestaciones, y no inventes ninguna.
- No repitas ni parafrasees el título del producto.
- No escribas cifras, precios, porcentajes, descuentos ni comparaciones de precio («mínimo histórico», «nunca ha estado tan barato»…).
- No prometas envío, stock, regalos ni plazos.
- Sin enlaces, sin hashtags, sin HTML ni Markdown. Como mucho un emoji.

Sigue el tono indicado para la temática. Responde solo con la frase, sin comillas ni explicaciones.`

/** Mensaje de usuario: los datos del producto van marcados como datos, no como instrucciones. */
export function buildIntroUserMessage(input: IntroInput): string {
  const lines = [
    `Temática del canal: ${input.themeName}`,
    `Tono: ${input.tone.trim() || 'cercano y natural'}`,
    '',
    'Producto (solo como contexto; no lo describas ni lo repitas):',
    `<titulo>${input.title}</titulo>`,
  ]
  if (input.brand) lines.push(`<marca>${input.brand}</marca>`)
  lines.push('', 'Escribe la entradilla.')
  return lines.join('\n')
}

/** Afirmaciones de precio o promesas que no podemos sostener (sobre el texto normalizado). */
export const FORBIDDEN: { pattern: RegExp; label: string }[] = [
  { pattern: /\bprecios?\b/, label: 'precio' },
  { pattern: /\bdescuentos?\b/, label: 'descuento' },
  { pattern: /\brebaj(a|as|ado|ada|ados|adas)\b/, label: 'rebaja' },
  { pattern: /\bminimo historico\b/, label: 'mínimo histórico' },
  { pattern: /\bmas barat[oa]s?\b/, label: 'más barato' },
  { pattern: /\bnunca (ha estado|visto|vista)\b/, label: 'nunca visto' },
  { pattern: /\bgratis\b/, label: 'gratis' },
  { pattern: /\benvios?\b/, label: 'envío' },
  { pattern: /\bstock\b/, label: 'stock' },
  { pattern: /\bregalos?\b/, label: 'regalo' },
]

export type IntroCheck = { ok: true; intro: string } | { ok: false; reason: string }

/** Limpia y valida la entradilla. Cualquier duda → se descarta y se usa la plantilla. */
export function validateIntro(raw: string, input: Pick<IntroInput, 'title' | 'brand'>): IntroCheck {
  const intro = raw
    .trim()
    .replace(/^["'«“”]+|["'»“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!intro) return { ok: false, reason: 'vacía' }
  if (intro.length > INTRO_MAX) return { ok: false, reason: `más de ${INTRO_MAX} caracteres` }
  if (/\n/.test(raw.trim())) return { ok: false, reason: 'más de una línea' }
  if (/https?:\/\/|www\.|\.(?:es|com)\b/i.test(intro)) return { ok: false, reason: 'contiene un enlace' }
  if (/[<>*_`#[\]]/.test(intro)) return { ok: false, reason: 'contiene formato o hashtags' }
  if (/\d|€|%/.test(intro)) return { ok: false, reason: 'contiene cifras, precios o porcentajes' }

  const plain = normalize(intro)
  const forbidden = FORBIDDEN.find((f) => f.pattern.test(plain))
  if (forbidden) return { ok: false, reason: `menciona «${forbidden.label}»` }

  if (repeatsTitle(plain, normalize(input.title))) return { ok: false, reason: 'repite el título' }
  return { ok: true, intro }
}

/**
 * Considera repetición cualquier tramo de 4 palabras seguidas del título (textos ya
 * normalizados), salvo los que también estén en `allowed` (lo que escribió el usuario).
 */
export function repeatsTitle(intro: string, title: string, allowed = ''): boolean {
  const words = title.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const introWords = ` ${intro.split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')} `
  const allowedWords = ` ${allowed.split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')} `
  for (let i = 0; i + 4 <= words.length; i++) {
    const run = ` ${words.slice(i, i + 4).join(' ')} `
    if (introWords.includes(run) && !allowedWords.includes(run)) return true
  }
  return false
}
