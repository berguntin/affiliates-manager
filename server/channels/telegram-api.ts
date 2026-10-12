import { HttpError, fetchJsonWithRetry, type RetryOptions } from '../utils/http'

interface TelegramResponse<T> {
  ok: boolean
  result?: T
  description?: string
  parameters?: { retry_after?: number }
}

/** Llamada a la Bot API oficial con reintentos (429 con retry_after, 5xx) y errores legibles. */
export async function callTelegram<T>(
  token: string,
  method: string,
  payload: Record<string, unknown>,
  retry: RetryOptions & { base?: string } = {},
): Promise<T> {
  try {
    const res = await fetchJsonWithRetry<TelegramResponse<T>>(
      `${retry.base ?? 'https://api.telegram.org'}/bot${token}/${method}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) },
      {
        ...retry,
        retryAfter: (_r, body) => (body as TelegramResponse<T> | null)?.parameters?.retry_after ?? null,
      },
    )
    if (!res.ok || res.result === undefined) throw new Error(res.description ?? 'Respuesta no válida')
    return res.result
  } catch (error) {
    if (error instanceof HttpError) {
      const description = (error.body as TelegramResponse<T> | null)?.description
      throw new Error(`Telegram (${error.status}): ${description ?? 'error desconocido'}`)
    }
    throw error
  }
}
