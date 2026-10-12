import Anthropic from '@anthropic-ai/sdk'
import {
  INTRO_SYSTEM_PROMPT,
  buildIntroUserMessage,
  validateIntro,
  type IntroInput,
} from '../domain/messages/intro'

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
        const response = await client.beta.messages.create({
          model: COPYWRITER_MODEL,
          max_tokens: 4000,
          output_config: { effort: 'low' },
          // Si el modelo rechaza la petición, la API la reintenta con otro modelo.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: INTRO_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildIntroUserMessage(input) }],
        })
        if (response.stop_reason !== 'end_turn') {
          return { source: 'plantilla', intro: null, reason: `respuesta incompleta (${response.stop_reason})` }
        }
        const text = response.content
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('')
        const check = validateIntro(text, input)
        return check.ok
          ? { source: 'ia', intro: check.intro }
          : { source: 'plantilla', intro: null, reason: `entradilla descartada: ${check.reason}` }
      } catch (error) {
        // Con una clave no válida no tiene sentido seguir llamando en esta ejecución.
        if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
          remaining = 0
          return { source: 'plantilla', intro: null, reason: `ANTHROPIC_API_KEY rechazada (${error.status})`, error: true }
        }
        const reason =
          error instanceof Anthropic.APIError
            ? `error de la Anthropic API (${error.status ?? 'sin respuesta'})`
            : `error al llamar a la Anthropic API (${(error as Error).message})`
        return { source: 'plantilla', intro: null, reason, error: true }
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
