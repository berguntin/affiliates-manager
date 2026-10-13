import type { DealReliability } from '../../shared/types'
import type { PriceHistoryStats, ProductSnapshot } from './product'
import { normalize } from './text'

export interface DealFilters {
  minDiscountPct: number
  minPriceCents: number | null
  maxPriceCents: number | null
  excludeKeywords: string[]
  excludeBrands: string[]
}

export interface DealEvaluation {
  eligible: boolean
  /** Motivos de descarte (vacío si es elegible). */
  rejections: string[]
  /** Observaciones para quien revisa (p. ej. por qué es sospechosa). */
  notes: string[]
  reliability: DealReliability
  effectiveDiscountPct: number | null
  suspicious: boolean
  score: number
}

/** Umbrales de la heurística. Ajustables sin tocar la lógica. */
export const DEAL_RULES = {
  /** Descuento sobre PVP recomendado a partir del cual se considera sospechoso. */
  listPriceSuspiciousPct: 40,
  /** Diferencia (puntos) entre el % que anuncia Amazon y el real con histórico. */
  inflatedGapPct: 15,
  /** Margen sobre el mínimo de 30 días para considerar que no es mínimo. */
  aboveMinTolerance: 0.05,
  availableTypes: ['IN_STOCK', 'IN_STOCK_SCARCE'],
} as const

const REFERENCE_BASES = new Set(['WAS_PRICE', 'LOWEST_PRICE', 'LOWEST_PRICE_STRIKETHROUGH'])

export function matchesExclusion(snapshot: ProductSnapshot, filters: DealFilters): string | null {
  const title = normalize(snapshot.title)
  const brand = normalize(snapshot.brand ?? '')
  for (const word of filters.excludeKeywords) {
    const w = normalize(word)
    if (w && containsWord(title, w)) return `Contiene la palabra excluida «${word}»`
  }
  for (const excluded of filters.excludeBrands) {
    const b = normalize(excluded)
    if (b && (brand === b || containsWord(title, b))) return `Marca excluida «${excluded}»`
  }
  return null
}

function containsWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'u').test(haystack)
}

function pct(from: number, to: number): number {
  return Math.round(((from - to) / from) * 100)
}

/**
 * Evalúa si una instantánea es una oferta publicable para una temática.
 * Usa los datos de ahorro de Amazon (SPEC §14.2) y, si existe, histórico externo.
 */
export function evaluateDeal(
  snapshot: ProductSnapshot,
  filters: DealFilters,
  history: PriceHistoryStats | null = null,
): DealEvaluation {
  const rejections: string[] = []
  const notes: string[] = []
  const result = (
    reliability: DealReliability,
    effectiveDiscountPct: number | null,
    suspicious: boolean,
    bonus = 0,
  ): DealEvaluation => {
    const base = effectiveDiscountPct ?? 0
    const score = Math.max(0, Math.min(100, base + bonus - (suspicious ? 20 : 0)))
    return {
      eligible: rejections.length === 0,
      rejections,
      notes,
      reliability,
      effectiveDiscountPct,
      suspicious,
      score,
    }
  }

  const excluded = matchesExclusion(snapshot, filters)
  if (excluded) rejections.push(excluded)

  const offer = snapshot.offer
  // Las altas manuales son una selección explícita: no se aplican filtros de oferta.
  if (snapshot.source === 'manual') {
    notes.push(offer ? 'Alta manual: precio introducido a mano' : 'Alta manual: se publica sin precio')
    const manualPct =
      offer?.savingBasisCents && offer.savingBasisCents > offer.priceCents
        ? pct(offer.savingBasisCents, offer.priceCents)
        : null
    if (manualPct != null) {
      notes.push(
        offer?.savingBasisType === 'LIST_PRICE'
          ? `Descuento introducido a mano: −${manualPct}% sobre el PVP recomendado`
          : `Descuento introducido a mano: −${manualPct}% sobre el precio anterior`,
      )
    }
    return result('none', manualPct, false)
  }
  if (!offer) {
    rejections.push('Sin oferta disponible')
    return result('none', null, false)
  }

  if (offer.violatesMap) rejections.push('Amazon no permite mostrar el precio (MAP)')
  if (offer.condition !== 'New') rejections.push(`Estado «${offer.condition}», no nuevo`)
  if (offer.dealType === 'SUBSCRIBE_AND_SAVE') rejections.push('Precio de «Suscríbete y ahorra»')
  if (!offer.isBuyBoxWinner) rejections.push('No es la oferta destacada')
  if (offer.availability && !(DEAL_RULES.availableTypes as readonly string[]).includes(offer.availability)) {
    rejections.push(`Disponibilidad «${offer.availability}»`)
  }
  if (filters.minPriceCents != null && offer.priceCents < filters.minPriceCents) {
    rejections.push('Por debajo del precio mínimo')
  }
  if (filters.maxPriceCents != null && offer.priceCents > filters.maxPriceCents) {
    rejections.push('Por encima del precio máximo')
  }

  const amazonPct =
    offer.savingsPercent ??
    (offer.savingBasisCents && offer.savingBasisCents > offer.priceCents
      ? pct(offer.savingBasisCents, offer.priceCents)
      : null)

  let reliability: DealReliability
  let effective: number | null
  let suspicious = false

  if (history) {
    reliability = 'history'
    effective = pct(history.median30Cents, offer.priceCents)
    if (offer.priceCents > history.min30Cents * (1 + DEAL_RULES.aboveMinTolerance)) {
      notes.push('No es el precio mínimo de los últimos 30 días')
    }
    if (amazonPct != null && amazonPct - effective >= DEAL_RULES.inflatedGapPct) {
      suspicious = true
      notes.push(`Amazon anuncia −${amazonPct}% pero frente a la mediana de 30 días es −${effective}%`)
    }
  } else if (offer.savingBasisType && REFERENCE_BASES.has(offer.savingBasisType)) {
    reliability = 'reference'
    effective = amazonPct
  } else if (offer.savingBasisType === 'LIST_PRICE') {
    reliability = 'list'
    effective = amazonPct
    notes.push('Descuento calculado sobre el PVP recomendado')
    if (amazonPct != null && amazonPct >= DEAL_RULES.listPriceSuspiciousPct) {
      suspicious = true
      notes.push(`−${amazonPct}% sobre PVP recomendado: posible descuento inflado`)
    }
  } else {
    reliability = 'none'
    effective = amazonPct
  }

  if (filters.minDiscountPct > 0) {
    if (effective == null) rejections.push('Sin precio de referencia para calcular el descuento')
    else if (effective < filters.minDiscountPct) {
      rejections.push(`Descuento ${effective}% inferior al mínimo (${filters.minDiscountPct}%)`)
    }
  }

  let bonus = 0
  if (reliability === 'reference' || reliability === 'history') bonus += 5
  if (offer.dealType === 'LIGHTNING_DEAL') {
    bonus += 5
    notes.push('Oferta flash')
  }
  return result(reliability, effective, suspicious, bonus)
}
