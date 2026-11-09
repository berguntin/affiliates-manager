import type { ProviderId } from '../../shared/types'
import { CreatorsApiClient } from '../providers/creators/client'
import { CreatorsApiProvider } from '../providers/creators/provider'
import { NullPriceHistoryProvider, type PriceHistoryProvider } from '../providers/history/types'
import { ManualProvider } from '../providers/manual'
import { MockProvider } from '../providers/mock/provider'
import type { ProductProvider } from '../providers/types'
import type { Db } from '../utils/db'
import { useOptionalEnv } from '../utils/env'
import { manualProductSource } from './manual-products'

export function getProvider(id: ProviderId, db: Db): ProductProvider {
  switch (id) {
    case 'manual':
      return new ManualProvider(manualProductSource(db))
    case 'mock':
      return new MockProvider()
    case 'creators_api':
      return getCreatorsProvider()
  }
}

/** One client per isolate and credential, so the token and the 1 TPS spacing are shared. */
let sharedClient: { key: string; client: CreatorsApiClient } | null = null

export function getCreatorsProvider(): CreatorsApiProvider {
  const env = useOptionalEnv()
  const credentialId = env.CREATORS_CREDENTIAL_ID?.trim()
  const credentialSecret = env.CREATORS_CREDENTIAL_SECRET?.trim()
  if (!credentialId || !credentialSecret) return new CreatorsApiProvider({ client: null })
  // Keyed by id and secret, so a rotated secret takes effect without recycling the isolate
  const key = `${credentialId}\u0000${credentialSecret}`
  if (sharedClient?.key !== key) {
    sharedClient = { key, client: new CreatorsApiClient({ credentialId, credentialSecret }) }
  }
  return new CreatorsApiProvider({ client: sharedClient.client })
}

/** Keepa queda preparado como fuente opcional (SPEC §14.2); de momento, sin histórico. */
export function getPriceHistoryProvider(): PriceHistoryProvider {
  return new NullPriceHistoryProvider()
}
