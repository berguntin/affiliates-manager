import type { ProviderId } from '../../shared/types'
import { CreatorsApiProvider } from '../providers/creators/provider'
import { NullPriceHistoryProvider, type PriceHistoryProvider } from '../providers/history/types'
import { ManualProvider } from '../providers/manual'
import { MockProvider } from '../providers/mock/provider'
import type { ProductProvider } from '../providers/types'
import type { Db } from '../utils/db'
import { manualProductSource } from './manual-products'

export function getProvider(id: ProviderId, db: Db): ProductProvider {
  switch (id) {
    case 'manual':
      return new ManualProvider(manualProductSource(db))
    case 'mock':
      return new MockProvider()
    case 'creators_api':
      return new CreatorsApiProvider()
  }
}

/** Keepa queda preparado como fuente opcional (SPEC §14.2); de momento, sin histórico. */
export function getPriceHistoryProvider(): PriceHistoryProvider {
  return new NullPriceHistoryProvider()
}
