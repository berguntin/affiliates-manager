import type { ManualBasisType } from '../../shared/types'
import { MARKETPLACE_HOST } from '../domain/affiliate'
import { isBlockedPage, parseProductPage } from '../domain/amazon-page'
import type { ProductProvider } from '../providers/types'
import { ProviderUnavailableError } from '../providers/types'
import { useOptionalEnv } from '../utils/env'
import { HttpError } from '../utils/http'
import { CreatorsApiError } from '../providers/creators/client'
import { getCreatorsProvider } from './providers'

export interface ProductLookup {
  asin: string
  source: 'creators_api' | 'amazon_page'
  title: string | null
  brand: string | null
  priceCents: number | null
  basisPriceCents: number | null
  basisType: ManualBasisType | null
  features: string[]
}

export class ProductLookupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductLookupError'
  }
}

const PAGE_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'es-ES,es;q=0.9',
}

/** Datos de la ficha de amazon.es. */
export async function lookupFromPage(asin: string, fetchFn: typeof fetch = fetch): Promise<ProductLookup> {
  let res: Response
  try {
    res = await fetchFn(`https://${MARKETPLACE_HOST}/dp/${asin}`, {
      headers: PAGE_HEADERS,
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    throw new ProductLookupError(`No se ha podido consultar Amazon: ${(error as Error).message}`)
  }
  const html = await res.text()
  // Amazon responde 404 o 503 tanto si el producto no existe como si bloquea la consulta
  if (!res.ok) {
    throw new ProductLookupError(
      `Amazon no ha devuelto la ficha (${res.status}: producto inexistente o consulta bloqueada); rellena los datos a mano`,
    )
  }
  if (isBlockedPage(html)) {
    throw new ProductLookupError('Amazon ha bloqueado la consulta automática; rellena los datos a mano')
  }
  return { asin, source: 'amazon_page', ...parseProductPage(html) }
}

/**
 * Creators API data. null only when the API is unavailable (no credentials, 403); once
 * it is available, a missing item or an API error never falls back to the page.
 */
async function lookupFromApi(asin: string, provider: ProductProvider, partnerTag: string): Promise<ProductLookup | null> {
  let snapshot
  try {
    ;[snapshot] = await provider.refresh([asin], partnerTag)
  } catch (error) {
    if (error instanceof ProviderUnavailableError) return null
    if (error instanceof CreatorsApiError || error instanceof HttpError) {
      // Sanitized message (status and reason only)
      throw new ProductLookupError(`No se ha podido consultar el producto en la Creators API (${error.message})`)
    }
    // Network error or timeout: generic message, no page fallback
    throw new ProductLookupError('No se ha podido conectar con la Creators API; inténtalo de nuevo')
  }
  if (!snapshot) throw new ProductLookupError('Amazon no devuelve ese producto; rellena los datos a mano')
  // A MAP-restricted price cannot be shown (docs/creators-api.md §5)
  const offer = snapshot.offer && !snapshot.offer.violatesMap ? snapshot.offer : null
  const basisType = offer?.savingBasisType === 'LIST_PRICE' || offer?.savingBasisType === 'WAS_PRICE' ? offer.savingBasisType : null
  const validBasis = offer && basisType && offer.savingBasisCents != null && offer.savingBasisCents > offer.priceCents
  return {
    asin,
    source: 'creators_api',
    title: snapshot.title,
    brand: snapshot.brand,
    priceCents: offer?.priceCents ?? null,
    basisPriceCents: validBasis ? offer.savingBasisCents : null,
    basisType: validBasis ? basisType : null,
    features: snapshot.features ?? [],
  }
}

/**
 * Precio, título, marca y características de un ASIN: la Creators API si está disponible
 * y, si no, la ficha de amazon.es.
 */
export async function lookupProduct(
  asin: string,
  opts: { fetchFn?: typeof fetch; api?: ProductProvider; partnerTag?: string } = {},
): Promise<ProductLookup> {
  // No channel here: the account's store/tracking ID (CREATORS_PARTNER_TAG)
  const partnerTag = opts.partnerTag ?? useOptionalEnv().CREATORS_PARTNER_TAG?.trim() ?? ''
  const fromApi = await lookupFromApi(asin, opts.api ?? getCreatorsProvider(), partnerTag)
  return fromApi ?? lookupFromPage(asin, opts.fetchFn)
}
