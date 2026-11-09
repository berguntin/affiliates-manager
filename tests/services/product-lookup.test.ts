import { describe, expect, it } from 'vitest'
import type { ProductSnapshot } from '../../server/domain/product'
import { CreatorsApiClient, CreatorsApiError } from '../../server/providers/creators/client'
import { CreatorsApiProvider } from '../../server/providers/creators/provider'
import type { ProductProvider } from '../../server/providers/types'
import { ProductLookupError, lookupProduct } from '../../server/services/product-lookup'

describe('lookupProduct with the Creators API', () => {
  it('turns an API error into ProductLookupError and does not fall back to the page', async () => {
    let pageFetched = false
    const fetchFn = (async () => {
      pageFetched = true
      return new Response('')
    }) as typeof fetch
    const api: ProductProvider = {
      id: 'creators_api',
      capabilities: { prices: true },
      search: () => Promise.reject(new Error('unused')),
      refresh: () => Promise.reject(new CreatorsApiError(500, 'InternalServerException', null, 'Error de la Creators API: HTTP 500')),
    }
    const error = await lookupProduct('B08N5WRWNW', { fetchFn, api }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProductLookupError)
    expect((error as Error).message).toContain('HTTP 500')
    expect(pageFetched).toBe(false)
  })

  const snapshot = (violatesMap: boolean): ProductSnapshot => ({
    asin: 'B08N5WRWNW',
    source: 'creators_api',
    capturedAt: 0,
    title: 'Echo',
    brand: 'Amazon',
    detailPageUrl: 'u',
    imageUrl: null,
    offer: {
      priceCents: 2999,
      currency: 'EUR',
      savingBasisCents: 5999,
      savingBasisType: 'WAS_PRICE',
      savingsPercent: 50,
      availability: 'IN_STOCK',
      condition: 'New',
      isBuyBoxWinner: true,
      dealType: null,
      dealBadge: null,
      dealEndsAt: null,
      violatesMap,
    },
  })
  const apiReturning = (items: ProductSnapshot[], seen: string[] = []): ProductProvider => ({
    id: 'creators_api',
    capabilities: { prices: true },
    search: () => Promise.reject(new Error('unused')),
    refresh: async (_asins, tag) => {
      seen.push(tag)
      return items
    },
  })
  const noPage = (() => Promise.reject(new Error('page must not be fetched'))) as typeof fetch

  it('drops a MAP-restricted price', async () => {
    const result = await lookupProduct('B08N5WRWNW', { fetchFn: noPage, api: apiReturning([snapshot(true)]) })
    expect(result).toMatchObject({ source: 'creators_api', title: 'Echo', priceCents: null, basisPriceCents: null, basisType: null })
  })

  it('available API without the item: error, no page fallback', async () => {
    await expect(lookupProduct('B08N5WRWNW', { fetchFn: noPage, api: apiReturning([]) })).rejects.toBeInstanceOf(
      ProductLookupError,
    )
  })

  it('missing partner tag with credentials is a visible error, not a page fallback', async () => {
    const api = new CreatorsApiProvider({ client: new CreatorsApiClient({ credentialId: 'i', credentialSecret: 's' }, { fetchFn: noPage }) })
    const error = await lookupProduct('B08N5WRWNW', { fetchFn: noPage, api, partnerTag: '' }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProductLookupError)
    expect((error as Error).message).toContain('CREATORS_PARTNER_TAG')
  })

  it('passes the account tag to the API', async () => {
    const seen: string[] = []
    await lookupProduct('B08N5WRWNW', { fetchFn: noPage, api: apiReturning([snapshot(false)], seen), partnerTag: 'tienda-21' })
    expect(seen).toEqual(['tienda-21'])
  })
})
