import { describe, expect, it } from 'vitest'
import { isInWindows, localParts, nextSlot, startOfLocalDay, withinDailyLimit } from '../../server/domain/schedule'

const TZ = 'Europe/Madrid'
const M = 60_000
const H = 60 * M
// Lunes 12/10/2026 08:00 en Madrid (CEST, UTC+2) = 06:00 UTC
const monday8 = Date.UTC(2026, 9, 12, 6, 0)

const morning = [{ days: [1, 2, 3, 4, 5], start: '09:00', end: '11:00' }]

describe('localParts', () => {
  it('convierte a la hora local de Madrid', () => {
    expect(localParts(monday8, TZ)).toEqual({ dateKey: '2026-10-12', isoDay: 1, minutes: 8 * 60 })
  })

  it('inicio del día local, también en el cambio de hora', () => {
    expect(startOfLocalDay(monday8, TZ)).toBe(Date.UTC(2026, 9, 11, 22, 0))
    // 25/10/2026: termina el horario de verano (día de 25 horas)
    expect(startOfLocalDay(Date.UTC(2026, 9, 25, 12), TZ)).toBe(Date.UTC(2026, 9, 24, 22, 0))
  })
})

describe('franjas', () => {
  it('respeta días y horas', () => {
    expect(isInWindows(monday8, morning, TZ)).toBe(false)
    expect(isInWindows(monday8 + H, morning, TZ)).toBe(true)
    expect(isInWindows(monday8 + 3 * H, morning, TZ)).toBe(false) // 11:00 excluido
    expect(isInWindows(Date.UTC(2026, 9, 17, 8), morning, TZ)).toBe(false) // sábado
    expect(isInWindows(monday8, [], TZ)).toBe(true)
  })
})

describe('nextSlot', () => {
  const base = { now: monday8, windows: morning, timezone: TZ, taken: [], dailyLimit: 3, deadline: monday8 + 24 * H }

  it('elige el inicio de la siguiente franja', () => {
    expect(nextSlot(base)).toBe(monday8 + H) // 09:00
  })

  it('deja la separación mínima con lo ya programado', () => {
    expect(nextSlot({ ...base, taken: [monday8 + H] })).toBe(monday8 + H + 30 * M)
  })

  it('solo propone horas de ciclo de la cola aunque ahora no lo sea', () => {
    const slot = nextSlot({ ...base, now: monday8 + H + 3 * M, windows: [] })
    expect(slot).toBe(monday8 + H + 10 * M) // 09:03 → 09:10
  })

  it('respeta el límite diario y pasa al día siguiente si cabe antes del plazo', () => {
    const taken = [monday8 + H, monday8 + 90 * M, monday8 + 2 * H]
    expect(nextSlot({ ...base, taken, deadline: monday8 + 30 * H })).toBe(monday8 + 25 * H) // martes 09:00
    expect(nextSlot({ ...base, taken })).toBeNull() // el plazo (24 h) acaba antes del martes 09:00
  })

  it('withinDailyLimit cuenta por día local', () => {
    expect(withinDailyLimit(monday8, [monday8 - 9 * H], 1, TZ)).toBe(true) // domingo 23:00
    expect(withinDailyLimit(monday8, [monday8 + H], 1, TZ)).toBe(false)
  })
})
