import { describe, expect, it } from 'vitest'
import { checkDedupe } from '../../server/domain/dedupe'

const DAY = 86_400_000
const now = Date.UTC(2026, 9, 12)

describe('checkDedupe', () => {
  it('permite un ASIN nunca propuesto', () => {
    expect(checkDedupe({ priceCents: 1000, previous: [], now, dedupeDays: 14 }).allowed).toBe(true)
  })

  it('bloquea un ASIN propuesto dentro de la ventana con igual o mayor precio', () => {
    const d = checkDedupe({
      priceCents: 1000,
      previous: [{ at: now - 3 * DAY, priceCents: 1000 }],
      now,
      dedupeDays: 14,
    })
    expect(d.allowed).toBe(false)
    expect(d.reason).toBe('Ya propuesto hace 3 días y el precio no ha bajado')
  })

  it('permite volver a proponerlo si el precio ha bajado más', () => {
    const d = checkDedupe({
      priceCents: 950,
      previous: [
        { at: now - 3 * DAY, priceCents: 1000 },
        { at: now - 1 * DAY, priceCents: 990 },
      ],
      now,
      dedupeDays: 14,
    })
    expect(d.allowed).toBe(true)
  })

  it('no considera propuestas fuera de la ventana', () => {
    const d = checkDedupe({
      priceCents: 2000,
      previous: [{ at: now - 15 * DAY, priceCents: 1000 }],
      now,
      dedupeDays: 14,
    })
    expect(d.allowed).toBe(true)
  })

  it('bloquea si no hay precio con el que comparar', () => {
    expect(
      checkDedupe({ priceCents: null, previous: [{ at: now - DAY, priceCents: null }], now, dedupeDays: 7 })
        .allowed,
    ).toBe(false)
  })

  it('con 0 días no deduplica', () => {
    expect(
      checkDedupe({ priceCents: 1, previous: [{ at: now, priceCents: 1 }], now, dedupeDays: 0 }).allowed,
    ).toBe(true)
  })
})
