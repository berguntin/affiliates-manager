export interface PreviousProposal {
  at: number
  priceCents: number | null
}

export interface DedupeDecision {
  allowed: boolean
  reason: string | null
}

const DAY = 86_400_000

/**
 * No volver a proponer el mismo ASIN durante `dedupeDays` días,
 * salvo que el precio actual sea más bajo que cualquiera de los propuestos.
 */
export function checkDedupe(params: {
  priceCents: number | null
  previous: PreviousProposal[]
  now: number
  dedupeDays: number
}): DedupeDecision {
  const { priceCents, previous, now, dedupeDays } = params
  if (dedupeDays <= 0) return { allowed: true, reason: null }

  const recent = previous.filter((p) => now - p.at < dedupeDays * DAY)
  if (recent.length === 0) return { allowed: true, reason: null }

  const knownPrices = recent.map((p) => p.priceCents).filter((p): p is number => p != null)
  if (priceCents != null && knownPrices.length > 0 && priceCents < Math.min(...knownPrices)) {
    return { allowed: true, reason: null }
  }
  const last = Math.max(...recent.map((p) => p.at))
  const days = Math.max(1, Math.round((now - last) / DAY))
  return {
    allowed: false,
    reason: `Ya propuesto hace ${days} día${days === 1 ? '' : 's'} y el precio no ha bajado`,
  }
}
