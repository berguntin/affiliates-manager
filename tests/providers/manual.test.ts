import { describe, expect, it } from 'vitest'
import { ManualProvider, type ManualProductRecord } from '../../server/providers/manual'

const record = (overrides: Partial<ManualProductRecord> = {}): ManualProductRecord => ({
  asin: 'B08N5WRWNW',
  title: 'Auriculares',
  brand: null,
  note: '',
  priceCents: null,
  basisPriceCents: null,
  basisType: null,
  createdAt: 1,
  affiliateUrl: null,
  affiliateTag: null,
  ...overrides,
})

const provider = (r: ManualProductRecord) =>
  new ManualProvider({ pendingForTheme: async () => [r], latestByAsin: async () => [r] }, () => 2)

describe('ManualProvider links', () => {
  const own = record({ affiliateUrl: 'https://amzn.to/3AbCdEf', affiliateTag: 'canal-21' })

  it('uses the own short link only for the channel with its tracking ID', async () => {
    const p = provider(own)
    expect((await p.refresh(['B08N5WRWNW'], 'canal-21'))[0]!.detailPageUrl).toBe('https://amzn.to/3AbCdEf')
    expect((await p.refresh(['B08N5WRWNW'], 'otro-21'))[0]!.detailPageUrl).toBe(
      'https://www.amazon.es/dp/B08N5WRWNW?tag=otro-21',
    )
  })

  it('search and refresh return the same link, so publishing does not rewrite it', async () => {
    const p = provider(own)
    const [found] = await p.search({
      themeId: 't',
      keywords: [],
      browseNodes: [],
      searchIndex: 'All',
      minPriceCents: null,
      maxPriceCents: null,
      minSavingPercent: null,
      minRating: null,
      partnerTag: 'canal-21',
      limit: 5,
    })
    const [fresh] = await p.refresh(['B08N5WRWNW'], 'canal-21')
    expect(found!.detailPageUrl).toBe(fresh!.detailPageUrl)
  })

  it('uses the standard link without own short link', async () => {
    expect((await provider(record()).refresh(['B08N5WRWNW'], 'canal-21'))[0]!.detailPageUrl).toBe(
      'https://www.amazon.es/dp/B08N5WRWNW?tag=canal-21',
    )
  })
})

describe('manualProductSource.latestByAsin own link', () => {
  it('keeps the latest own short link when a newer add of the ASIN has none', async () => {
    const { manualProductSource } = await import('../../server/services/manual-products')
    const rows = [
      { ...record({ createdAt: 3 }), id: 'b', themeId: 'tb', consumedAt: null },
      { ...record({ createdAt: 2, affiliateUrl: 'https://amzn.to/3AbCdEf', affiliateTag: 'canal-21' }), id: 'a', themeId: 'ta', consumedAt: null },
    ]
    const chain = { from: () => chain, where: () => chain, orderBy: async () => rows }
    const db = { select: () => chain } as never
    const [latest] = await manualProductSource(db).latestByAsin(['B08N5WRWNW'])
    expect(latest).toMatchObject({ createdAt: 3, affiliateUrl: 'https://amzn.to/3AbCdEf', affiliateTag: 'canal-21' })
  })
})
