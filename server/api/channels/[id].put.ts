import { channelInputSchema } from '../../../shared/schemas'
import { updateChannel } from '../../services/channels'

export default defineEventHandler(async (event) => {
  const id = requireParam(event, 'id')
  const data = await readValidated(event, channelInputSchema)
  return (await updateChannel(useDb(), id, data)) ?? notFound('Canal')
})
