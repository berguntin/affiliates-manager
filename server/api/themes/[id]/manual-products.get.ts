import { and, desc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = useDb()
  const { manualProducts } = schema
  return db
    .select()
    .from(manualProducts)
    .where(and(eq(manualProducts.themeId, requireParam(event, 'id'))))
    .orderBy(desc(manualProducts.createdAt))
    .limit(50)
})
