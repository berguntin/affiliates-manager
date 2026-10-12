import { callTelegram } from '../../channels/telegram-api'
import { intakeApiOptions, intakeEnabled } from '../../services/intake'

interface WebhookInfo {
  url: string
  pending_update_count: number
  last_error_message?: string
  last_error_date?: number
}

/** Estado del bot buzón: configuración y webhook registrado en Telegram. */
export default defineEventHandler(async () => {
  const env = useEnv()
  if (!intakeEnabled(env)) return { configured: false as const }
  const token = env.INTAKE_BOT_TOKEN!
  const opts = intakeApiOptions(env)
  try {
    const [me, info] = await Promise.all([
      callTelegram<{ username: string }>(token, 'getMe', {}, opts),
      callTelegram<WebhookInfo>(token, 'getWebhookInfo', {}, opts),
    ])
    return {
      configured: true as const,
      bot: `@${me.username}`,
      webhookUrl: info.url || null,
      pending: info.pending_update_count,
      lastError: info.last_error_message ?? null,
      lastErrorAt: info.last_error_date ? info.last_error_date * 1000 : null,
    }
  } catch (error) {
    return { configured: true as const, error: (error as Error).message }
  }
})
