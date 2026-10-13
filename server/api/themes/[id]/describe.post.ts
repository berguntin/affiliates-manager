import { describeInputSchema } from '../../../../shared/schemas'
import { writeDescription } from '../../../services/copywriter'
import { getTheme } from '../../../services/themes'

/** «Redactar con IA»: convierte las notas del alta manual en el texto propio, sin guardarlo. */
export default defineEventHandler(async (event) => {
  const db = useDb()
  const theme = (await getTheme(db, requireParam(event, 'id'))) ?? notFound('Temática')
  const input = await readValidated(event, describeInputSchema)
  const result = await writeDescription(useEnv(), {
    title: input.title,
    brand: input.brand,
    notes: input.notes,
    themeName: theme.name,
    tone: theme.tone,
  })
  if (!result.ok) throw createError({ statusCode: 400, message: result.reason })
  return { text: result.text }
})
