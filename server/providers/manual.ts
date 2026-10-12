import { buildManualLink } from '../domain/affiliate'
import type { ProductSnapshot } from '../domain/product'
import type { ProductProvider, ThemeSearchQuery } from './types'

export interface ManualProductRecord {
  asin: string
  title: string
  brand: string | null
  note: string
  /** Precio introducido a mano (null = se publica sin precio). */
  priceCents: number | null
  /** Momento del alta: es la «hora de consulta» del precio. */
  createdAt: number
}

/** Acceso a las altas manuales; lo implementa el servicio con D1. */
export interface ManualProductSource {
  pendingForTheme(themeId: string): Promise<ManualProductRecord[]>
  latestByAsin(asins: string[]): Promise<ManualProductRecord[]>
}

/**
 * Productos dados de alta a mano (panel o bot buzón). Si se indicó precio, se publica
 * con la fecha y hora del alta (SPEC §14.7, riesgo aceptado); si no, sin precio.
 * El enlace es el estándar de Afiliados.
 */
export class ManualProvider implements ProductProvider {
  readonly id = 'manual' as const
  readonly capabilities = { prices: true }

  constructor(
    private readonly source: ManualProductSource,
    private readonly now: () => number = Date.now,
  ) {}

  private toSnapshot(record: ManualProductRecord, partnerTag: string): ProductSnapshot {
    return {
      asin: record.asin,
      source: 'manual',
      capturedAt: record.priceCents != null ? record.createdAt : this.now(),
      title: record.title,
      brand: record.brand,
      detailPageUrl: buildManualLink(record.asin, partnerTag),
      imageUrl: null,
      offer:
        record.priceCents != null
          ? {
              priceCents: record.priceCents,
              currency: 'EUR',
              savingBasisCents: null,
              savingBasisType: null,
              savingsPercent: null,
              availability: null,
              condition: 'New',
              isBuyBoxWinner: true,
              dealType: null,
              dealBadge: null,
              dealEndsAt: null,
              violatesMap: false,
            }
          : null,
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
