export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export interface RetryOptions {
  retries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  /** Segundos de espera que indica el servicio (Retry-After, retry_after…). */
  retryAfter?: (response: Response, body: unknown) => number | null
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * fetch con reintentos solo para 429 y 5xx (y errores de red), con backoff
 * exponencial + jitter y respetando el tiempo de espera indicado por el servicio.
 * Devuelve el JSON de la respuesta o lanza HttpError.
 */
export async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3
  const base = options.baseDelayMs ?? 500
  const max = options.maxDelayMs ?? 15_000
  const sleep = options.sleep ?? defaultSleep

  for (let attempt = 0; ; attempt++) {
    let response: Response
    try {
      response = await fetch(url, init)
    } catch (error) {
      if (attempt >= retries) throw error
      await sleep(Math.min(max, base * 2 ** attempt) * (0.5 + Math.random() / 2))
      continue
    }

    const text = await response.text()
    let body: unknown = text
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      // cuerpo no JSON
    }
    if (response.ok) return body as T

    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt >= retries) {
      throw new HttpError(response.status, body, `HTTP ${response.status}`)
    }
    const hinted =
      options.retryAfter?.(response, body) ?? (Number(response.headers.get('retry-after')) || null)
    const delay = hinted != null ? hinted * 1000 : Math.min(max, base * 2 ** attempt) * (0.5 + Math.random() / 2)
    await sleep(Math.min(delay, 60_000))
  }
}
