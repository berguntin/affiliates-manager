import { z } from 'zod'
import type { ProductSnapshot } from '../../domain/product'
import { ProviderUnavailableError, type ProductProvider, type ThemeSearchQuery } from '../types'
import { CREATORS_MARKETPLACE, CreatorsApiError, type CreatorsApiClient } from './client'
import { fromCreatorsItem } from './mapper'
import type { CreatorsItem } from './types'

/** `itemCount` maximum per SearchItems page. */
export const SEARCH_PAGE_SIZE = 10
/** `itemPage` maximum (docs/creators-api.md §3). */
export const MAX_SEARCH_PAGES = 10
/** Bound on SearchItems calls per theme search (1 TPS, Worker subrequests). */
export const MAX_SEARCH_REQUESTS = 10
/** GetItems accepts up to 10 ASIN per call. */
export const GET_ITEMS_BATCH = 10

/** Resources requested explicitly (the API only returns `itemInfo.title` by default). */
export const CREATORS_RESOURCES = [
  'itemInfo.title',
  'itemInfo.byLineInfo',
  'itemInfo.features',
  'images.primary.large',
  'offersV2.listings.price',
  'offersV2.listings.availability',
  'offersV2.listings.condition',
  'offersV2.listings.dealDetails',
  'offersV2.listings.isBuyBoxWinner',
  'offersV2.listings.merchantInfo',
  'offersV2.listings.type',
  'offersV2.listings.violatesMAP',
] as const

const money = z.looseObject({ amount: z.number(), currency: z.string(), displayAmount: z.string().optional() })
const listingSchema = z.looseObject({
  availability: z.looseObject({ type: z.string().optional(), message: z.string().optional() }).optional(),
  condition: z.looseObject({ value: z.string().optional() }).optional(),
  dealDetails: z
    .looseObject({ badge: z.string().optional(), endTime: z.string().optional(), accessType: z.string().optional() })
    .optional(),
  isBuyBoxWinner: z.boolean().optional(),
  merchantInfo: z.looseObject({ id: z.string().optional(), name: z.string().optional() }).optional(),
  price: z
    .looseObject({
      money: money.optional(),
      savingBasis: z.looseObject({ money: money.optional(), savingBasisType: z.string().optional() }).optional(),
      savings: z.looseObject({ money: money.optional(), percentage: z.number().optional() }).optional(),
    })
    .optional(),
  type: z.string().optional(),
  violatesMAP: z.boolean().optional(),
})
const display = z.looseObject({ displayValue: z.string().optional() })
const imageSchema = z.looseObject({ url: z.string() })

/** The subset of a Creators item we read; anything else in it is ignored. */
const itemSchema = z.looseObject({
  asin: z.string().min(1),
  /** The vended link, published unchanged: it must point to amazon.es. */
  detailPageURL: z.string().refine((u) => {
    try {
      const url = new URL(u)
      return url.protocol === 'https:' && url.hostname === CREATORS_MARKETPLACE
    } catch {
      return false
    }
  }),
  parentASIN: z.string().optional(),
  images: z.looseObject({ primary: z.looseObject({ large: imageSchema.optional(), medium: imageSchema.optional() }).optional() }).optional(),
  itemInfo: z
    .looseObject({
      title: display.optional(),
      byLineInfo: z.looseObject({ brand: display.optional() }).optional(),
      features: z.looseObject({ displayValues: z.array(z.string()).optional() }).optional(),
    })
    .optional(),
  offersV2: z.looseObject({ listings: z.array(listingSchema).optional() }).optional(),
})

const resultSchema = z.looseObject({ items: z.array(z.unknown()).optional() })
const searchResponseSchema = z.looseObject({ searchResult: resultSchema.optional(), errors: z.array(z.unknown()).optional() })
const getItemsResponseSchema = z.looseObject({ itemsResult: resultSchema.optional(), errors: z.array(z.unknown()).optional() })

/** Drops malformed items (one bad item never aborts the whole theme or batch). */
function validItems(items: unknown[] | undefined): CreatorsItem[] {
  return (items ?? []).filter((i) => itemSchema.safeParse(i).success) as CreatorsItem[]
}

/**
 * Items of a response. A body with neither the result key nor `errors[]` is an unexpected
 * shape and throws, so it is never mistaken for "no results" or "product gone".
 */
function responseItems(
  raw: unknown,
  schema: typeof searchResponseSchema | typeof getItemsResponseSchema,
  key: 'searchResult' | 'itemsResult',
): CreatorsItem[] {
  const parsed = schema.safeParse(raw)
  const result = parsed.success ? (parsed.data as Record<string, z.infer<typeof resultSchema> | undefined>)[key] : undefined
  if (!parsed.success || (!result && !parsed.data.errors)) {
    throw new CreatorsApiError(200, null, 'UnexpectedResponse', 'Respuesta inesperada de la Creators API')
  }
  return validItems(result?.items)
}

export interface SearchRequestPart {
  keywords?: string
  browseNodeId?: string
}

/**
 * One request per keyword (× browse node, since the API takes one node per request),
 * or one per node when the theme has no keywords.
 */
export function searchParts(query: Pick<ThemeSearchQuery, 'keywords' | 'browseNodes'>): SearchRequestPart[] {
  const keywords = query.keywords.map((k) => k.trim()).filter(Boolean)
  const nodes = query.browseNodes.map((n) => n.trim()).filter(Boolean)
  if (keywords.length && nodes.length) {
    return keywords.flatMap((k) => nodes.map((n) => ({ keywords: k, browseNodeId: n })))
  }
  if (keywords.length) return keywords.map((k) => ({ keywords: k }))
  return nodes.map((n) => ({ browseNodeId: n }))
}

/** Theme filters the API applies itself (docs/creators-api.md §4). */
export function searchFilters(query: ThemeSearchQuery): Record<string, unknown> {
  const filters: Record<string, unknown> = {
    searchIndex: query.searchIndex || 'All',
    condition: 'New',
    availability: 'Available',
  }
  if (query.minPriceCents != null) filters.minPrice = Math.round(query.minPriceCents)
  if (query.maxPriceCents != null) filters.maxPrice = Math.round(query.maxPriceCents)
  if (query.minSavingPercent != null && query.minSavingPercent >= 1) {
    filters.minSavingPercent = Math.min(99, Math.round(query.minSavingPercent))
  }
  if (query.minRating != null && query.minRating >= 1) {
    // Integer 1–4 only; the exact rating is not returned by the API
    filters.minReviewsRating = Math.min(4, Math.floor(query.minRating))
  }
  return filters
}

export interface CreatorsApiProviderOptions {
  /** null = no credentials configured. */
  client: CreatorsApiClient | null
  now?: () => number
}

/**
 * Amazon Creators API (docs/creators-api.md). Links are the vended `detailPageURL`,
 * requested with the channel's tracking ID as `partnerTag`, and never rewritten.
 * Unavailable (no credentials, 403 AssociateNotEligible) → ProviderUnavailableError.
 */
export class CreatorsApiProvider implements ProductProvider {
  readonly id = 'creators_api' as const
  readonly capabilities = { prices: true }
  private readonly client: CreatorsApiClient | null
  private readonly now: () => number

  constructor(options: CreatorsApiProviderOptions = { client: null }) {
    this.client = options.client
    this.now = options.now ?? Date.now
  }

  async search(query: ThemeSearchQuery): Promise<ProductSnapshot[]> {
    const client = this.requireClient()
    const partnerTag = this.partnerTag(query.partnerTag)
    const filters = searchFilters(query)
    const found = new Map<string, ProductSnapshot>()
    let requests = 0

    for (const part of searchParts(query)) {
      for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
        if (found.size >= query.limit || requests >= MAX_SEARCH_REQUESTS) break
        requests++
        let raw: unknown
        try {
          raw = await client.post('/catalog/v1/searchItems', {
            ...filters,
            ...part,
            partnerTag,
            marketplace: CREATORS_MARKETPLACE,
            itemCount: SEARCH_PAGE_SIZE,
            itemPage: page,
            languagesOfPreference: ['es_ES'],
            resources: CREATORS_RESOURCES,
          })
        } catch (error) {
          // No results for this query
          if (error instanceof CreatorsApiError && error.status === 404) break
          throw error
        }
        const rawItems = (raw as { searchResult?: { items?: unknown[] } } | null)?.searchResult?.items
        const items = responseItems(raw, searchResponseSchema, 'searchResult')
        const capturedAt = this.now()
        for (const item of items) {
          if (found.size >= query.limit) break
          if (!found.has(item.asin)) found.set(item.asin, fromCreatorsItem(item, 'creators_api', capturedAt))
        }
        if ((rawItems?.length ?? 0) < SEARCH_PAGE_SIZE) break
      }
    }
    return [...found.values()]
  }

  async refresh(asins: string[], partnerTag: string): Promise<ProductSnapshot[]> {
    const client = this.requireClient()
    const tag = this.partnerTag(partnerTag)
    const unique = [...new Set(asins.map((a) => a.trim().toUpperCase()).filter(Boolean))]
    const result: ProductSnapshot[] = []

    for (let i = 0; i < unique.length; i += GET_ITEMS_BATCH) {
      let raw: unknown
      try {
        raw = await client.post('/catalog/v1/getItems', {
          itemIds: unique.slice(i, i + GET_ITEMS_BATCH),
          itemIdType: 'ASIN',
          partnerTag: tag,
          marketplace: CREATORS_MARKETPLACE,
          languagesOfPreference: ['es_ES'],
          resources: CREATORS_RESOURCES,
        })
      } catch (error) {
        // None of the batch exists any more
        if (error instanceof CreatorsApiError && error.status === 404) continue
        throw error
      }
      const items = responseItems(raw, getItemsResponseSchema, 'itemsResult')
      const capturedAt = this.now()
      // Partial `errors[]` (an ASIN not found) just leave that ASIN out
      for (const item of items) {
        result.push(fromCreatorsItem(item, 'creators_api', capturedAt))
      }
    }
    return result
  }

  private requireClient(): CreatorsApiClient {
    if (!this.client) {
      throw new ProviderUnavailableError(
        'creators_api',
        'La Creators API no está configurada (faltan CREATORS_CREDENTIAL_ID y CREATORS_CREDENTIAL_SECRET)',
      )
    }
    return this.client
  }

  /** Every call carries an explicit tag: a channel's, or CREATORS_PARTNER_TAG for the lookup. */
  private partnerTag(tag: string): string {
    const value = tag.trim()
    if (!value) {
      throw new CreatorsApiError(
        0,
        null,
        'MissingPartnerTag',
        'Falta el tracking ID para la Creators API (configura CREATORS_PARTNER_TAG)',
      )
    }
    return value
  }
}
