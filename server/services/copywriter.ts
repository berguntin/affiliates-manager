import Anthropic from '@anthropic-ai/sdk'
import {
  INTRO_SYSTEM_PROMPT,
  buildIntroUserMessage,
  validateIntro,
  type IntroInput,
} from '../domain/messages/intro'
import {
  DESCRIPTION_SYSTEM_PROMPT,
  buildDescriptionUserMessage,
  validateDescription,
  type DescriptionInput,
} from '../domain/messages/description'

export const COPYWRITER_MODEL = 'claude-opus-5-5'
/** Llamadas a la IA por ejecución (cada una es una subpetición del Worker). */
export const MAX_INTROS_PER_RUN = 20
const CONCURRENCY = 4

export type IntroResult =
  | { source: 'ia'; intro: string }
  /** `error`: fallo de la API (se registra en la ejecución); si no, descarte o límite. */
  | { source: 'plantilla'; intro: null; reason: string; error?: boolean }

export interface Copywriter {
  enabled: boolean
  intro(input: IntroInput): Promise<IntroResult>
}

/**
 * Redacción de entradillas con la Anthropic API. Sin `ANTHROPIC_API_KEY`, o si la
 * llamada falla o el texto no pasa la validación, devuelve `plantilla` y el mensaje
 * se publica solo con la plantilla. Se crea uno por ejecución: lleva la cuenta del tope.
 */
export function createCopywriter(env: { ANTHROPIC_API_KEY?: string }): Copywriter {
  if (!env.ANTHROPIC_API_KEY) {
    return { enabled: false, intro: async () => ({ source: 'plantilla', intro: null, reason: 'sin ANTHROPIC_API_KEY' }) }
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 1 })
  let remaining = MAX_INTROS_PER_RUN

  return {
    enabled: true,
    async intro(input) {
      if (remaining <= 0) {
        return { source: 'plantilla', intro: null, reason: `límite de ${MAX_INTROS_PER_RUN} por ejecución` }
      }
      remaining--
      try {
        const response = await complete(client, INTRO_SYSTEM_PROMPT, buildIntroUserMessage(input))
        if (!response.ok) return { source: 'plantilla', intro: null, reason: response.reason }
        const check = validateIntro(response.text, input)
        return check.ok
          ? { source: 'ia', intro: check.intro }
          : { source: 'plantilla', intro: null, reason: `entradilla descartada: ${check.reason}` }
      } catch (error) {
        // Con una clave no válida no tiene sentido seguir llamando en esta ejecución.
        if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
          remaining = 0
          return { source: 'plantilla', intro: null, reason: `ANTHROPIC_API_KEY rechazada (${error.status})`, error: true }
        }
        return { source: 'plantilla', intro: null, reason: describeError(error), error: true }
      }
    },
  }
}

/** Entradillas para varios productos con concurrencia limitada. */
export async function generateIntros<K>(
  copywriter: Copywriter,
  items: { key: K; input: IntroInput }[],
): Promise<Map<K, IntroResult>> {
  const results = new Map<K, IntroResult>()
  if (!copywriter.enabled) return results
  const queue = [...items]
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      results.set(item.key, await copywriter.intro(item.input))
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return results
}

/** Una petición al modelo; devuelve el texto solo si la respuesta terminó con normalidad. */
async function complete(
  client: Anthropic,
  system: string,
  user: string,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const response = await client.beta.messages.create({
    model: COPYWRITER_MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low' },
    // Si el modelo rechaza la petición, la API la reintenta con otro modelo.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content: user }],
  })
  if (response.stop_reason !== 'end_turn') {
    return { ok: false, reason: `respuesta incompleta (${response.stop_reason})` }
  }
  const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
  return { ok: true, text }
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return `ANTHROPIC_API_KEY rechazada (${error.status})`
  }
  return error instanceof Anthropic.APIError
    ? `error de la Anthropic API (${error.status ?? 'sin respuesta'})`
    : `error al llamar a la Anthropic API (${(error as Error).message})`
}

export type DescriptionResult = { ok: true; text: string } | { ok: false; reason: string }

/**
 * «Texto propio» a partir de las notas del usuario (alta manual en el panel).
 * Una sola llamada; si falla o no pasa la validación, el usuario conserva sus notas.
 */
export async function writeDescription(
  env: { ANTHROPIC_API_KEY?: string },
  input: DescriptionInput,
): Promise<DescriptionResult> {
  if (!env.ANTHROPIC_API_KEY) return { ok: false, reason: 'Falta configurar ANTHROPIC_API_KEY' }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 1 })
  try {
    const response = await complete(client, DESCRIPTION_SYSTEM_PROMPT, buildDescriptionUserMessage(input))
    if (!response.ok) return response
    const check = validateDescription(response.text, input)
    return check.ok ? check : { ok: false, reason: `Texto descartado: ${check.reason}. Prueba de nuevo o ajusta las notas.` }
  } catch (error) {
    return { ok: false, reason: describeError(error) }
  }
}
