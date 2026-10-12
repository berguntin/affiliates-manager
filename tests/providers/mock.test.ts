import { describe, expect, it } from 'vitest'
import { evaluateDeal } from '../../server/domain/deals'
import { fromCreatorsItem } from '../../server/providers/creators/mapper'
import { ManualProvider } from '../../server/providers/manual'
import { MockProvider } from '../../server/providers/mock/provider'
import type { ThemeSearchQuery } from '../../server/providers/types'

const now = () => Date.UTC(2026, 9, 12, 8, 0)

const query: ThemeSearchQuery = {
  themeId: 't1',
  keywords: ['pañales'],
  browseNodes: [],
  searchIndex: 'Baby',
  minPriceCents: null,
  maxPriceCents: null,
  minSavingPercent: null,
  minRating: null,
  partnerTag: 'scan-21',
  limit: 10,
}

describe('fromCreatorsItem', () => {
  it('traduce el ejemplo oficial de OffersV2', () => {
    const snapshot = fromCreatorsItem(
      {
        asin: 'B00MNV8E0C',
        detailPageURL: 'https://www.amazon.com/dp/B00MNV8E0C?tag=example&linkCode=ogi&th=1&psc=1',
        offersV2: {
          listings: [
            {
              availability: { maxOrderQuantity: 1, minOrderQuantity: 1, type: 'IN_STOCK' },
              condition: { conditionNote: '', subCondition: 'Unknown', value: 'New' },
              dealDetails: {
                accessType: 'PRIME_EXCLUSIVE',
                endTime: '2024-11-06T05:35Z',
                percentClaimed: 38,
                startTime: '2024-11-05T18:05Z',
              },
              isBuyBoxWinner: true,
              merchantInfo: { name: 'Amazon.com' },
              price: {
                money: { amount: 59.49, currency: 'USD', displayAmount: '$59.49' },
                savingBasis: {
                  money: { amount: 69.99, currency: 'USD', displayAmount: '$69.99' },
                  savingBasisType: 'LIST_PRICE',
                  savingBasisTypeLabel: 'List Price',
                },
                savings: { money: { amount: 10.5, currency: 'USD', displayAmount: '$10.50' }, percentage: 15 },
              },
              type: 'LIGHTNING_DEAL',
              violatesMAP: false,
            },
          ],
        },
      },
      'creators_api',
      0,
    )
    expect(snapshot.offer).toEqual({
      priceCents: 5949,
      currency: 'USD',
      savingBasisCents: 6999,
      savingBasisType: 'LIST_PRICE',
      savingsPercent: 15,
      availability: 'IN_STOCK',
      condition: 'New',
      isBuyBoxWinner: true,
      dealType: 'LIGHTNING_DEAL',
      dealBadge: null,
      dealEndsAt: Date.UTC(2024, 10, 6, 5, 35),
      violatesMap: false,
    })
    expect(snapshot.title).toBe('B00MNV8E0C') // sin itemInfo, usa el ASIN
  })

  it('sin listings devuelve offer null', () => {
    expect(fromCreatorsItem({ asin: 'X', detailPageURL: 'u', offersV2: { listings: [] } }, 'mock', 0).offer).toBeNull()
  })
})

describe('MockProvider', () => {
  it('busca por palabra clave y categoría con el tag indicado', async () => {
    const results = await new MockProvider(now).search(query)
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) {
      expect(r.title.toLowerCase()).toContain('pañales')
      expect(r.detailPageUrl).toContain('tag=scan-21')
    }
  })

  it('es determinista dentro del día y la recomprobación devuelve el mismo precio', async () => {
    const provider = new MockProvider(now)
    const [a] = await provider.search(query)
    const [b] = await provider.refresh([a!.asin], 'canal-21')
    expect(b!.offer?.priceCents).toBe(a!.offer?.priceCents)
    expect(b!.detailPageUrl).toContain('tag=canal-21')
  })

  it('genera variedad de casos para la detección a lo largo de varios días', async () => {
    const reasons = new Set<string>()
    for (let d = 0; d < 20; d++) {
      const provider = new MockProvider(() => Date.UTC(2026, 9, 1 + d))
      const results = await provider.search({ ...query, keywords: [], searchIndex: 'All', limit: 100 })
      for (const s of results) {
        const ev = evaluateDeal(s, { minDiscountPct: 20, minPriceCents: null, maxPriceCents: null, excludeKeywords: [], excludeBrands: [] })
        reasons.add(ev.eligible ? (ev.suspicious ? 'sospechosa' : 'ok') : 'rechazada')
      }
    }
    expect(reasons).toEqual(new Set(['ok', 'sospechosa', 'rechazada']))
  })
})

describe('ManualProvider', () => {
  it('publica el precio introducido a mano con la hora del alta', async () => {
    const createdAt = Date.UTC(2026, 9, 12, 7, 30)
    const provider = new ManualProvider(
      {
        pendingForTheme: async () => [
          { asin: 'B08N5WRWNW', title: 'Echo Dot', brand: null, note: '', priceCents: 2999, createdAt },
        ],
        latestByAsin: async () => [],
      },
      now,
    )
    const [found] = await provider.search(query)
    expect(found!.offer?.priceCents).toBe(2999)
    expect(found!.capturedAt).toBe(createdAt)
    expect(found!.offer?.savingsPercent).toBeNull()
  })

  it('sin precio no devuelve oferta y construye el enlace con el tag del canal', async () => {
    const provider = new ManualProvider(
      {
        pendingForTheme: async () => [
          { asin: 'B08N5WRWNW', title: 'Echo Dot', brand: null, note: 'Mi nota', priceCents: null, createdAt: 1 },
        ],
        latestByAsin: async () => [
          { asin: 'B08N5WRWNW', title: 'Echo Dot', brand: null, note: '', priceCents: null, createdAt: 1 },
        ],
      },
      now,
    )
    const [found] = await provider.search(query)
    expect(found!.offer).toBeNull()
    expect(found!.note).toBe('Mi nota')
    const [refreshed] = await provider.refresh(['B08N5WRWNW'], 'canal-21')
    expect(refreshed!.detailPageUrl).toBe('https://www.amazon.es/dp/B08N5WRWNW?tag=canal-21')
  })
})
