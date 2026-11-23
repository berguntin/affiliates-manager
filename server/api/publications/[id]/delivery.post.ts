import { deliveryInputSchema } from '../../../../shared/schemas'
import { resolveDelivery } from '../../../services/queue'

/** After an uncertain send: the user says whether the message reached the channel. */
export default defineEventHandler(async (event) => {
  const id = requireParam(event, 'id')
  const { delivered } = await readValidated(event, deliveryInputSchema)
  return handleDomainErrors(() => resolveDelivery(useDb(), id, delivered, queueContext()))
})
