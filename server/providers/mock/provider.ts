import type { ProductSnapshot } from '../../domain/product'
import { normalize } from '../../domain/text'
import { fromCreatorsItem } from '../creators/mapper'
import type { CreatorsItem, CreatorsListing } from '../creators/types'
import type { ProductProvider, ThemeSearchQuery } from '../types'
import { MOCK_CATALOG, type MockProduct } from './catalog'

/** FNV-1a de 32 bits. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Generador determinista (mulberry32). */
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const money = (cents: number) => ({
  amount: cents / 100,
  currency: 'EUR',
  displayAmount: `${(cents / 100).toFixed(2).replace('.', ',')} €`,
})

/**
 * Oferta simulada para un producto y un día: estable durante el día (la recomprobación
 * antes de publicar no ve cambios) y distinta de un día a otro. Cubre los casos que
 * la detección debe tratar: descuentos reales, PVP inflado, MAP, sin stock, etc.
 */
export function mockListing(product: MockProduct, day: string): CreatorsListing | null {
  const r = rng(hash(`${product.asin}|${day}`))
  const scenario = r()
  const base = product.basePriceCents
  const listing = (pctOff: number, basis: string | null, extra: Partial<CreatorsListing> = {}): CreatorsListing => {
    const price = Math.round(base * (1 - pctOff / 100))
    return {
      availability: { type: 'IN_STOCK', message: 'En stock', minOrderQuantity: 1, maxOrderQuantity: 10 },
      condition: { value: 'New', subCondition: 'Unknown', conditionNote: '' },
      isBuyBoxWinner: true,
      merchantInfo: { id: 'A1AT7YVPFBWXBL', name: 'Amazon.es' },
      price: {
        money: money(price),
        ...(basis && pctOff > 0
          ? {
              savingBasis: { money: money(base), savingBasisType: basis, savingBasisTypeLabel: basis },
              savings: { money: money(base - price), percentage: Math.round(pctOff) },
            }
          : {}),
      },
      violatesMAP: false,
      ...extra,
    }
  }
  const pct = (min: number, max: number) => Math.round(min + r() * (max - min))

  if (scenario < 0.08) return null // sin oferta destacada → sin stock
  if (scenario < 0.4) return listing(pct(10, 45), r() < 0.5 ? 'WAS_PRICE' : 'LOWEST_PRICE')
  if (scenario < 0.62) return listing(pct(15, 70), 'LIST_PRICE')
  if (scenario < 0.72) return listing(0, null)
  if (scenario < 0.82) {
    const end = new Date(`${day}T22:00:00Z`).toISOString().replace(':00.000Z', 'Z')
    return listing(pct(20, 50), 'WAS_PRICE', {
      type: 'LIGHTNING_DEAL',
      dealDetails: { accessType: 'ALL', badge: 'Oferta flash', endTime: end, percentClaimed: pct(5, 80) },
    })
  }
  if (scenario < 0.87) return listing(pct(10, 20), 'WAS_PRICE', { type: 'SUBSCRIBE_AND_SAVE' })
  if (scenario < 0.91) return listing(pct(20, 40), 'WAS_PRICE', { violatesMAP: true })
  if (scenario < 0.95) return listing(pct(20, 40), 'WAS_PRICE', { isBuyBoxWinner: false })
  return listing(pct(25, 40), 'LOWEST_PRICE')
}

/** Item con la forma exacta de la respuesta de la Creators API. */
export function mockItem(product: MockProduct, partnerTag: string, day: string): CreatorsItem {
  const listing = mockListing(product, day)
  return {
    asin: product.asin,
    detailPageURL: `https://www.amazon.es/dp/${product.asin}?tag=${encodeURIComponent(partnerTag)}&linkCode=ogi&th=1&psc=1`,
    itemInfo: {
      title: { displayValue: product.title },
      byLineInfo: { brand: { displayValue: product.brand } },
    },
    offersV2: { listings: listing ? [listing] : [] },
  }
}

export class MockProvider implements ProductProvider {
  readonly id = 'mock' as const
  readonly capabilities = { prices: true }

  constructor(private readonly now: () => number = Date.now) {}

  private day() {
    return new Date(this.now()).toISOString().slice(0, 10)
  }

  async search(query: ThemeSearchQuery): Promise<ProductSnapshot[]> {
    const day = this.day()
    const keywords = query.keywords.map(normalize).filter(Boolean)
    const byIndex = (p: MockProduct) => query.searchIndex === 'All' || p.searchIndex === query.searchIndex
    const byKeyword = (p: MockProduct) => {
      if (keywords.length === 0) return true
      const title = normalize(p.title)
      return keywords.some((k) => k.split(/\s+/).every((word) => title.includes(word)))
    }

    const capturedAt = this.now()
    return MOCK_CATALOG.filter((p) => byIndex(p) && byKeyword(p))
      .map((p) => fromCreatorsItem(mockItem(p, query.partnerTag, day), 'mock', capturedAt))
      .filter((s) => {
        // Filtros que aplicaría la propia API en la búsqueda
        const o = s.offer
        if (!o) return true
        if (query.minPriceCents != null && o.priceCents < query.minPriceCents) return false
        if (query.maxPriceCents != null && o.priceCents > query.maxPriceCents) return false
        if (query.minSavingPercent != null && (o.savingsPercent ?? 0) < query.minSavingPercent) return false
        return true
      })
      .slice(0, query.limit)
  }

  async refresh(asins: string[], partnerTag: string): Promise<ProductSnapshot[]> {
    const day = this.day()
    const capturedAt = this.now()
    return MOCK_CATALOG.filter((p) => asins.includes(p.asin)).map((p) =>
      fromCreatorsItem(mockItem(p, partnerTag, day), 'mock', capturedAt),
    )
  }
}
