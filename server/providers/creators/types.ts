/**
 * Subconjunto de la respuesta de la Creators API que usamos.
 * Fuente: documentación oficial (OffersV2, ItemInfo, Images). Ver docs/creators-api.md §5.
 */
export interface CreatorsMoney {
  amount: number
  currency: string
  displayAmount?: string
}

export interface CreatorsListing {
  availability?: { type?: string; message?: string; maxOrderQuantity?: number; minOrderQuantity?: number }
  condition?: { value?: string; subCondition?: string; conditionNote?: string }
  dealDetails?: {
    accessType?: string
    badge?: string
    startTime?: string
    endTime?: string
    percentClaimed?: number | string
  }
  isBuyBoxWinner?: boolean
  merchantInfo?: { id?: string; name?: string }
  price?: {
    money?: CreatorsMoney
    pricePerUnit?: CreatorsMoney
    savingBasis?: { money?: CreatorsMoney; savingBasisType?: string; savingBasisTypeLabel?: string }
    savings?: { money?: CreatorsMoney; percentage?: number }
  }
  type?: string
  violatesMAP?: boolean
}

export interface CreatorsItem {
  asin: string
  detailPageURL: string
  parentASIN?: string
  images?: { primary?: { large?: { url: string; width?: number; height?: number }; medium?: { url: string } } }
  itemInfo?: {
    title?: { displayValue?: string }
    byLineInfo?: { brand?: { displayValue?: string } }
    features?: { displayValues?: string[] }
  }
  offersV2?: { listings?: CreatorsListing[] }
}

export interface CreatorsSearchResponse {
  searchResult?: { items?: CreatorsItem[]; totalResultCount?: number }
  errors?: { code: string; message: string }[]
}

export interface CreatorsGetItemsResponse {
  itemsResult?: { items?: CreatorsItem[] }
  errors?: { code: string; message: string }[]
}
