import type { Offer, ProductSnapshot } from '../../server/domain/product'
import type { DealFilters } from '../../server/domain/deals'

export function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    priceCents: 2000,
    currency: 'EUR',
    savingBasisCents: 3000,
    savingBasisType: 'WAS_PRICE',
    savingsPercent: 33,
    availability: 'IN_STOCK',
    condition: 'New',
    isBuyBoxWinner: true,
    dealType: null,
    dealBadge: null,
    dealEndsAt: null,
    violatesMap: false,
    ...overrides,
  }
}

export function snapshot(overrides: Partial<ProductSnapshot> = {}): ProductSnapshot {
  return {
    asin: 'B000000001',
    source: 'mock',
    capturedAt: Date.UTC(2026, 9, 12, 10, 0),
    title: 'Pañales talla 3 pack ahorro',
    brand: 'Dodot',
    detailPageUrl: 'https://www.amazon.es/dp/B000000001?tag=test-21&linkCode=ogi',
    imageUrl: null,
    offer: offer(),
    ...overrides,
  }
}

export const filters: DealFilters = {
  minDiscountPct: 20,
  minPriceCents: null,
  maxPriceCents: null,
  excludeKeywords: [],
  excludeBrands: [],
}
