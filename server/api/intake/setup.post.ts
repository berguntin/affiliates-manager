import { callTelegram } from '../../channels/telegram-api'
import { intakeApiOptions, intakeEnabled } from '../../services/intake'

/** Registra el webhook del bot buzón en Telegram con la URL pública de este Worker. */
export default defineEventHandler(async (event) => {
  const env = useEnv()
  if (!intakeEnabled(env)) {
    throw createError({
      statusCode: 400,
      message: 'Configura INTAKE_BOT_TOKEN, INTAKE_WEBHOOK_SECRET e INTAKE_ALLOWED_USER_IDS con «wrangler secret put»',
    })
  }
  const url = `${getRequestURL(event).origin}/webhooks/telegram-intake`
  const token = env.INTAKE_BOT_TOKEN!
  const opts = intakeApiOptions(env)
  await callTelegram(
    token,
    'setWebhook',
    {
      url,
      secret_token: env.INTAKE_WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    },
    opts,
  )
  await callTelegram(
    token,
    'setMyCommands',
    { commands: [{ command: 'ayuda', description: 'Cómo enviar ofertas al buzón' }] },
    opts,
  )
  const me = await callTelegram<{ username: string }>(token, 'getMe', {}, opts)
  return { ok: true, url, bot: `@${me.username}` }
})
