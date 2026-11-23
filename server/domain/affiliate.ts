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

/**
 * Amazon-owned short link hosts whose links may be published as they are (SiteStripe,
 * app sharing). Third-party shorteners are never preserved (docs/creators-api.md, rule 13).
 */
export const AFFILIATE_SHORT_HOSTS = ['amzn.to', 'amzn.eu', 'a.co'] as const

const TAG_RE = /^[a-z0-9-]{3,64}$/i

/** A user's own affiliate short link and the tracking ID it resolves to. */
export interface OwnAffiliateLink {
  url: string
  tag: string
}

/** `tag` of an amazon.es URL (e.g. a short link's redirect target), if valid. */
export function affiliateTagFrom(link: string): string | null {
  try {
    const url = new URL(link)
    if (url.hostname !== MARKETPLACE_HOST) return null
    const tag = url.searchParams.get('tag')
    return tag && TAG_RE.test(tag) ? tag : null
  } catch {
    return null
  }
}

/** Whether a link is an Amazon-owned https short link that can be kept verbatim. */
export function isAffiliateShortLink(link: string): boolean {
  if (link.length > 300) return false
  try {
    const url = new URL(link)
    const host = url.hostname.toLowerCase()
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      ((AFFILIATE_SHORT_HOSTS as readonly string[]).includes(host) || host.endsWith('.amazon'))
    )
  } catch {
    return false
  }
}

/**
 * Link for a manual product on a channel: the user's own short link when it carries that
 * channel's tracking ID, otherwise the standard Associates link.
 */
export function manualLink(asin: string, trackingId: string, own: OwnAffiliateLink | null): string {
  return own && own.tag === trackingId && isAffiliateShortLink(own.url) ? own.url : buildManualLink(asin, trackingId)
}
