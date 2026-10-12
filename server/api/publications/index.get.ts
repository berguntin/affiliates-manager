import { z } from 'zod'
import { PUBLICATION_STATUSES } from '../../../shared/types'
import { listQueue } from '../../services/queue'

const querySchema = z.object({
  status: z
    .string()
    .default('candidata,aprobada,programada')
    .transform((s) => s.split(','))
    .pipe(z.array(z.enum(PUBLICATION_STATUSES)).min(1)),
  channelId: z.string().optional(),
  themeId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
})

export default defineEventHandler(async (event) => {
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Filtro no válido' })
  const { status, ...rest } = parsed.data
  return listQueue(useDb(), { statuses: status, ...rest })
})
