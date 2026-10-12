/**
 * Ciclo de la cola: el Cron Trigger `*\/10 * * * *` publica lo programado cada 10 minutos
 * (:00, :10, :20…). Debe coincidir con `triggers.crons` (wrangler.jsonc) y
 * `nitro.scheduledTasks` (nuxt.config.ts); un test lo comprueba.
 */
export const QUEUE_TICK_MINUTES = 10

const TICK_MS = QUEUE_TICK_MINUTES * 60_000

/** Primer ciclo en o después de `ms`: la hora real a la que se publicará. */
export function alignToTick(ms: number): number {
  return Math.ceil(ms / TICK_MS) * TICK_MS
}

/** Próximo ciclo estrictamente posterior a `now`. */
export function nextTick(now: number): number {
  return Math.floor(now / TICK_MS) * TICK_MS + TICK_MS
}
