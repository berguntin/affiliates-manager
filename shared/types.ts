/** Tipos compartidos entre el panel (app/) y el servidor (server/). */

export const PROVIDER_IDS = ['manual', 'mock', 'creators_api'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

export const CHANNEL_TYPES = ['telegram', 'whatsapp'] as const
export type ChannelType = (typeof CHANNEL_TYPES)[number]

export const MESSAGE_FORMATS = ['telegram-html', 'whatsapp'] as const
export type MessageFormat = (typeof MESSAGE_FORMATS)[number]

export const PUBLICATION_STATUSES = [
  'candidata',
  'aprobada',
  'programada',
  'publicada',
  'descartada',
  'caducada',
] as const
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number]

export const SAVING_BASIS_TYPES = [
  'LIST_PRICE',
  'LOWEST_PRICE',
  'LOWEST_PRICE_STRIKETHROUGH',
  'WAS_PRICE',
] as const
export type SavingBasisType = (typeof SAVING_BASIS_TYPES)[number]

/** Precio de referencia que se puede indicar en un alta manual. */
export const MANUAL_BASIS_TYPES = ['WAS_PRICE', 'LIST_PRICE'] as const satisfies readonly SavingBasisType[]
export type ManualBasisType = (typeof MANUAL_BASIS_TYPES)[number]

/**
 * Fiabilidad del descuento:
 * - `reference`: calculado sobre un precio anterior real (WAS_PRICE / LOWEST_PRICE…).
 * - `history`: calculado con histórico externo (Keepa).
 * - `list`: calculado sobre el PVP recomendado (propenso a inflarse).
 * - `none`: sin precio o sin referencia (p. ej. alta manual sin precio anterior).
 * En las altas manuales, `reference` o `list` según el tipo de precio anterior indicado.
 */
export type DealReliability = 'reference' | 'history' | 'list' | 'none'

export type RunKind = 'scan' | 'tick'
export type RunTrigger = 'cron' | 'manual'
export type RunStatus = 'running' | 'ok' | 'partial' | 'error'

/** Franja de publicación en la zona horaria configurada. Días ISO: 1 = lunes … 7 = domingo. */
export interface PublishWindow {
  days: number[]
  start: string // "HH:MM"
  end: string // "HH:MM"
}
