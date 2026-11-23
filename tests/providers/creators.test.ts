import { afterEach, describe, expect, it } from 'vitest'
import { getCreatorsProvider } from '../../server/services/providers'
import { CREATORS_TOKEN_URL, CreatorsApiClient, CreatorsApiError } from '../../server/providers/creators/client'
import {
  CreatorsApiProvider,
  MAX_SEARCH_REQUESTS,
  searchFilters,
  searchParts,
} from '../../server/providers/creators/provider'
import type { CreatorsItem } from '../../server/providers/creators/types'
import { ProviderUnavailableError, type ThemeSearchQuery } from '../../server/providers/types'

interface Call {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

type Responder = (call: Call, index: number) => { status: number; body: unknown }

/** Fake fetch: records calls and answers the token endpoint automatically unless told otherwise. */
function fakeFetch(api: Responder, token: Responder = () => ({ status: 200, body: { access_token: 'tok-1', token_type: 'bearer', expires_in: 3600 } })) {
  const calls: Call[] = []
  const apiCalls: Call[] = []
  const tokenCalls: Call[] = []
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    }
    calls.push(call)
    const isToken = call.url === CREATORS_TOKEN_URL
    const list = isToken ? tokenCalls : apiCalls
    list.push(call)
    const res = (isToken ? token : api)(call, list.length - 1)
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  return { fetchFn, calls, apiCalls, tokenCalls }
}

let clock = Date.UTC(2026, 10, 9, 8, 0)
const now = () => clock
const sleeps: number[] = []
const sleep = async (ms: number) => {
  sleeps.push(ms)
  clock += ms
}

function setup(api: Responder, token?: Responder) {
  const f = fakeFetch(api, token)
  const client = new CreatorsApiClient({ credentialId: 'id', credentialSecret: 'secret' }, { fetchFn: f.fetchFn, now, sleep })
  const provider = new CreatorsApiProvider({ client, now })
  return { ...f, client, provider }
}

const item = (asin: string, tag = 'canal-21'): CreatorsItem => ({
  asin,
  detailPageURL: `https://www.amazon.es/dp/${asin}?tag=${tag}&linkCode=ogi&th=1&psc=1`,
  itemInfo: { title: { displayValue: `Producto ${asin}` }, byLineInfo: { brand: { displayValue: 'Marca' } } },
  offersV2: {
    listings: [
      {
        isBuyBoxWinner: true,
        condition: { value: 'New' },
        availability: { type: 'IN_STOCK' },
        price: {
          money: { amount: 19.99, currency: 'EUR' },
          savingBasis: { money: { amount: 29.99, currency: 'EUR' }, savingBasisType: 'LOWEST_PRICE' },
          savings: { money: { amount: 10, currency: 'EUR' }, percentage: 33 },
        },
      },
    ],
  },
})

const query: ThemeSearchQuery = {
  themeId: 't1',
  keywords: ['pañales'],
  browseNodes: [],
  searchIndex: 'Baby',
  minPriceCents: 1000,
  maxPriceCents: 5000,
  minSavingPercent: 20,
  minRating: 4.5,
  partnerTag: 'canal-21',
  limit: 50,
}

const page = (asins: string[]) => ({ status: 200, body: { searchResult: { items: asins.map((a) => item(a)) } } })
const asins = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(4, '0')}`)

describe('searchParts / searchFilters', () => {
  it('one request per keyword × node, or per node without keywords', () => {
    expect(searchParts({ keywords: ['a', ' b '], browseNodes: ['1', '2'] })).toHaveLength(4)
    expect(searchParts({ keywords: ['a', ''], browseNodes: [] })).toEqual([{ keywords: 'a' }])
    expect(searchParts({ keywords: [], browseNodes: ['123'] })).toEqual([{ browseNodeId: '123' }])
  })

  it('maps theme filters to the API (cents, integer rating 1–4, New)', () => {
    expect(searchFilters(query)).toEqual({
      searchIndex: 'Baby',
      condition: 'New',
      availability: 'Available',
      minPrice: 1000,
      maxPrice: 5000,
      minSavingPercent: 20,
      minReviewsRating: 4,
    })
    expect(searchFilters({ ...query, minPriceCents: null, maxPriceCents: null, minSavingPercent: null, minRating: null, searchIndex: '' })).toEqual({
      searchIndex: 'All',
      condition: 'New',
      availability: 'Available',
    })
  })
})

describe('CreatorsApiProvider.search', () => {
  it('sends headers, partnerTag of the channel and resources; maps items without touching the link', async () => {
    const { provider, apiCalls, tokenCalls } = setup(() => page(['B000000001', 'B000000002']))
    const results = await provider.search(query)

    expect(tokenCalls).toHaveLength(1)
    expect(tokenCalls[0]!.body).toMatchObject({ grant_type: 'client_credentials', scope: 'creatorsapi::default' })
    const call = apiCalls[0]!
    expect(call.url).toBe('https://creatorsapi.amazon/catalog/v1/searchItems')
    expect(call.headers).toMatchObject({ Authorization: 'Bearer tok-1', 'x-marketplace': 'www.amazon.es' })
    expect(call.headers.Authorization).not.toMatch(/Version/)
    expect(call.body).toMatchObject({
      keywords: 'pañales',
      partnerTag: 'canal-21',
      marketplace: 'www.amazon.es',
      itemCount: 10,
      itemPage: 1,
      languagesOfPreference: ['es_ES'],
    })
    expect(call.body.resources).toEqual(expect.arrayContaining(['offersV2.listings.price', 'itemInfo.title']))

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      asin: 'B000000001',
      source: 'creators_api',
      detailPageUrl: 'https://www.amazon.es/dp/B000000001?tag=canal-21&linkCode=ogi&th=1&psc=1',
      offer: { priceCents: 1999, savingBasisCents: 2999, savingBasisType: 'LOWEST_PRICE' },
    })
  })

  it('pages until the limit, dedupes ASINs across keywords and reuses the token', async () => {
    const { provider, apiCalls, tokenCalls } = setup((call) => {
      const p = call.body.itemPage as number
      return call.body.keywords === 'a' ? page(asins(`BA${p}`, 10)) : page(['BA10000', 'BB00000001'])
    })
    const results = await provider.search({ ...query, keywords: ['a', 'b'], limit: 25 })
    expect(results).toHaveLength(25)
    expect(apiCalls.map((c) => c.body.itemPage)).toEqual([1, 2, 3])
    expect(tokenCalls).toHaveLength(1)
  })

  it('stops paging on a short page and moves to the next keyword', async () => {
    const { provider, apiCalls } = setup((call) => (call.body.keywords === 'a' ? page(['B0A0000001']) : page(['B0B0000001'])))
    const results = await provider.search({ ...query, keywords: ['a', 'b'] })
    expect(results.map((r) => r.asin)).toEqual(['B0A0000001', 'B0B0000001'])
    expect(apiCalls).toHaveLength(2)
  })

  it(`never makes more than ${MAX_SEARCH_REQUESTS} search requests`, async () => {
    const { provider, apiCalls } = setup((call) => page(asins(`B${call.body.keywords}${call.body.itemPage}`, 10)))
    await provider.search({ ...query, keywords: ['k1', 'k2', 'k3'], limit: 1000 })
    expect(apiCalls).toHaveLength(MAX_SEARCH_REQUESTS)
  })

  it('spaces calls to respect 1 TPS', async () => {
    sleeps.length = 0
    const { provider } = setup((call) => page(asins(`BS${call.body.itemPage}`, 10)))
    await provider.search({ ...query, limit: 30 })
    expect(sleeps.filter((ms) => ms >= 1000).length).toBeGreaterThanOrEqual(2)
  })

  it('treats 404 as no results and drops malformed items', async () => {
    const { provider } = setup((call) =>
      call.body.keywords === 'nada'
        ? { status: 404, body: { type: 'ResourceNotFoundException', message: 'No results' } }
        : { status: 200, body: { searchResult: { items: [item('B0OK000001'), { asin: 'B0NOLINK01' }, null] } } },
    )
    const results = await provider.search({ ...query, keywords: ['nada', 'algo'] })
    expect(results.map((r) => r.asin)).toEqual(['B0OK000001'])
  })
})

describe('CreatorsApiProvider.refresh', () => {
  it('batches GetItems by 10 ASIN with the channel tag and skips missing ones', async () => {
    const { provider, apiCalls } = setup((call) => {
      const ids = call.body.itemIds as string[]
      return {
        status: 200,
        body: {
          itemsResult: { items: ids.filter((a) => a !== 'B000000003').map((a) => item(a, 'tg-21')) },
          errors: [{ code: 'ItemNotAccessible', message: 'B000000003' }],
        },
      }
    })
    const ids = Array.from({ length: 12 }, (_, i) => `B0000000${String(i + 1).padStart(2, '0')}`)
    const results = await provider.refresh([...ids, 'b000000001'], 'tg-21')

    expect(apiCalls.map((c) => (c.body.itemIds as string[]).length)).toEqual([10, 2])
    expect(apiCalls[0]!.url).toBe('https://creatorsapi.amazon/catalog/v1/getItems')
    expect(apiCalls[0]!.body).toMatchObject({ itemIdType: 'ASIN', partnerTag: 'tg-21', marketplace: 'www.amazon.es' })
    expect(results).toHaveLength(11)
    expect(results.every((r) => r.detailPageUrl.includes('tag=tg-21'))).toBe(true)
  })

  it('never fills in a tag on its own: an empty tag is rejected before any call', async () => {
    const { provider, calls } = setup(() => page([]))
    await expect(provider.refresh(['B000000001'], '')).rejects.toMatchObject({ reason: 'MissingPartnerTag' })
    await expect(provider.search({ ...query, partnerTag: ' ' })).rejects.toBeInstanceOf(CreatorsApiError)
    expect(calls).toHaveLength(0)
  })
})

describe('errors', () => {
  it('without credentials is unavailable, with no network calls', async () => {
    const provider = new CreatorsApiProvider({ client: null })
    await expect(provider.search(query)).rejects.toBeInstanceOf(ProviderUnavailableError)
    await expect(provider.refresh(['B000000001'], 'x')).rejects.toBeInstanceOf(ProviderUnavailableError)
  })

  it('403 AssociateNotEligible → ProviderUnavailableError (real spike response)', async () => {
    const { provider } = setup(() => ({
      status: 403,
      body: {
        type: 'AccessDeniedException',
        reason: 'AssociateNotEligible',
        message: 'Your account does not currently meet the eligibility requirements.',
      },
    }))
    const error = await provider.refresh(['B000000001'], 'x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProviderUnavailableError)
    expect((error as Error).message).toContain('AssociateNotEligible')
  })

  it('rejected credentials → ProviderUnavailableError without leaking the secret', async () => {
    const { provider } = setup(
      () => page([]),
      () => ({ status: 401, body: { error: 'invalid_client' } }),
    )
    const error = await provider.search(query).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProviderUnavailableError)
    expect((error as Error).message).not.toContain('secret')
  })

  it('401 renews the token once and retries', async () => {
    const { provider, tokenCalls, apiCalls } = setup(
      (_call, i) => (i === 0 ? { status: 401, body: { type: 'UnauthorizedException', reason: 'TokenExpired' } } : page(['B000000001'])),
      (_call, i) => ({ status: 200, body: { access_token: `tok-${i + 1}`, expires_in: 3600 } }),
    )
    const results = await provider.search({ ...query, limit: 1 })
    expect(results).toHaveLength(1)
    expect(tokenCalls).toHaveLength(2)
    expect(apiCalls[1]!.headers.Authorization).toBe('Bearer tok-2')
  })

  it('a second 401 is not retried forever', async () => {
    const { provider, apiCalls } = setup(() => ({ status: 401, body: { type: 'UnauthorizedException' } }))
    await expect(provider.search(query)).rejects.toBeInstanceOf(CreatorsApiError)
    expect(apiCalls).toHaveLength(2)
  })

  it('429 waits retryAfterSeconds and retries', async () => {
    sleeps.length = 0
    const { provider, apiCalls } = setup((_call, i) =>
      i === 0 ? { status: 429, body: { type: 'ThrottleException', retryAfterSeconds: 3 } } : page(['B000000001']),
    )
    await provider.search({ ...query, limit: 1 })
    expect(apiCalls).toHaveLength(2)
    expect(sleeps).toContain(3000)
  })

  it('caps a large retryAfterSeconds so a run stays bounded', async () => {
    sleeps.length = 0
    const { provider } = setup((_call, i) =>
      i === 0 ? { status: 429, body: { type: 'ThrottleException', retryAfterSeconds: 600 } } : page(['B000000001']),
    )
    await provider.search({ ...query, limit: 1 })
    expect(Math.max(...sleeps)).toBeLessThanOrEqual(10_000)
  })

  it('400 is not retried and keeps type/reason', async () => {
    const { provider, apiCalls } = setup(() => ({
      status: 400,
      body: { type: 'ValidationException', reason: 'InvalidPartnerTag', message: 'bad tag' },
    }))
    const error = await provider.refresh(['B000000001'], 'x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(CreatorsApiError)
    expect(error).toMatchObject({ status: 400, reason: 'InvalidPartnerTag' })
    expect(apiCalls).toHaveLength(1)
  })

  it('renews the token after it expires', async () => {
    const { provider, tokenCalls } = setup(() => page(['B000000001']))
    await provider.search({ ...query, limit: 1 })
    clock += 3600_000
    await provider.search({ ...query, limit: 1 })
    expect(tokenCalls).toHaveLength(2)
  })
})

describe('response validation', () => {
  it('drops an item with a malformed listing or a non-amazon.es link, keeps the rest', async () => {
    const bad = { ...item('B0BAD00001'), offersV2: { listings: 'nope' } }
    const foreign = { ...item('B0FOREIGN1'), detailPageURL: 'https://evil.example/dp/B0FOREIGN1?tag=canal-21' }
    const badFeatures = { ...item('B0BAD00002'), itemInfo: { features: { displayValues: [1, 2] } } }
    const { provider } = setup(() => ({ status: 200, body: { searchResult: { items: [bad, foreign, badFeatures, item('B0GOOD0001')] } } }))
    const results = await provider.search({ ...query, limit: 10 })
    expect(results.map((r) => r.asin)).toEqual(['B0GOOD0001'])
  })

  it('an unexpected response shape throws instead of meaning "no results" or "product gone"', async () => {
    const { provider } = setup(() => ({ status: 200, body: { somethingElse: { items: [item('B000000001')] } } }))
    await expect(provider.search(query)).rejects.toMatchObject({ reason: 'UnexpectedResponse' })
    await expect(provider.refresh(['B000000001'], 'x')).rejects.toMatchObject({ reason: 'UnexpectedResponse' })
  })

  it('GetItems with only errors[] (all ASIN missing) is a valid empty result', async () => {
    const { provider } = setup(() => ({ status: 200, body: { errors: [{ code: 'ItemNotAccessible', message: 'x' }] } }))
    await expect(provider.refresh(['B000000001'], 'x')).resolves.toEqual([])
  })

  it('a 5xx retry still spaces the next call by 1 TPS', async () => {
    sleeps.length = 0
    const { provider } = setup((call, i) =>
      i === 0 ? { status: 503, body: { type: 'InternalServerException', retryAfterSeconds: 0 } } : { status: 200, body: { itemsResult: { items: [item(String((call.body.itemIds as string[])[0]))] } } },
    )
    await provider.refresh(['B000000001'], 'x')
    const before = sleeps.length
    await provider.refresh(['B000000002'], 'x')
    // Waits for the spacing again after the retried call
    expect(sleeps.slice(before).some((ms) => ms >= 1000)).toBe(true)
    expect(sleeps.every((ms) => ms >= 1000 || ms === 0)).toBe(true)
  })
})

describe('getCreatorsProvider', () => {
  const g = globalThis as { __env__?: Record<string, string> }
  afterEach(() => {
    delete g.__env__
  })

  it('without credentials (or outside the Worker) is unavailable', async () => {
    await expect(getCreatorsProvider().refresh(['B000000001'], 'x')).rejects.toBeInstanceOf(ProviderUnavailableError)
    g.__env__ = { CREATORS_CREDENTIAL_ID: 'id', CREATORS_CREDENTIAL_SECRET: '   ' }
    await expect(getCreatorsProvider().refresh(['B000000001'], 'x')).rejects.toBeInstanceOf(ProviderUnavailableError)
  })

  it('reuses one client per id and secret, and a new one when the secret rotates', () => {
    g.__env__ = { CREATORS_CREDENTIAL_ID: 'id', CREATORS_CREDENTIAL_SECRET: 's1' }
    const client = (p: unknown) => (p as { client: unknown }).client
    const a = client(getCreatorsProvider())
    expect(a).not.toBeNull()
    expect(client(getCreatorsProvider())).toBe(a)
    g.__env__ = { CREATORS_CREDENTIAL_ID: 'id', CREATORS_CREDENTIAL_SECRET: 's2' }
    expect(client(getCreatorsProvider())).not.toBe(a)
  })
})
