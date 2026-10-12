import type { ChannelType } from '../../shared/types'
import { TelegramAdapter } from './telegram'
import type { ChannelAdapter } from './types'
import { WhatsAppAssistedAdapter } from './whatsapp'

export function getChannelAdapter(type: ChannelType, env: { TELEGRAM_BOT_TOKEN?: string }): ChannelAdapter {
  switch (type) {
    case 'telegram':
      return new TelegramAdapter(env.TELEGRAM_BOT_TOKEN)
    case 'whatsapp':
      return new WhatsAppAssistedAdapter()
  }
}
