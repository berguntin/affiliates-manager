import { manualProductInputSchema } from '../../../../shared/schemas'
import { parseAsin } from '../../../domain/affiliate'
import { addManualProduct } from '../../../services/manual-products'
import { withRun } from '../../../services/runs'
import { scanTheme } from '../../../services/scan'
import { getTheme } from '../../../services/themes'
import { createCopywriter } from '../../../services/copywriter'

/** Alta manual: guarda el producto y crea la candidata al momento. */
export default defineEventHandler(async (event) => {
  const db = useDb()
  const themeId = requireParam(event, 'id')
  const input = await readValidated(event, manualProductInputSchema.omit({ themeId: true }))
  const theme = (await getTheme(db, themeId)) ?? notFound('Temática')
  if (theme.provider !== 'manual') {
    throw createError({ statusCode: 400, message: 'La temática no usa la fuente «Alta manual»' })
  }
  const asin = parseAsin(input.asinOrUrl)
  if (!asin) {
    throw createError({ statusCode: 400, message: 'No se reconoce el ASIN ni una URL de amazon.es' })
  }
  await addManualProduct(db, {
    themeId,
    asin,
    title: input.title,
    brand: input.brand,
    note: input.note,
    internalPriceCents: input.internalPriceCents,
  })
  const { result, runId } = await withRun(db, 'scan', 'manual', themeId, (log) =>
    scanTheme(db, theme, log, { timezone: useTimezone(), copywriter: createCopywriter(useEnv()) }),
  )
  const run = (await db.query.runs.findFirst({ where: (r, { eq }) => eq(r.id, runId) }))!
  setResponseStatus(event, 201)
  return { asin, created: result ?? 0, errors: run.errors }
})
