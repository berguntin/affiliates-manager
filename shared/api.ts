import type { ChannelType, DealReliability, PublicationStatus, ProviderId } from './types'

/** Forma de un elemento de la cola tal como lo devuelve /api/publications. */
export interface QueueItem {
  id: string
  status: PublicationStatus
  text: string
  link: string
  priceCentsShown: number | null
  priceCheckedAt: number | null
  needsReview: boolean
  reviewReason: string | null
  scheduledAt: number | null
  publishedAt: number | null
  externalId: string | null
  error: string | null
  dealId: string
  asin: string
  source: ProviderId
  title: string | null
  brand: string | null
  detectedAt: number
  expiresAt: number
  effectiveDiscountPct: number | null
  reliability: DealReliability
  suspicious: boolean
  reasons: string[]
  score: number
  themeId: string
  themeName: string
  channelId: string
  channelName: string
  channelType: ChannelType
  /** The system publishes this item's channel (Telegram, or WhatsApp through the gateway). */
  automatic: boolean
  actions: ('approve' | 'schedule' | 'unschedule' | 'publish' | 'discard' | 'edit')[]
}

/** Review reason after a send whose outcome is unknown (gateway 5xx, dropped connection, no id). */
export const UNCERTAIN_DELIVERY_REASON = 'Puede que se haya enviado: compruébalo en el canal antes de volver a publicar'

export const STATUS_LABELS: Record<PublicationStatus, string> = {
  candidata: 'Candidata',
  aprobada: 'Aprobada',
  programada: 'Programada',
  publicada: 'Publicada',
  descartada: 'Descartada',
  caducada: 'Caducada',
}

export const RELIABILITY_LABELS: Record<DealReliability, string> = {
  reference: 'sobre precio anterior',
  history: 'según histórico',
  list: 'sobre PVP recomendado',
  none: 'sin referencia',
}
