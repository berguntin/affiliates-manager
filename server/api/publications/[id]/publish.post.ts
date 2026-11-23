import { publishInputSchema } from '../../../../shared/schemas'
import { publish } from '../../../services/queue'

/** intent `send`: automatic channels send now. intent `mark`: assisted channels, after sharing. Always rechecks the price. */
export default defineEventHandler(async (event) => {
  const id = requireParam(event, 'id')
  const { intent } = await readValidated(event, publishInputSchema)
  return handleDomainErrors(() => publish(useDb(), id, queueContext(), intent))
})
