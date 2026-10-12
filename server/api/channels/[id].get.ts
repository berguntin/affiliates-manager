import { getChannel } from '../../services/channels'

export default defineEventHandler(async (event) => {
  return (await getChannel(useDb(), requireParam(event, 'id'))) ?? notFound('Canal')
})
