import { WHATSAPP_NEWSLETTER_ID_RE } from '../../shared/schemas'
import { HttpError, fetchJsonWithRetry, type RetryOptions } from '../utils/http'
import { ChannelConfigError, UncertainDeliveryError, type ChannelAdapter, type ChannelTarget, type OutgoingMessage } from './types'

export const DEFAULT_WHATSAPP_GATEWAY_URL = 'https://gate.whapi.cloud'

interface SendResponse {
  sent?: boolean
  message?: { id?: string }
  /** Some gateway versions return the sent message under this key. */
  sent_message?: { id?: string }
}

interface HealthResponse {
  status?: { code?: number; text?: string }
}

/**
 * AUTOMATIC WhatsApp publishing through an unofficial HTTP gateway (Whapi.Cloud API shape)
 * that drives a regular WhatsApp number linked to the gateway. Owner decision 2026-11-23
 * (SPEC §14.11): Meta's Cloud API cannot post to Channels; the owner accepts the risk of the
 * number being banned. The Worker cannot keep a WhatsApp Web socket, so it only calls the gateway.
 * Only text with the Amazon link is sent; WhatsApp builds the preview (SPEC §14.3).
 */
export class WhatsAppGatewayAdapter implements ChannelAdapter {
  readonly type = 'whatsapp' as const
  readonly mode = 'automatic' as const
  readonly format = 'whatsapp' as const

  private readonly baseUrl: string

  constructor(
    private readonly token: string,
    baseUrl: string | undefined,
    private readonly retry: RetryOptions = {},
  ) {
    this.baseUrl = (baseUrl || DEFAULT_WHATSAPP_GATEWAY_URL).replace(/\/+$/, '')
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    payload?: Record<string, unknown>,
    retry: RetryOptions = {},
  ): Promise<T> {
    // The bearer token controls the linked WhatsApp number: only send it over https, never follow redirects.
    if (!isHttps(this.baseUrl)) throw new ChannelConfigError('WHATSAPP_GATEWAY_URL debe empezar por https://')
    try {
      return await fetchJsonWithRetry<T>(
        `${this.baseUrl}${path}`,
        {
          method,
          redirect: 'manual',
          headers: {
            authorization: `Bearer ${this.token}`,
            accept: 'application/json',
            ...(payload ? { 'content-type': 'application/json' } : {}),
          },
          body: payload ? JSON.stringify(payload) : undefined,
        },
        { ...this.retry, ...retry },
      )
    } catch (error) {
      if (error instanceof HttpError) {
        throw new GatewayHttpError(
          error.status < 500,
          `Pasarela de WhatsApp (${error.status}): ${describeError(error.body)}`,
        )
      }
      throw error
    }
  }

  buildPayload(channel: ChannelTarget, message: OutgoingMessage) {
    if (!WHATSAPP_NEWSLETTER_ID_RE.test(channel.identifier)) {
      throw new ChannelConfigError(
        'El identificador del canal de WhatsApp debe ser su id de la pasarela (…@newsletter)',
      )
    }
    return { to: channel.identifier, body: message.text }
  }

  async publish(channel: ChannelTarget, message: OutgoingMessage) {
    // Sending is not idempotent: a 5xx or a dropped connection may hide a delivered message,
    // so only a 429 (refused) is retried.
    const payload = this.buildPayload(channel, message)
    let result: SendResponse
    try {
      result = await this.call<SendResponse>('POST', '/messages/text', payload, { retryOnlyRateLimit: true })
    } catch (error) {
      // 4xx (including an exhausted 429) is a refusal; anything else may hide a delivered message.
      if (error instanceof ChannelConfigError || (error instanceof GatewayHttpError && error.refused)) throw error
      throw new UncertainDeliveryError((error as Error).message)
    }
    const id = result?.message?.id ?? result?.sent_message?.id
    if (result?.sent === false) throw new Error('La pasarela de WhatsApp rechazó el envío')
    if (!id) throw new UncertainDeliveryError('La pasarela de WhatsApp no confirmó el envío')
    return { externalId: id }
  }

  async verify(channel: ChannelTarget) {
    if (!WHATSAPP_NEWSLETTER_ID_RE.test(channel.identifier)) {
      return { ok: false, detail: 'El identificador debe ser el id del canal en la pasarela (…@newsletter)' }
    }
    try {
      const health = await this.call<HealthResponse>('GET', '/health?wakeup=false')
      const state = health?.status?.text ?? 'desconocido'
      const ok = state === 'AUTH'
      return {
        ok,
        detail: ok
          ? 'La pasarela tiene el número de WhatsApp conectado'
          : `La pasarela no tiene el número conectado (estado: ${state})`,
      }
    } catch (error) {
      return { ok: false, detail: (error as Error).message }
    }
  }
}

/** Gateway HTTP error with a readable message; `refused` means a 4xx (nothing was sent). */
class GatewayHttpError extends Error {
  constructor(
    readonly refused: boolean,
    message: string,
  ) {
    super(message)
    this.name = 'GatewayHttpError'
  }
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

/** Readable error from the gateway body, without echoing anything that looks like a credential. */
function describeError(body: unknown): string {
  if (body && typeof body === 'object') {
    const error = (body as { error?: { message?: unknown } | string; message?: unknown }).error
    const message =
      typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : (body as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 200)
  }
  return 'error desconocido'
}
