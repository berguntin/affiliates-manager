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
  /** Amazon Creators API (docs/creators-api.md §2), credential version 3.2. */
  CREATORS_CREDENTIAL_ID?: string
  CREATORS_CREDENTIAL_SECRET?: string
  /** Store ID or tracking ID used when there is no channel tag (product lookup). */
  CREATORS_PARTNER_TAG?: string
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

/**
 * Same bindings as useEnv, but never throws (outside the Worker, e.g. in tests, it is empty).
 * Only for optional integrations that must degrade when unconfigured (the Creators API
 * factory and product lookup); everything else uses useEnv so a missing binding fails loudly.
 */
export function useOptionalEnv(): Partial<AppEnv> {
  return (globalThis as { __env__?: Partial<AppEnv> }).__env__ ?? {}
}

export function useTimezone(): string {
  return useEnv().TIMEZONE || 'Europe/Madrid'
}
