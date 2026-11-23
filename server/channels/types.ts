import type { ChannelType, MessageFormat } from '../../shared/types'

export interface ChannelTarget {
  type: ChannelType
  name: string
  identifier: string
}

export interface OutgoingMessage {
  text: string
  link: string
}

export interface ChannelAdapter {
  readonly type: ChannelType
  /** automatic: publica el sistema. assisted: prepara el contenido y publica la persona. */
  readonly mode: 'automatic' | 'assisted'
  readonly format: MessageFormat
  publish?(channel: ChannelTarget, message: OutgoingMessage): Promise<{ externalId: string }>
  verify?(channel: ChannelTarget): Promise<{ ok: boolean; detail: string }>
}

/** The network may have delivered the message although the send failed (5xx, dropped connection, no id). */
export class UncertainDeliveryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UncertainDeliveryError'
  }
}

export class ChannelConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChannelConfigError'
  }
}
