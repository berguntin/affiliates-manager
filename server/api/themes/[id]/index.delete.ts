import { deleteTheme } from '../../../services/themes'

export default defineEventHandler(async (event) => {
  if (!(await deleteTheme(useDb(), requireParam(event, 'id')))) notFound('Temática')
  setResponseStatus(event, 204)
  return null
})
