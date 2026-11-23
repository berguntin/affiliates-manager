import { describe, expect, it } from 'vitest'
import { affiliateTagFrom, isAffiliateShortLink, manualLink } from '../../server/domain/affiliate'
import { draftCard } from '../../server/domain/intake'
import { DEFAULT_TEMPLATES } from '../../server/domain/messages/defaults'
import { checkRequiredElements, renderMessage, type MessageData } from '../../server/domain/messages/render'
import { MESSAGE_FORMATS } from '../../shared/types'

describe('affiliateTagFrom', () => {
  it('reads the tag of an amazon.es redirect target', () => {
    expect(affiliateTagFrom('https://www.amazon.es/dp/B08N5WRWNW?tag=canal-21&linkCode=ll1')).toBe('canal-21')
  })

  it.each([
    'https://www.amazon.es/dp/B08N5WRWNW',
    'https://www.amazon.com/dp/B08N5WRWNW?tag=canal-21',
    'https://example.com/?tag=canal-21',
    'https://www.amazon.es/dp/B08N5WRWNW?tag=<x>',
    'no es una url',
  ])('returns null for %s', (url) => {
    expect(affiliateTagFrom(url)).toBeNull()
  })
})

describe('isAffiliateShortLink', () => {
  it.each(['https://amzn.to/3AbCdEf', 'https://amzn.eu/d/abc123X', 'https://a.co/d/xyz', 'https://link.amazon/B067ikL8E'])(
    'accepts %s',
    (url) => {
      expect(isAffiliateShortLink(url)).toBe(true)
    },
  )

  it.each([
    'http://amzn.to/3AbCdEf',
    'https://amzlinks.in/B067ikL8E',
    'https://bit.ly/abc',
    'https://amzn.to.evil.com/abc',
    'https://user:pw@amzn.to/abc',
    'https://amzn.to:8443/abc',
    `https://amzn.to/${'a'.repeat(300)}`,
  ])('rejects %s', (url) => {
    expect(isAffiliateShortLink(url)).toBe(false)
  })
})

describe('manualLink', () => {
  const own = { url: 'https://amzn.to/3AbCdEf', tag: 'canal-21' }

  it('keeps the own short link on the channel with the same tracking ID', () => {
    expect(manualLink('B08N5WRWNW', 'canal-21', own)).toBe('https://amzn.to/3AbCdEf')
  })

  it('uses the standard link with the channel tag on other channels or without own link', () => {
    expect(manualLink('B08N5WRWNW', 'otro-21', own)).toBe('https://www.amazon.es/dp/B08N5WRWNW?tag=otro-21')
    expect(manualLink('B08N5WRWNW', 'canal-21', null)).toBe('https://www.amazon.es/dp/B08N5WRWNW?tag=canal-21')
  })

  it('never keeps a link that is not an Amazon short link', () => {
    expect(manualLink('B08N5WRWNW', 'canal-21', { url: 'https://bit.ly/abc', tag: 'canal-21' })).toBe(
      'https://www.amazon.es/dp/B08N5WRWNW?tag=canal-21',
    )
  })
})

describe('own short link in messages', () => {
  const link = 'https://amzn.to/3AbCdEf'
  const checkedAt = Date.UTC(2026, 9, 12, 12, 11)
  const data: MessageData = {
    title: 'Pañales & más',
    brand: null,
    note: 'Ideal para la canastilla',
    link,
    price: { priceCents: 1999, savingBasisCents: null, basisIsListPrice: false, discountPct: null, dealBadge: null, checkedAt },
    timezone: 'Europe/Madrid',
  }

  it.each(MESSAGE_FORMATS)('survives the default %s template with the price timestamp', (format) => {
    const { text } = renderMessage(format, DEFAULT_TEMPLATES[format], data)
    expect(text).toContain(link)
    expect(text).toContain('14:11')
    expect(checkRequiredElements(text, { link, withPrice: true })).toEqual([])
  })

  it('escapes the Telegram HTML around the link', () => {
    const { text } = renderMessage('telegram-html', DEFAULT_TEMPLATES['telegram-html'], data)
    expect(text).toContain('Pañales &amp; más')
  })
})

describe('draftCard with own short link', () => {
  it('shows the detected tag, escaped', () => {
    const { text } = draftCard(
      { id: 'd1', asin: 'B08N5WRWNW', title: 'Auriculares', note: '', priceCents: null, affiliateTag: 'canal-21' },
      [],
    )
    expect(text).toContain('🔗 Se usará tu enlace de afiliado (tag <code>canal-21</code>)')
  })

  it('shows nothing without it', () => {
    const { text } = draftCard({ id: 'd1', asin: 'B08N5WRWNW', title: 'Auriculares', note: '', priceCents: null }, [])
    expect(text).not.toContain('🔗')
  })
})
