import { WHATSAPP_NEWSLETTER_ID_RE } from '../../shared/schemas'
import type { ChannelType } from '../../shared/types'
import { TelegramAdapter } from './telegram'
import type { ChannelAdapter } from './types'
import { WhatsAppAssistedAdapter } from './whatsapp'
import { WhatsAppGatewayAdapter } from './whatsapp-gateway'

/** Env subset the channel adapters read. */
export interface ChannelEnv {
  TELEGRAM_BOT_TOKEN?: string
  WHATSAPP_GATEWAY_TOKEN?: string
  WHATSAPP_GATEWAY_URL?: string
}

export interface ChannelRef {
  type: ChannelType
  identifier: string
}

/**
 * Whether the system publishes this channel. WhatsApp is automatic only with the gateway token
 * AND a gateway channel id (`…@newsletter`); a channel kept with its share URL stays assisted.
 */
export function isAutomaticChannel(channel: ChannelRef, env: ChannelEnv): boolean {
  switch (channel.type) {
    case 'telegram':
      return true
    case 'whatsapp':
      return Boolean(env.WHATSAPP_GATEWAY_TOKEN) && WHATSAPP_NEWSLETTER_ID_RE.test(channel.identifier)
  }
}

export function getChannelAdapter(channel: ChannelRef, env: ChannelEnv): ChannelAdapter {
  switch (channel.type) {
    case 'telegram':
      return new TelegramAdapter(env.TELEGRAM_BOT_TOKEN)
    case 'whatsapp':
      return env.WHATSAPP_GATEWAY_TOKEN && isAutomaticChannel(channel, env)
        ? new WhatsAppGatewayAdapter(env.WHATSAPP_GATEWAY_TOKEN, env.WHATSAPP_GATEWAY_URL)
        : new WhatsAppAssistedAdapter()
  }
}
