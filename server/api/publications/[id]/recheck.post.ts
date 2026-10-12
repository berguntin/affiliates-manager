import { recheck } from '../../../services/queue'

/** Recomprueba el precio (p. ej. antes de compartir en WhatsApp). */
export default defineEventHandler(async (event) => {
  const id = requireParam(event, 'id')
  return handleDomainErrors(() => recheck(useDb(), id, queueContext()))
})
