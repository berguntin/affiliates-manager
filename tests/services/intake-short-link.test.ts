import { describe, expect, it, vi } from 'vitest'
import { resolveProductInput, resolveShortLinkDetails } from '../../server/services/intake'

const redirect = (location: string) => new Response(null, { status: 301, headers: { location } })

describe('resolveShortLinkDetails', () => {
  it('reads the affiliate tag from the redirect, with a single request', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(redirect('https://www.amazon.es/dp/B08N5WRWNW?tag=canal-21&linkCode=ll1&ref_=as_li_ss_tl'))
    expect(await resolveShortLinkDetails('https://amzn.to/3AbCdEf', fetchFn)).toEqual({
      asin: 'B08N5WRWNW',
      tag: 'canal-21',
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('returns a null tag when the redirect has none', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(redirect('https://www.amazon.es/dp/B08N5WRWNW?ref=cm_sw'))
    expect(await resolveShortLinkDetails('https://amzn.eu/d/abc', fetchFn)).toEqual({ asin: 'B08N5WRWNW', tag: null })
  })
})

describe('resolveProductInput', () => {
  it('keeps the pasted short link when it resolves with a tag', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(redirect('https://www.amazon.es/dp/B08N5WRWNW?tag=canal-21'))
    expect(await resolveProductInput('Mira esto https://amzn.to/3AbCdEf', fetchFn)).toEqual({
      asin: 'B08N5WRWNW',
      affiliateLink: { url: 'https://amzn.to/3AbCdEf', tag: 'canal-21' },
    })
  })

  it('stores the normalized short link, without fragment or raw quotes', async () => {
    const fetchFn = vi.fn().mockResolvedValue(redirect('https://www.amazon.es/dp/B08N5WRWNW?tag=canal-21'))
    expect((await resolveProductInput('https://amzn.to/3AbCdEf#x', fetchFn))?.affiliateLink?.url).toBe(
      'https://amzn.to/3AbCdEf',
    )
    expect((await resolveProductInput('https://amzn.to/x?a="b', fetchFn))?.affiliateLink?.url).not.toContain('"')
  })

  it('does not keep a short link without tag', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(redirect('https://www.amazon.es/dp/B08N5WRWNW'))
    expect(await resolveProductInput('https://amzn.eu/d/abc', fetchFn)).toEqual({ asin: 'B08N5WRWNW', affiliateLink: null })
  })

  it('does not keep a third-party short link even if it resolves with a tag', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(redirect('https://www.amazon.es/dp/B08N5WRWNW?tag=canal-21'))
    expect(await resolveProductInput('https://amzlinks.in/B0f5YONr0', fetchFn)).toEqual({
      asin: 'B08N5WRWNW',
      affiliateLink: null,
    })
  })

  it('never keeps full amazon.es URLs or ASINs, without requests', async () => {
    const fetchFn = vi.fn()
    expect(await resolveProductInput('https://www.amazon.es/dp/B08N5WRWNW?tag=canal-21', fetchFn)).toEqual({
      asin: 'B08N5WRWNW',
      affiliateLink: null,
    })
    expect(await resolveProductInput('B08N5WRWNW', fetchFn)).toEqual({ asin: 'B08N5WRWNW', affiliateLink: null })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns null when the short link cannot be resolved', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('network'))
    expect(await resolveProductInput('https://amzn.to/3AbCdEf', fetchFn)).toBeNull()
  })
})
