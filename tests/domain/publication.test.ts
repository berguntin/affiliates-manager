import { describe, expect, it } from 'vitest'
import {
  TransitionError,
  availableActions,
  computeExpiresAt,
  isExpired,
  nextStatus,
  priceChangeReason,
} from '../../server/domain/publication'

const H = 3_600_000

describe('transiciones de estado', () => {
  it('recorre el flujo completo', () => {
    expect(nextStatus('candidata', 'approve')).toBe('aprobada')
    expect(nextStatus('aprobada', 'schedule')).toBe('programada')
    expect(nextStatus('programada', 'publish')).toBe('publicada')
  })

  it('permite programar o publicar directamente desde candidata', () => {
    expect(nextStatus('candidata', 'schedule')).toBe('programada')
    expect(nextStatus('candidata', 'publish')).toBe('publicada')
  })

  it('desprogramar vuelve a aprobada', () => {
    expect(nextStatus('programada', 'unschedule')).toBe('aprobada')
  })

  it.each(['publicada', 'descartada', 'caducada'] as const)('%s es un estado final', (status) => {
    expect(() => nextStatus(status, 'publish')).toThrow(TransitionError)
    expect(() => nextStatus(status, 'edit')).toThrow(TransitionError)
    expect(availableActions(status, false)).toEqual([])
  })

  it('no se puede aprobar algo ya aprobado', () => {
    expect(() => nextStatus('aprobada', 'approve')).toThrow('No se puede aprobar una publicación en estado «aprobada»')
  })

  it('pendiente de revisión: no ofrece publicar ni programar', () => {
    expect(availableActions('aprobada', true)).toEqual(['discard', 'edit'])
    expect(availableActions('candidata', false)).toEqual(['approve', 'schedule', 'publish', 'discard', 'edit'])
  })
})

describe('caducidad', () => {
  const detected = Date.UTC(2026, 9, 12, 6)

  it('caduca a las 24 horas', () => {
    const expires = computeExpiresAt(detected, null)
    expect(expires).toBe(detected + 24 * H)
    expect(isExpired('candidata', expires, expires - 1)).toBe(false)
    expect(isExpired('candidata', expires, expires)).toBe(true)
    expect(isExpired('publicada', expires, expires + H)).toBe(false)
  })

  it('caduca antes si la oferta flash termina antes', () => {
    expect(computeExpiresAt(detected, detected + 5 * H)).toBe(detected + 5 * H)
    expect(computeExpiresAt(detected, detected + 30 * H)).toBe(detected + 24 * H)
  })
})

describe('priceChangeReason', () => {
  it('detecta cambios de precio', () => {
    expect(priceChangeReason(1999, 1999)).toBeNull()
    expect(priceChangeReason(null, null)).toBeNull()
    expect(priceChangeReason(1999, 2199)).toBe('El precio ha cambiado de 19,99 € a 21,99 €')
    expect(priceChangeReason(1999, null)).toBe('El producto ya no tiene oferta disponible')
  })
})
