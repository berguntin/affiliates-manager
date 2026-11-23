/** Estado de la configuración (nunca devuelve el valor de los secretos). */
export default defineEventHandler(() => {
  const env = useEnv()
  return {
    timezone: useTimezone(),
    telegramConfigured: Boolean(env.TELEGRAM_BOT_TOKEN),
    authMode: import.meta.dev && env.AUTH_DISABLED === 'true' ? 'desactivada (desarrollo)' : 'Cloudflare Access',
    creatorsApiConfigured: Boolean(env.CREATORS_CREDENTIAL_ID && env.CREATORS_CREDENTIAL_SECRET),
    anthropicConfigured: Boolean(env.ANTHROPIC_API_KEY),
  }
})
