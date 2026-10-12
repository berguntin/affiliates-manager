import { buildManualLink } from '../domain/affiliate'
import type { ProductSnapshot } from '../domain/product'
import type { ProductProvider, ThemeSearchQuery } from './types'

export interface ManualProductRecord {
  asin: string
  title: string
  brand: string | null
  note: string
}

/** Acceso a las altas manuales; lo implementa el servicio con D1. */
export interface ManualProductSource {
  pendingForTheme(themeId: string): Promise<ManualProductRecord[]>
  latestByAsin(asins: string[]): Promise<ManualProductRecord[]>
}

/**
 * Productos dados de alta a mano en el panel. Nunca devuelve precio: sin la API
 * no se puede publicar precio (SPEC §14.1). El enlace es el estándar de Afiliados.
 */
export class ManualProvider implements ProductProvider {
  readonly id = 'manual' as const
  readonly capabilities = { prices: false }

  constructor(
    private readonly source: ManualProductSource,
    private readonly now: () => number = Date.now,
  ) {}

  private toSnapshot(record: ManualProductRecord, partnerTag: string): ProductSnapshot {
    return {
      asin: record.asin,
      source: 'manual',
      capturedAt: this.now(),
      title: record.title,
      brand: record.brand,
      detailPageUrl: buildManualLink(record.asin, partnerTag),
      imageUrl: null,
      offer: null,
      note: record.note,
    }
  }

  async search(query: ThemeSearchQuery): Promise<ProductSnapshot[]> {
    const records = await this.source.pendingForTheme(query.themeId)
    return records.slice(0, query.limit).map((r) => this.toSnapshot(r, query.partnerTag))
  }

  async refresh(asins: string[], partnerTag: string): Promise<ProductSnapshot[]> {
    const records = await this.source.latestByAsin(asins)
    return records.map((r) => this.toSnapshot(r, partnerTag))
  }
}
