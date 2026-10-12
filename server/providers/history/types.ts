import type { PriceHistoryStats } from '../../domain/product'

/**
 * Histórico de precios de una fuente externa con licencia propia (p. ej. Keepa).
 * No guardamos histórico propio de datos de la API (SPEC §14.2).
 *
 * Integración con Keepa (pendiente, opcional): implementar esta interfaz con su API
 * (`/product?domain=9&asin=…&stats=30`, dominio 9 = amazon.es) y devolver el mínimo
 * y la mediana de 30 días del precio de Amazon/nuevo en céntimos.
 */
export interface PriceHistoryProvider {
  getStats(asin: string): Promise<PriceHistoryStats | null>
}

/** Sin histórico: la detección usa solo los datos de ahorro de Amazon. */
export class NullPriceHistoryProvider implements PriceHistoryProvider {
  async getStats(): Promise<null> {
    return null
  }
}
