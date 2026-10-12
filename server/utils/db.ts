import { drizzle } from 'drizzle-orm/d1'
import * as schema from '../db/schema'

export type Db = ReturnType<typeof useDb>

export function useDb() {
  return drizzle(useEnv().DB, { schema })
}

export { schema }
