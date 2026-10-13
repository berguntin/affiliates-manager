/**
 * «Texto propio» redactado por IA a partir de las notas del usuario (alta manual).
 *
 * La IA solo amplía y pule lo que el usuario ha escrito con su experiencia u opinión:
 * no describe el producto por su cuenta ni reescribe contenido de Amazon (lo prohíbe la
 * licencia de Afiliados, docs/creators-api.md §7). El precio, el enlace y los avisos los
 * pone el renderizador. El resultado se muestra en el formulario para revisarlo antes de
 * crear la candidata.
 */

import { normalize } from '../text'
import { FORBIDDEN, repeatsTitle } from './intro'

/** Cabe en el campo «Texto propio» (máx. 500) con margen. */
export const DESCRIPTION_MAX = 480
export const NOTES_MAX = 500

export interface DescriptionInput {
  title: string
  brand: string | null
  themeName: string
  tone: string
  /** Notas rápidas del usuario: lo único que la IA puede contar. */
  notes: string
}

export const DESCRIPTION_SYSTEM_PROMPT = `Redactas el comentario personal de un mensaje de ofertas de Amazon para un canal de Telegram o WhatsApp, en español de España.

Recibes las notas rápidas de quien recomienda el producto (por qué le gusta, para quién es, cómo lo usa). Tu trabajo es convertirlas en un texto natural de 2 a 4 frases (máximo ${DESCRIPTION_MAX} caracteres) en el tono de la temática.

Reglas obligatorias (las impone la licencia de Afiliados de Amazon):
- Cuenta solo lo que dicen las notas. No añadas características, materiales, medidas, prestaciones ni opiniones que no estén en ellas, y no uses la descripción de Amazon.
- No repitas ni parafrasees el título del producto: va en la ficha, debajo.
- No menciones precios, descuentos, porcentajes ni comparaciones de precio («mínimo histórico», «nunca ha estado tan barato»…). Solo puedes usar cifras que aparezcan en las notas.
- No prometas envío, stock, regalos ni plazos.
- Sin enlaces, sin hashtags, sin HTML ni Markdown. Como mucho un emoji.
- Si las notas son muy escuetas, escribe un texto corto; no rellenes inventando.

Responde solo con el texto, sin comillas ni explicaciones.`

/** Mensaje de usuario: producto y notas van marcados como datos, no como instrucciones. */
export function buildDescriptionUserMessage(input: DescriptionInput): string {
  const lines = [
    `Temática del canal: ${input.themeName}`,
    `Tono: ${input.tone.trim() || 'cercano y natural'}`,
    '',
    'Producto (solo como contexto; no lo describas ni lo repitas):',
    `<titulo>${input.title}</titulo>`,
  ]
  if (input.brand) lines.push(`<marca>${input.brand}</marca>`)
  lines.push('', 'Notas de quien lo recomienda:', `<notas>${input.notes.trim()}</notas>`, '', 'Escribe el texto.')
  return lines.join('\n')
}

export type DescriptionCheck = { ok: true; text: string } | { ok: false; reason: string }

/** Limpia y valida el texto. Si no pasa, el usuario conserva sus notas. */
export function validateDescription(raw: string, input: Pick<DescriptionInput, 'title' | 'notes'>): DescriptionCheck {
  const text = raw
    .trim()
    .replace(/^["'«“”]+|["'»“”]+$/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')

  if (!text) return { ok: false, reason: 'vacío' }
  if (text.length > DESCRIPTION_MAX) return { ok: false, reason: `más de ${DESCRIPTION_MAX} caracteres` }
  if (/https?:\/\/|www\.|\.(?:es|com)\b/i.test(text)) return { ok: false, reason: 'contiene un enlace' }
  if (/[<>*_`#[\]]/.test(text)) return { ok: false, reason: 'contiene formato o hashtags' }
  if (/€|%/.test(text)) return { ok: false, reason: 'contiene precios o porcentajes' }

  const notes = normalize(input.notes)
  const notesNumbers = new Set(notes.match(/\d+(?:[.,]\d+)?/g) ?? [])
  const invented = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).find((n) => !notesNumbers.has(n))
  if (invented) return { ok: false, reason: `contiene una cifra que no está en las notas (${invented})` }

  const plain = normalize(text)
  const forbidden = FORBIDDEN.find((f) => f.pattern.test(plain) && !f.pattern.test(notes))
  if (forbidden) return { ok: false, reason: `menciona «${forbidden.label}»` }

  if (repeatsTitle(plain, normalize(input.title), notes)) return { ok: false, reason: 'repite el título' }
  return { ok: true, text }
}
