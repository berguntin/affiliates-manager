import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { ManualProductSource } from '../providers/manual'
import type { Db } from '../utils/db'
import { schema } from '../utils/db'

const { manualProducts } = schema

export function manualProductSource(db: Db): ManualProductSource {
  return {
    async pendingForTheme(themeId) {
      return db
        .select()
        .from(manualProducts)
        .where(and(eq(manualProducts.themeId, themeId), isNull(manualProducts.consumedAt)))
        .orderBy(manualProducts.createdAt)
    },
    async latestByAsin(asins) {
      if (asins.length === 0) return []
      const rows = await db
        .select()
        .from(manualProducts)
        .where(inArray(manualProducts.asin, asins))
        .orderBy(desc(manualProducts.createdAt))
      const seen = new Set<string>()
      return rows.filter((r) => !seen.has(r.asin) && seen.add(r.asin))
    },
  }
}

export async function addManualProduct(
  db: Db,
  data: {
    themeId: string
    asin: string
    title: string
    brand: string | null
    note: string
    internalPriceCents: number | null
  },
) {
  const id = crypto.randomUUID()
  await db.insert(manualProducts).values({ id, ...data })
  return id
}

export async function markManualProductsConsumed(db: Db, themeId: string, asins: string[]) {
  if (asins.length === 0) return
  await db
    .update(manualProducts)
    .set({ consumedAt: Date.now() })
    .where(
      and(eq(manualProducts.themeId, themeId), inArray(manualProducts.asin, asins), isNull(manualProducts.consumedAt)),
    )
}
