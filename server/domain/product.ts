import type { ProviderId, SavingBasisType } from '../../shared/types'

/** Instantánea de un producto en el momento de la consulta (modelo propio, no el de la API). */
export interface ProductSnapshot {
  asin: string
  source: ProviderId
  capturedAt: number
  title: string
  brand: string | null
  /** Enlace con el tag ya incluido. Si viene de la API, NO se modifica. */
  detailPageUrl: string
  /** Solo la URL: las imágenes no se descargan ni se almacenan. */
  imageUrl: string | null
  /** null = no hay precio publicable (alta manual o sin oferta disponible). */
  offer: Offer | null
  /** Texto propio asociado (altas manuales). */
  note?: string
}

export interface Offer {
  priceCents: number
  currency: string
  savingBasisCents: number | null
  savingBasisType: SavingBasisType | null
  savingsPercent: number | null
  availability: string | null
  condition: string
  isBuyBoxWinner: boolean
  dealType: 'LIGHTNING_DEAL' | 'SUBSCRIBE_AND_SAVE' | null
  dealBadge: string | null
  dealEndsAt: number | null
  violatesMap: boolean
}

/** Estadísticas de histórico externo (Keepa). Nunca se calculan con datos propios (SPEC §14.2). */
export interface PriceHistoryStats {
  min30Cents: number
  median30Cents: number
}
