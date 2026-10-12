import { MESSAGE_FORMATS, type MessageFormat } from '../../../shared/types'
import { TEMPLATE_VARIABLES } from '../../domain/messages/render'
import { getTemplateRecord } from '../../services/templates'

export default defineEventHandler(async (event) => {
  const format = requireParam(event, 'format') as MessageFormat
  if (!MESSAGE_FORMATS.includes(format)) notFound('Formato')
  const themeId = (getQuery(event).themeId as string | undefined) || null
  return { ...(await getTemplateRecord(useDb(), themeId, format)), variables: TEMPLATE_VARIABLES }
})
