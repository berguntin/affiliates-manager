import { SAVING_BASIS_TYPES, type ProviderId, type SavingBasisType } from '../../../shared/types'
import type { Offer, ProductSnapshot } from '../../domain/product'
import type { CreatorsItem, CreatorsListing } from './types'

const toCents = (amount: number | undefined): number | null =>
  amount == null || Number.isNaN(amount) ? null : Math.round(amount * 100)

function parseTime(value: string | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

function toOffer(listing: CreatorsListing): Offer | null {
  const priceCents = toCents(listing.price?.money?.amount)
  if (priceCents == null) return null
  const basisType = listing.price?.savingBasis?.savingBasisType
  const dealType = listing.type === 'LIGHTNING_DEAL' || listing.type === 'SUBSCRIBE_AND_SAVE' ? listing.type : null
  return {
    priceCents,
    currency: listing.price?.money?.currency ?? 'EUR',
    savingBasisCents: toCents(listing.price?.savingBasis?.money?.amount),
    savingBasisType: (SAVING_BASIS_TYPES as readonly string[]).includes(basisType ?? '')
      ? (basisType as SavingBasisType)
      : null,
    savingsPercent: listing.price?.savings?.percentage ?? null,
    availability: listing.availability?.type ?? null,
    condition: listing.condition?.value ?? 'Unknown',
    isBuyBoxWinner: listing.isBuyBoxWinner ?? false,
    dealType,
    dealBadge: listing.dealDetails?.badge?.trim() || null,
    dealEndsAt: parseTime(listing.dealDetails?.endTime),
    violatesMap: listing.violatesMAP ?? false,
  }
}

/**
 * Traduce un item de la Creators API a nuestro modelo. Lo usan el MockProvider
 * (con fixtures de la misma forma) y el CreatorsApiProvider (fase 2).
 */
export function fromCreatorsItem(item: CreatorsItem, source: ProviderId, capturedAt: number): ProductSnapshot {
  const listings = item.offersV2?.listings ?? []
  const listing = listings.find((l) => l.isBuyBoxWinner) ?? listings[0]
  return {
    asin: item.asin,
    source,
    capturedAt,
    title: item.itemInfo?.title?.displayValue?.trim() || item.asin,
    brand: item.itemInfo?.byLineInfo?.brand?.displayValue?.trim() || null,
    detailPageUrl: item.detailPageURL,
    imageUrl: item.images?.primary?.large?.url ?? item.images?.primary?.medium?.url ?? null,
    offer: listing ? toOffer(listing) : null,
    features: (item.itemInfo?.features?.displayValues ?? []).map((f) => f.trim()).filter(Boolean),
  }
}
