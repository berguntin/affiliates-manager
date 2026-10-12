import { z } from 'zod'
import { applyAction } from '../../../services/queue'

const bodySchema = z.object({
  action: z.enum(['approve', 'schedule', 'unschedule', 'discard', 'edit']),
  text: z.string().max(4096).optional(),
  scheduledAt: z.number().int().positive().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const id = requireParam(event, 'id')
  const { action, ...payload } = await readValidated(event, bodySchema)
  return handleDomainErrors(() => applyAction(useDb(), id, action, payload, queueContext()))
})
