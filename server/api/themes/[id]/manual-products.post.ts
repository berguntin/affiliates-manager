import { checkManualPrices, manualProductInputSchema } from '../../../../shared/schemas'
import { resolveProductInput } from '../../../services/intake'
import { addManualProduct } from '../../../services/manual-products'
import { withRun } from '../../../services/runs'
import { scanTheme } from '../../../services/scan'
import { getTheme } from '../../../services/themes'
import { createCopywriter } from '../../../services/copywriter'
import { listChannels } from '../../../services/channels'

/** Alta manual: guarda el producto y crea la candidata al momento. */
export default defineEventHandler(async (event) => {
  const db = useDb()
  const themeId = requireParam(event, 'id')
  const input = await readValidated(event, manualProductInputSchema.omit({ themeId: true }).superRefine(checkManualPrices))
  const theme = (await getTheme(db, themeId)) ?? notFound('Temática')
  if (theme.provider !== 'manual') {
    throw createError({ statusCode: 400, message: 'La temática no usa la fuente «Alta manual»' })
  }
  const resolved = await resolveProductInput(input.asinOrUrl)
  if (!resolved) {
    throw createError({
      statusCode: 400,
      message: 'No se reconoce el producto: pega un ASIN, una URL de amazon.es o un enlace compartido desde la app de Amazon',
    })
  }
  const { asin, affiliateLink } = resolved
  await addManualProduct(db, {
    themeId,
    asin,
    title: input.title,
    brand: input.brand,
    note: input.note,
    priceCents: input.priceCents,
    basisPriceCents: input.basisPriceCents,
    basisType: input.basisPriceCents != null ? input.basisType : null,
    affiliateUrl: affiliateLink?.url ?? null,
    affiliateTag: affiliateLink?.tag ?? null,
  })
  const { result, runId } = await withRun(db, 'scan', 'manual', themeId, (log) =>
    scanTheme(db, theme, log, { timezone: useTimezone(), copywriter: createCopywriter(useEnv()) }),
  )
  const run = (await db.query.runs.findFirst({ where: (r, { eq }) => eq(r.id, runId) }))!
  const errors = [...run.errors]
  if (affiliateLink) {
    const themeChannels = (await listChannels(db)).filter((c) => theme.channelIds.includes(c.id))
    if (!themeChannels.some((c) => c.trackingId === affiliateLink.tag)) {
      errors.push(
        `El enlace corto lleva el tag «${affiliateLink.tag}», que no coincide con ningún canal de la temática; se usa el enlace estándar`,
      )
    }
  }
  setResponseStatus(event, 201)
  return { asin, created: result ?? 0, errors }
})
