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
  /** Bot buzón (SPEC §14.8): bot aparte que recibe enlaces. */
  INTAKE_BOT_TOKEN?: string
  /** Token secreto del webhook (cabecera X-Telegram-Bot-Api-Secret-Token). */
  INTAKE_WEBHOOK_SECRET?: string
  /** IDs numéricos de Telegram autorizados, separados por comas. */
  INTAKE_ALLOWED_USER_IDS?: string
  /** Solo para pruebas locales: base alternativa de la Bot API. */
  TELEGRAM_API_BASE?: string
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
