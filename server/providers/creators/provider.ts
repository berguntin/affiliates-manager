import type { ProductSnapshot } from '../../domain/product'
import { ProviderUnavailableError, type ProductProvider, type ThemeSearchQuery } from '../types'

/**
 * Integración real con la Amazon Creators API (FASE 2).
 *
 * Diseño previsto (docs/creators-api.md):
 * - Token LwA v3.2 (`https://api.amazon.co.uk/auth/o2/token`, scope `creatorsapi::default`)
 *   cacheado ~1 h y compartido (KV/D1).
 * - `POST https://creatorsapi.amazon/catalog/v1/searchItems|getItems` con
 *   `x-marketplace: www.amazon.es`, `partnerTag` = tracking ID del canal en `refresh`.
 * - Recursos: itemInfo.title, itemInfo.byLineInfo, images.primary.large, offersV2.listings.*.
 * - Llamadas en serie (1 TPS inicial), lotes de 10 ASIN en getItems, backoff en 429/5xx.
 * - 403 AssociateNotEligible → ProviderUnavailableError (el panel degrada a alta manual).
 * - Respuesta traducida con `fromCreatorsItem`.
 */
export class CreatorsApiProvider implements ProductProvider {
  readonly id = 'creators_api' as const
  readonly capabilities = { prices: true }

  search(_query: ThemeSearchQuery): Promise<ProductSnapshot[]> {
    return Promise.reject(this.unavailable())
  }

  refresh(_asins: string[], _partnerTag: string): Promise<ProductSnapshot[]> {
    return Promise.reject(this.unavailable())
  }

  private unavailable() {
    return new ProviderUnavailableError('creators_api', 'La integración con la Creators API llega en la fase 2')
  }
}
