import { describe, expect, it } from 'vitest'
import { buildManualLink, linkHasTag, parseAsin } from '../../server/domain/affiliate'
import { slugify, truncate } from '../../server/domain/text'

describe('parseAsin', () => {
  it.each([
    ['B08N5WRWNW', 'B08N5WRWNW'],
    ['b08n5wrwnw', 'B08N5WRWNW'],
    ['https://www.amazon.es/dp/B08N5WRWNW', 'B08N5WRWNW'],
    ['https://www.amazon.es/Echo-Dot/dp/B08N5WRWNW/ref=sr_1_1?keywords=x', 'B08N5WRWNW'],
    ['https://amazon.es/gp/product/B08N5WRWNW?th=1', 'B08N5WRWNW'],
    ['https://www.amazon.es/gp/aw/d/B08N5WRWNW', 'B08N5WRWNW'],
  ])('%s → %s', (input, asin) => {
    expect(parseAsin(input)).toBe(asin)
  })

  it.each(['https://www.amazon.com/dp/B08N5WRWNW', 'https://example.com/dp/B08N5WRWNW', 'hola', 'https://amzn.eu/d/abc'])(
    'rechaza %s',
    (input) => {
      expect(parseAsin(input)).toBeNull()
    },
  )
})

describe('enlaces de afiliado', () => {
  it('construye el enlace manual con el tracking ID del canal', () => {
    const link = buildManualLink('B08N5WRWNW', 'bebetg-21')
    expect(link).toBe('https://www.amazon.es/dp/B08N5WRWNW?tag=bebetg-21')
    expect(linkHasTag(link, 'bebetg-21')).toBe(true)
    expect(linkHasTag(link, 'otro-21')).toBe(false)
  })
})

describe('texto', () => {
  it('slugify quita acentos y símbolos', () => {
    expect(slugify('  Bebé & Mamá ')).toBe('bebe-mama')
  })

  it('truncate no parte palabras', () => {
    expect(truncate('Cochecito de bebé plegable ultraligero', 20)).toBe('Cochecito de bebé…')
    expect(truncate('Corto', 20)).toBe('Corto')
  })
})
