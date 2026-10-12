import { publish } from '../../../services/queue'

/** Telegram: envía. WhatsApp: marca como publicada tras compartir. Siempre recomprueba el precio. */
export default defineEventHandler(async (event) => {
  const id = requireParam(event, 'id')
  return handleDomainErrors(() => publish(useDb(), id, queueContext()))
})
