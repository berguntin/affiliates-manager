import { z } from 'zod'
import { MESSAGE_FORMATS, type MessageFormat } from '../../../shared/types'
import { TEMPLATE_VARIABLES } from '../../domain/messages/render'
import { validateTemplate } from '../../domain/messages/template'
import { saveTemplate } from '../../services/templates'

const bodySchema = z.object({
  themeId: z.string().nullable().default(null),
  /** null = volver a la plantilla de serie. */
  body: z.string().max(3000).nullable(),
})

export default defineEventHandler(async (event) => {
  const format = requireParam(event, 'format') as MessageFormat
  if (!MESSAGE_FORMATS.includes(format)) notFound('Formato')
  const { themeId, body } = await readValidated(event, bodySchema)
  if (body !== null) {
    const errors = validateTemplate(body, TEMPLATE_VARIABLES)
    if (errors.length) throw createError({ statusCode: 400, statusMessage: errors.join(' · ') })
  }
  await saveTemplate(useDb(), themeId, format, body)
  return { ok: true }
})
