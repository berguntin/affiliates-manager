import { deleteChannel } from '../../services/channels'

export default defineEventHandler(async (event) => {
  if (!(await deleteChannel(useDb(), requireParam(event, 'id')))) notFound('Canal')
  setResponseStatus(event, 204)
  return null
})
