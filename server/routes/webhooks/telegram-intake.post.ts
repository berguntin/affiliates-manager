import { IntakeBot, intakeEnabled, safeEqual, type TgUpdate } from '../../services/intake'

/**
 * Webhook del bot buzón (SPEC §14.8). Está fuera de /api (sin el JWT de Access) porque lo
 * llama Telegram: se protege con el token secreto que Telegram envía en cada petición.
 * En Cloudflare Access, esta ruta necesita una política «Bypass» (ver README).
 */
export default defineEventHandler(async (event) => {
  const env = useEnv()
  if (!intakeEnabled(env)) throw createError({ statusCode: 404, message: 'No encontrado' })
  if (!safeEqual(getRequestHeader(event, 'x-telegram-bot-api-secret-token'), env.INTAKE_WEBHOOK_SECRET!)) {
    throw createError({ statusCode: 401, message: 'No autorizado' })
  }

  const update = (await readBody(event)) as TgUpdate
  const bot = new IntakeBot({
    db: useDb(),
    env,
    timezone: useTimezone(),
    origin: getRequestURL(event).origin,
  })
  // Se responde a Telegram enseguida (si no, reintenta) y se procesa en segundo plano.
  const work = bot.handle(update).catch((error: Error) => {
    console.error(`[buzón] update ${update.update_id}: ${error.message}`)
  })
  if (typeof event.waitUntil === 'function') event.waitUntil(work)
  else await work
  return { ok: true }
})
