import { themeInputSchema } from '../../../shared/schemas'
import { createTheme } from '../../services/themes'

export default defineEventHandler(async (event) => {
  const data = await readValidated(event, themeInputSchema)
  setResponseStatus(event, 201)
  return createTheme(useDb(), data)
})
