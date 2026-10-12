import { describe, expect, it } from 'vitest'
import { evaluateDeal } from '../../server/domain/deals'
import { filters, offer, snapshot } from './fixtures'

describe('evaluateDeal', () => {
  it('acepta un descuento sobre precio anterior real por encima del mínimo', () => {
    const r = evaluateDeal(snapshot(), filters)
    expect(r.eligible).toBe(true)
    expect(r.reliability).toBe('reference')
    expect(r.effectiveDiscountPct).toBe(33)
    expect(r.suspicious).toBe(false)
    expect(r.score).toBe(38) // 33 + 5 por referencia fiable
  })

  it('rechaza si el descuento no llega al mínimo de la temática', () => {
    const r = evaluateDeal(snapshot({ offer: offer({ savingsPercent: 10 }) }), filters)
    expect(r.eligible).toBe(false)
    expect(r.rejections[0]).toMatch(/inferior al mínimo/)
  })

  it('calcula el % a partir del precio de referencia si Amazon no lo da', () => {
    const r = evaluateDeal(
      snapshot({ offer: offer({ savingsPercent: null, priceCents: 1500, savingBasisCents: 2000 }) }),
      filters,
    )
    expect(r.effectiveDiscountPct).toBe(25)
  })

  it('marca como sospechoso un descuento grande sobre el PVP recomendado', () => {
    const r = evaluateDeal(
      snapshot({ offer: offer({ savingBasisType: 'LIST_PRICE', savingsPercent: 60 }) }),
      filters,
    )
    expect(r.reliability).toBe('list')
    expect(r.suspicious).toBe(true)
    expect(r.eligible).toBe(true)
    expect(r.score).toBe(40) // 60 − 20 por sospechoso
  })

  it('no marca como sospechoso un descuento moderado sobre PVP', () => {
    const r = evaluateDeal(
      snapshot({ offer: offer({ savingBasisType: 'LIST_PRICE', savingsPercent: 25 }) }),
      filters,
    )
    expect(r.suspicious).toBe(false)
    expect(r.notes).toContain('Descuento calculado sobre el PVP recomendado')
  })

  it('usa el histórico externo y detecta descuentos inflados', () => {
    const r = evaluateDeal(
      snapshot({ offer: offer({ priceCents: 2000, savingsPercent: 50, savingBasisType: 'LIST_PRICE' }) }),
      filters,
      { min30Cents: 1800, median30Cents: 2400 },
    )
    expect(r.reliability).toBe('history')
    expect(r.effectiveDiscountPct).toBe(17)
    expect(r.suspicious).toBe(true)
    expect(r.eligible).toBe(false) // 17% < 20%
    expect(r.notes).toContain('No es el precio mínimo de los últimos 30 días')
  })

  it('rechaza sin referencia de descuento cuando se exige un mínimo', () => {
    const r = evaluateDeal(
      snapshot({ offer: offer({ savingBasisType: null, savingBasisCents: null, savingsPercent: null }) }),
      filters,
    )
    expect(r.eligible).toBe(false)
    expect(r.rejections).toContain('Sin precio de referencia para calcular el descuento')
  })

  it.each([
    [{ violatesMap: true }, /MAP/],
    [{ condition: 'Used' }, /no nuevo/],
    [{ dealType: 'SUBSCRIBE_AND_SAVE' as const }, /Suscríbete/],
    [{ isBuyBoxWinner: false }, /destacada/],
    [{ availability: 'OUT_OF_STOCK' }, /Disponibilidad/],
  ])('rechaza ofertas no publicables: %o', (overrides, message) => {
    const r = evaluateDeal(snapshot({ offer: offer(overrides) }), filters)
    expect(r.eligible).toBe(false)
    expect(r.rejections.join(' ')).toMatch(message)
  })

  it('aplica el rango de precio', () => {
    const tooCheap = evaluateDeal(snapshot(), { ...filters, minPriceCents: 2500 })
    const tooExpensive = evaluateDeal(snapshot(), { ...filters, maxPriceCents: 1000 })
    expect(tooCheap.rejections).toContain('Por debajo del precio mínimo')
    expect(tooExpensive.rejections).toContain('Por encima del precio máximo')
  })

  it('aplica exclusiones por palabra (sin acentos) y por marca', () => {
    expect(
      evaluateDeal(snapshot({ title: 'Pañales REACONDICIONADOS' }), {
        ...filters,
        excludeKeywords: ['reacondicionados'],
      }).eligible,
    ).toBe(false)
    expect(
      evaluateDeal(snapshot({ title: 'Panales talla 3' }), { ...filters, excludeKeywords: ['pañales'] })
        .eligible,
    ).toBe(false)
    expect(evaluateDeal(snapshot(), { ...filters, excludeBrands: ['dodot'] }).eligible).toBe(false)
  })

  it('no confunde palabras que solo contienen la exclusión', () => {
    const r = evaluateDeal(snapshot({ title: 'Cochecito compacto' }), { ...filters, excludeKeywords: ['coche'] })
    expect(r.eligible).toBe(true)
  })

  it('acepta altas manuales sin precio y las publica sin precio', () => {
    const r = evaluateDeal(snapshot({ source: 'manual', offer: null }), filters)
    expect(r.eligible).toBe(true)
    expect(r.reliability).toBe('none')
    expect(r.notes).toContain('Alta manual: se publica sin precio')
  })

  it('rechaza productos sin oferta que vienen de la API', () => {
    const r = evaluateDeal(snapshot({ offer: null }), filters)
    expect(r.eligible).toBe(false)
    expect(r.rejections).toContain('Sin oferta disponible')
  })

  it('da un extra a las ofertas flash', () => {
    const r = evaluateDeal(snapshot({ offer: offer({ dealType: 'LIGHTNING_DEAL' }) }), filters)
    expect(r.score).toBe(43)
    expect(r.notes).toContain('Oferta flash')
  })
})
