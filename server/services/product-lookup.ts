import type { ManualBasisType } from '../../shared/types'
import { MARKETPLACE_HOST } from '../domain/affiliate'
import { isBlockedPage, parseProductPage } from '../domain/amazon-page'
import { CreatorsApiProvider } from '../providers/creators/provider'
import type { ProductProvider } from '../providers/types'
import { ProviderUnavailableError } from '../providers/types'

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

/** Datos de la Creators API (null si no está disponible: sin credenciales o sin acceso). */
async function lookupFromApi(asin: string, provider: ProductProvider): Promise<ProductLookup | null> {
  try {
    const [snapshot] = await provider.refresh([asin], '')
    if (!snapshot) return null
    const offer = snapshot.offer
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
  } catch (error) {
    if (error instanceof ProviderUnavailableError) return null
    throw error
  }
}

/**
 * Precio, título, marca y características de un ASIN: la Creators API si está disponible
 * y, si no, la ficha de amazon.es.
 */
export async function lookupProduct(
  asin: string,
  opts: { fetchFn?: typeof fetch; api?: ProductProvider } = {},
): Promise<ProductLookup> {
  const fromApi = await lookupFromApi(asin, opts.api ?? new CreatorsApiProvider())
  return fromApi ?? lookupFromPage(asin, opts.fetchFn)
}
