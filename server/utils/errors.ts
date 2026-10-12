import { TransitionError } from '../domain/publication'
import { ProviderUnavailableError } from '../providers/types'
import { QueueError } from '../services/queue'

/** Traduce errores de dominio a respuestas HTTP con mensaje en español. */
export async function handleDomainErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof QueueError) {
      throw createError({ statusCode: error.statusCode, message: error.message })
    }
    if (error instanceof TransitionError) {
      throw createError({ statusCode: 409, message: error.message })
    }
    if (error instanceof ProviderUnavailableError) {
      throw createError({ statusCode: 503, message: error.message })
    }
    throw error
  }
}

export function queueContext() {
  const env = useEnv()
  return { timezone: useTimezone(), env }
}
