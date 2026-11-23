import { z } from 'zod'
import { HttpError, fetchJsonWithRetry } from '../../utils/http'
import { ProviderUnavailableError } from '../types'

/** LwA token endpoint for credential version 3.2 (amazon.es). docs/creators-api.md §2 */
export const CREATORS_TOKEN_URL = 'https://api.amazon.co.uk/auth/o2/token'
export const CREATORS_API_BASE = 'https://creatorsapi.amazon'
export const CREATORS_MARKETPLACE = 'www.amazon.es'
/** Initial quota is 1 TPS (docs/creators-api.md §8); keep a small margin. */
export const MIN_REQUEST_INTERVAL_MS = 1100
/** Per-attempt timeout for every Creators API / LwA call. */
export const REQUEST_TIMEOUT_MS = 10_000
/** Cap on the server-requested wait (`retryAfterSeconds`) so a run stays bounded. */
export const MAX_RETRY_AFTER_S = 10
/** Renew the token this long before it expires. */
const TOKEN_MARGIN_MS = 60_000

export interface CreatorsCredentials {
  credentialId: string
  credentialSecret: string
}

export interface CreatorsClientOptions {
  fetchFn?: typeof fetch
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  minIntervalMs?: number
}

/** Non-retryable API error (400, 404…), with the `type` and `reason` the API returns. */
export class CreatorsApiError extends Error {
  constructor(
    readonly status: number,
    readonly type: string | null,
    readonly reason: string | null,
    message: string,
  ) {
    super(message)
    this.name = 'CreatorsApiError'
  }
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
})

const errorBodySchema = z.looseObject({
  type: z.string().optional(),
  reason: z.string().optional(),
  message: z.string().optional(),
  retryAfterSeconds: z.number().optional(),
})

function errorInfo(body: unknown) {
  const parsed = errorBodySchema.safeParse(body)
  return parsed.success ? parsed.data : {}
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Minimal Creators API client: LwA token cached per isolate, calls spaced to respect
 * 1 TPS (callers await each call, so they run in series within an invocation), backoff on 429/5xx (fetchJsonWithRetry), one token renewal on 401
 * and 403 mapped to ProviderUnavailableError (e.g. AssociateNotEligible).
 * Never logs or returns the secret or the token.
 */
export class CreatorsApiClient {
  private token: { value: string; expiresAt: number } | null = null
  private lastRequestAt = 0
  private readonly fetchFn: typeof fetch
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly minIntervalMs: number

  constructor(
    private readonly credentials: CreatorsCredentials,
    options: CreatorsClientOptions = {},
  ) {
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? defaultSleep
    this.minIntervalMs = options.minIntervalMs ?? MIN_REQUEST_INTERVAL_MS
  }

  /**
   * POST to an operation (`/catalog/v1/...`). No promise is shared between calls: the
   * client may outlive a request in the isolate, and only data (token, last call time) is shared.
   */
  post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.send<T>(path, body)
  }

  private async send<T>(path: string, body: Record<string, unknown>, renewed = false): Promise<T> {
    const token = await this.getToken()
    const wait = this.lastRequestAt + this.minIntervalMs - this.now()
    if (wait > 0) await this.sleep(wait)
    this.lastRequestAt = this.now()
    try {
      const result = await fetchJsonWithRetry<T>(
        `${CREATORS_API_BASE}${path}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-marketplace': CREATORS_MARKETPLACE,
          },
          body: JSON.stringify(body),
        },
        {
          fetchFn: this.fetchFn,
          sleep: this.sleep,
          retries: 3,
          timeoutMs: REQUEST_TIMEOUT_MS,
          // Backoff never goes below the 1 TPS spacing
          baseDelayMs: 2000,
          maxDelayMs: MAX_RETRY_AFTER_S * 1000,
          retryAfter: (_res, errBody) => {
            const hinted = errorInfo(errBody).retryAfterSeconds
            // Never below the 1 TPS spacing, never above the cap
            return hinted == null
              ? null
              : Math.min(Math.max(hinted, this.minIntervalMs / 1000), MAX_RETRY_AFTER_S)
          },
        },
      )
      // Retries inside fetchJsonWithRetry also count: space from the last attempt
      this.lastRequestAt = this.now()
      return result
    } catch (error) {
      this.lastRequestAt = this.now()
      if (!(error instanceof HttpError)) throw error
      const info = errorInfo(error.body)
      if (error.status === 401 && !renewed) {
        this.token = null
        return this.send<T>(path, body, true)
      }
      if (error.status === 403) {
        throw new ProviderUnavailableError(
          'creators_api',
          `La cuenta no tiene acceso a la Creators API (${info.reason ?? info.type ?? 'AccessDenied'})`,
        )
      }
      throw new CreatorsApiError(
        error.status,
        info.type ?? null,
        info.reason ?? null,
        `Error de la Creators API: HTTP ${error.status}${info.reason ? ` (${info.reason})` : info.type ? ` (${info.type})` : ''}`,
      )
    }
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value
    let raw: unknown
    try {
      raw = await fetchJsonWithRetry<unknown>(
        CREATORS_TOKEN_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: this.credentials.credentialId,
            client_secret: this.credentials.credentialSecret,
            scope: 'creatorsapi::default',
          }),
        },
        { fetchFn: this.fetchFn, sleep: this.sleep, retries: 2, timeoutMs: REQUEST_TIMEOUT_MS, maxDelayMs: 5000 },
      )
    } catch (error) {
      if (error instanceof HttpError && error.status >= 400 && error.status < 500 && error.status !== 429) {
        throw new ProviderUnavailableError(
          'creators_api',
          `Las credenciales de la Creators API no son válidas (HTTP ${error.status} al pedir el token)`,
        )
      }
      throw error
    }
    const parsed = tokenSchema.safeParse(raw)
    if (!parsed.success) {
      throw new ProviderUnavailableError('creators_api', 'Respuesta inesperada al pedir el token de la Creators API')
    }
    const ttlMs = (parsed.data.expires_in ?? 3600) * 1000
    this.token = { value: parsed.data.access_token, expiresAt: this.now() + Math.max(0, ttlMs - TOKEN_MARGIN_MS) }
    return this.token.value
  }
}
