import { getQueueItem } from '../../../services/queue'

export default defineEventHandler(async (event) => {
  return (await getQueueItem(useDb(), requireParam(event, 'id'))) ?? notFound('Publicación')
})
