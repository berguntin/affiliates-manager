import { acceptReview } from '../../../services/queue'

export default defineEventHandler(async (event) => {
  const id = requireParam(event, 'id')
  return handleDomainErrors(() => acceptReview(useDb(), id, queueContext()))
})
