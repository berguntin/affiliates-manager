import { channelInputSchema } from '../../../shared/schemas'
import { createChannel } from '../../services/channels'

export default defineEventHandler(async (event) => {
  const data = await readValidated(event, channelInputSchema)
  setResponseStatus(event, 201)
  return createChannel(useDb(), data)
})
