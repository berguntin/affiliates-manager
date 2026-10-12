import type { RetryOptions } from '../utils/http'
import { callTelegram } from './telegram-api'
import { ChannelConfigError, type ChannelAdapter, type ChannelTarget, type OutgoingMessage } from './types'

/** Publicación automática con la Bot API oficial (el bot debe ser administrador del canal). */
export class TelegramAdapter implements ChannelAdapter {
  readonly type = 'telegram' as const
  readonly mode = 'automatic' as const
  readonly format = 'telegram-html' as const

  constructor(
    private readonly token: string | undefined,
    private readonly retry: RetryOptions = {},
  ) {}

  private async call<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    if (!this.token) throw new ChannelConfigError('Falta el secreto TELEGRAM_BOT_TOKEN')
    return callTelegram<T>(this.token, method, payload, this.retry)
  }

  /** Texto con vista previa del enlace de Amazon (sin subir imágenes, SPEC §14.3) y botón. */
  buildPayload(channel: ChannelTarget, message: OutgoingMessage) {
    return {
      chat_id: channel.identifier,
      text: message.text,
      parse_mode: 'HTML',
      link_preview_options: { url: message.link, prefer_large_media: true, show_above_text: true },
      reply_markup: { inline_keyboard: [[{ text: '🛒 Ver en Amazon', url: message.link }]] },
    }
  }

  async publish(channel: ChannelTarget, message: OutgoingMessage) {
    const result = await this.call<{ message_id: number }>('sendMessage', this.buildPayload(channel, message))
    return { externalId: String(result.message_id) }
  }

  async verify(channel: ChannelTarget) {
    try {
      const me = await this.call<{ id: number; username: string }>('getMe', {})
      const member = await this.call<{ status: string; can_post_messages?: boolean }>('getChatMember', {
        chat_id: channel.identifier,
        user_id: me.id,
      })
      const ok = member.status === 'creator' || (member.status === 'administrator' && member.can_post_messages !== false)
      return {
        ok,
        detail: ok
          ? `@${me.username} puede publicar en el canal`
          : `@${me.username} no es administrador con permiso para publicar`,
      }
    } catch (error) {
      return { ok: false, detail: (error as Error).message }
    }
  }
}
