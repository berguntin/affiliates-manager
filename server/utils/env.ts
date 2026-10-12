/// <reference types="@cloudflare/workers-types" />
/** Bindings y variables del Worker (wrangler.jsonc, .dev.vars y `wrangler secret`). */
export interface AppEnv {
  DB: D1Database
  TIMEZONE?: string
  AUTH_DISABLED?: string
  AUTH_TEAM_DOMAIN?: string
  AUTH_AUDIENCE?: string
  AUTH_ALLOWED_EMAILS?: string
  TELEGRAM_BOT_TOKEN?: string
  ANTHROPIC_API_KEY?: string
}

/**
 * Nitro guarda los bindings en `globalThis.__env__` tanto en peticiones como en el
 * handler `scheduled` y en desarrollo (proxy de wrangler).
 */
export function useEnv(): AppEnv {
  const env = (globalThis as { __env__?: Partial<AppEnv> }).__env__
  if (!env?.DB) {
    throw createError({ statusCode: 500, message: 'Binding D1 "DB" no disponible' })
  }
  return env as AppEnv
}

export function useTimezone(): string {
  return useEnv().TIMEZONE || 'Europe/Madrid'
}
