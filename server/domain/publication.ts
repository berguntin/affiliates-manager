import type { PublicationStatus } from '../../shared/types'

export type PublicationAction =
  | 'approve'
  | 'schedule'
  | 'unschedule'
  | 'publish'
  | 'discard'
  | 'expire'
  | 'edit'

export const ACTION_LABELS: Record<PublicationAction, string> = {
  approve: 'aprobar',
  schedule: 'programar',
  unschedule: 'desprogramar',
  publish: 'publicar',
  discard: 'descartar',
  expire: 'caducar',
  edit: 'editar',
}

/**
 * candidata ──aprobar──► aprobada ──programar──► programada ──► publicada
 *   ├─ programar (aprueba y programa) / publicar ya ─────────────►
 *   └─ descartar ► descartada · caducar ► caducada (desde cualquier estado no final)
 */
const TRANSITIONS: Record<PublicationStatus, Partial<Record<PublicationAction, PublicationStatus>>> = {
  candidata: {
    approve: 'aprobada',
    schedule: 'programada',
    publish: 'publicada',
    discard: 'descartada',
    expire: 'caducada',
    edit: 'candidata',
  },
  aprobada: {
    schedule: 'programada',
    publish: 'publicada',
    discard: 'descartada',
    expire: 'caducada',
    edit: 'aprobada',
  },
  programada: {
    schedule: 'programada',
    unschedule: 'aprobada',
    publish: 'publicada',
    discard: 'descartada',
    expire: 'caducada',
    edit: 'programada',
  },
  publicada: {},
  descartada: {},
  caducada: {},
}

export const FINAL_STATUSES: readonly PublicationStatus[] = ['publicada', 'descartada', 'caducada']
export const OPEN_STATUSES: readonly PublicationStatus[] = ['candidata', 'aprobada', 'programada']

export class TransitionError extends Error {
  constructor(
    readonly from: PublicationStatus,
    readonly action: PublicationAction,
  ) {
    super(`No se puede ${ACTION_LABELS[action]} una publicación en estado «${from}»`)
    this.name = 'TransitionError'
  }
}

export function nextStatus(from: PublicationStatus, action: PublicationAction): PublicationStatus {
  const to = TRANSITIONS[from][action]
  if (!to) throw new TransitionError(from, action)
  return to
}

export function canApply(from: PublicationStatus, action: PublicationAction): boolean {
  return TRANSITIONS[from][action] !== undefined
}

/** Acciones disponibles para el panel. Una publicación pendiente de revisión no se publica. */
export function availableActions(status: PublicationStatus, needsReview: boolean): PublicationAction[] {
  return (Object.keys(TRANSITIONS[status]) as PublicationAction[]).filter(
    (a) => a !== 'expire' && !(needsReview && (a === 'publish' || a === 'schedule')),
  )
}

/** Caduca si se ha superado el plazo de la oferta (24 h o fin de la oferta flash). */
export function isExpired(status: PublicationStatus, expiresAt: number, now: number): boolean {
  return OPEN_STATUSES.includes(status) && now >= expiresAt
}

export const CANDIDATE_TTL_MS = 24 * 60 * 60 * 1000

export function computeExpiresAt(detectedAt: number, dealEndsAt: number | null): number {
  const ttl = detectedAt + CANDIDATE_TTL_MS
  return dealEndsAt && dealEndsAt > detectedAt ? Math.min(ttl, dealEndsAt) : ttl
}

/** Resultado de comparar el precio aprobado con el recién consultado. */
export function priceChangeReason(approvedCents: number | null, currentCents: number | null): string | null {
  if (approvedCents === currentCents) return null
  if (approvedCents == null) return 'Ahora el producto tiene precio y antes no'
  if (currentCents == null) return 'El producto ya no tiene oferta disponible'
  const fmt = (c: number) => `${(c / 100).toFixed(2).replace('.', ',')} €`
  return `El precio ha cambiado de ${fmt(approvedCents)} a ${fmt(currentCents)}`
}
