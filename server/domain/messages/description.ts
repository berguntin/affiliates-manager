/**
 * «Texto propio» redactado por IA a partir de las notas del usuario (alta manual).
 *
 * The AI writes whatever the user's notes ask for, in the theme tone, without filtering
 * their content: the owner reviews the text before creating the candidate and is the one
 * responsible for Amazon compliance when publishing (SPEC §14.9, amended 2026-11-06).
 * Price, link and legal notices are always added by the renderer. Only the length and
 * an empty answer are checked here.
 */

/** Cabe en el campo «Texto propio» (máx. 500) con margen. */
export const DESCRIPTION_MAX = 480
export const NOTES_MAX = 500

export interface DescriptionInput {
  title: string
  brand: string | null
  themeName: string
  tone: string
  /** User notes: the content the AI must write up. */
  notes: string
}

export const DESCRIPTION_SYSTEM_PROMPT = `Redactas el comentario personal de un mensaje de ofertas de Amazon para un canal de Telegram o WhatsApp, en español de España.

Recibes las notas de quien recomienda el producto. Tu trabajo es convertirlas en un texto natural y bien escrito (máximo ${DESCRIPTION_MAX} caracteres) en el tono de la temática.

- Usa todo lo que digan las notas, tal como lo pide el usuario: cifras, porcentajes, precios, características, comparaciones, envío o cualquier otro dato. No lo rechaces, no lo suavices ni lo omitas, y no añadas advertencias ni comentarios sobre normas: quien publica revisa el texto y responde de él.
- Si las notas incluyen indicaciones sobre cómo escribir el texto (longitud, estilo, qué destacar), síguelas.
- No describas el producto por tu cuenta ni reescribas su título: todo el contenido sale de las notas, y no inventes datos que no estén en ellas.
- Si se deduce de las notas, puedes terminar con una frase que diga para quién es o en qué situación encaja.
- Escribe texto plano, sin HTML ni Markdown.

Responde solo con el texto, sin comillas ni explicaciones.`

/** Mensaje de usuario: producto y notas van marcados como datos, no como instrucciones. */
export function buildDescriptionUserMessage(input: DescriptionInput): string {
  const lines = [
    `Temática del canal: ${input.themeName}`,
    `Tono: ${input.tone.trim() || 'cercano y natural'}`,
    '',
    'Producto (solo como contexto; no lo describas por tu cuenta):',
    `<titulo>${input.title}</titulo>`,
  ]
  if (input.brand) lines.push(`<marca>${input.brand}</marca>`)
  lines.push('', 'Notas de quien lo recomienda:', `<notas>${input.notes.trim()}</notas>`, '', 'Escribe el texto.')
  return lines.join('\n')
}

export type DescriptionCheck = { ok: true; text: string } | { ok: false; reason: string }

/** Cleans the text and only checks that it is not empty and fits in «Texto propio». */
export function validateDescription(raw: string): DescriptionCheck {
  const text = raw
    .trim()
    .replace(/^["'«“”]+|["'»“”]+$/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')

  if (!text) return { ok: false, reason: 'vacío' }
  if (text.length > DESCRIPTION_MAX) return { ok: false, reason: `más de ${DESCRIPTION_MAX} caracteres` }
  return { ok: true, text }
}
