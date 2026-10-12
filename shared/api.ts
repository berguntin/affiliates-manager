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
  actions: ('approve' | 'schedule' | 'unschedule' | 'publish' | 'discard' | 'edit')[]
}

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
