import { getTheme } from '../../../services/themes'

export default defineEventHandler(async (event) => {
  return (await getTheme(useDb(), requireParam(event, 'id'))) ?? notFound('Temática')
})
