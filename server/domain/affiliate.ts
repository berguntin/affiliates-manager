import { ASIN_RE } from '../../shared/schemas'

export const MARKETPLACE_HOST = 'www.amazon.es'

/**
 * Enlace de texto estándar de Afiliados para altas manuales (sin API).
 * Con la API se usa siempre el `detailPageURL` devuelto, sin modificarlo.
 */
export function buildManualLink(asin: string, trackingId: string): string {
  return `https://${MARKETPLACE_HOST}/dp/${asin}?tag=${encodeURIComponent(trackingId)}`
}

/** Extrae el ASIN de un ASIN suelto o de una URL de amazon.es. */
export function parseAsin(input: string): string | null {
  const value = input.trim()
  if (ASIN_RE.test(value.toUpperCase()) && !value.includes('/')) return value.toUpperCase()

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (!/(^|\.)amazon\.es$/i.test(url.hostname)) return null
  const match = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN)\/([A-Z0-9]{10})(?:[/?]|$)/i)
  return match?.[1]?.toUpperCase() ?? null
}

/** Comprueba que un enlace apunta a amazon.es y lleva el tag esperado. */
export function linkHasTag(link: string, trackingId: string): boolean {
  try {
    const url = new URL(link)
    return url.hostname === MARKETPLACE_HOST && url.searchParams.get('tag') === trackingId
  } catch {
    return false
  }
}
