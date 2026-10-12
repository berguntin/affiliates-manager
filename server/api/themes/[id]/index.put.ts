import { themeInputSchema } from '../../../shared/schemas'
import { updateTheme } from '../../services/themes'

export default defineEventHandler(async (event) => {
  const id = requireParam(event, 'id')
  const data = await readValidated(event, themeInputSchema)
  return (await updateTheme(useDb(), id, data)) ?? notFound('Temática')
})
