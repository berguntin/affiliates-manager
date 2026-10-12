import { QUEUE_TICK_MINUTES, alignToTick } from '../../shared/queue-cycle'
import type { PublishWindow } from '../../shared/types'

const MINUTE = 60_000

interface LocalParts {
  dateKey: string // YYYY-MM-DD en la zona horaria
  isoDay: number // 1 = lunes … 7 = domingo
  minutes: number // minutos desde medianoche
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timezone: string) {
  let f = formatters.get(timezone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
    formatters.set(timezone, f)
  }
  return f
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

export function localParts(ms: number, timezone: string): LocalParts {
  const parts = Object.fromEntries(formatter(timezone).formatToParts(new Date(ms)).map((p) => [p.type, p.value]))
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    isoDay: WEEKDAY[parts.weekday!] ?? 1,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  }
}

/** Inicio (UTC ms) del día local que contiene `ms`. */
export function startOfLocalDay(ms: number, timezone: string): number {
  const { minutes } = localParts(ms, timezone)
  const approx = Math.floor(ms / MINUTE) * MINUTE - minutes * MINUTE
  // Corrige días con cambio de hora: retrocede hasta que cambie la fecha local.
  const key = localParts(ms, timezone).dateKey
  let t = approx
  while (localParts(t - MINUTE, timezone).dateKey === key) t -= 60 * MINUTE
  while (localParts(t, timezone).dateKey !== key) t += MINUTE
  return t
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export function isInWindows(ms: number, windows: PublishWindow[], timezone: string): boolean {
  if (windows.length === 0) return true
  const { isoDay, minutes } = localParts(ms, timezone)
  return windows.some((w) => w.days.includes(isoDay) && minutes >= toMinutes(w.start) && minutes < toMinutes(w.end))
}

export interface SlotParams {
  now: number
  windows: PublishWindow[]
  timezone: string
  /** Horas ya ocupadas (programadas o publicadas) del mismo canal y temática. */
  taken: number[]
  dailyLimit: number
  /** No programar después de este instante (caducidad). */
  deadline: number
  minGapMinutes?: number
  stepMinutes?: number
}

/** Primer hueco libre dentro de las franjas, respetando el límite diario y la separación mínima. */
export function nextSlot(params: SlotParams): number | null {
  const { now, windows, timezone, taken, dailyLimit, deadline } = params
  const gap = (params.minGapMinutes ?? 30) * MINUTE
  // Por defecto, solo horas en las que la cola se ejecuta de verdad.
  const step = (params.stepMinutes ?? QUEUE_TICK_MINUTES) * MINUTE
  const perDay = new Map<string, number>()
  for (const t of taken) {
    const key = localParts(t, timezone).dateKey
    perDay.set(key, (perDay.get(key) ?? 0) + 1)
  }

  for (let t = Math.max(alignToTick(now), Math.ceil(now / step) * step); t < deadline; t += step) {
    if (!isInWindows(t, windows, timezone)) continue
    if ((perDay.get(localParts(t, timezone).dateKey) ?? 0) >= dailyLimit) continue
    if (taken.some((x) => Math.abs(x - t) < gap)) continue
    return t
  }
  return null
}

/** ¿Cabe una publicación más en el día local de `at`? */
export function withinDailyLimit(at: number, taken: number[], dailyLimit: number, timezone: string): boolean {
  const key = localParts(at, timezone).dateKey
  return taken.filter((t) => localParts(t, timezone).dateKey === key).length < dailyLimit
}
