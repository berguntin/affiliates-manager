import type { ProviderId } from '../../shared/types'
import type { ProductSnapshot } from '../domain/product'

export interface ThemeSearchQuery {
  themeId: string
  keywords: string[]
  browseNodes: string[]
  searchIndex: string
  minPriceCents: number | null
  maxPriceCents: number | null
  minSavingPercent: number | null
  minRating: number | null
  /** Tag con el que se hace la búsqueda (los enlaces definitivos se piden por canal). */
  partnerTag: string
  /** Máximo de productos a devolver. */
  limit: number
}

export interface ProductProvider {
  readonly id: ProviderId
  readonly capabilities: {
    /** Devuelve precios publicables (solo la API oficial; el mock en desarrollo). */
    prices: boolean
  }
  /** Productos candidatos para una temática. */
  search(query: ThemeSearchQuery): Promise<ProductSnapshot[]>
  /**
   * Datos actuales de ASIN concretos con el tracking ID del canal destino.
   * Se llama justo antes de publicar (SPEC §8).
   */
  refresh(asins: string[], partnerTag: string): Promise<ProductSnapshot[]>
}

/** El proveedor no puede usarse ahora (sin credenciales, sin elegibilidad…). */
export class ProviderUnavailableError extends Error {
  constructor(
    readonly providerId: ProviderId,
    message: string,
  ) {
    super(message)
    this.name = 'ProviderUnavailableError'
  }
}
