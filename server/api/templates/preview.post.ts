import { z } from 'zod'
import { MESSAGE_FORMATS } from '../../../shared/types'
import { renderMessage } from '../../domain/messages/render'

const bodySchema = z.object({
  format: z.enum(MESSAGE_FORMATS),
  body: z.string().max(3000),
  withPrice: z.boolean().default(true),
})

/** Vista previa de una plantilla con un producto de ejemplo. */
export default defineEventHandler(async (event) => {
  const { format, body, withPrice } = await readValidated(event, bodySchema)
  return renderMessage(format, body, {
    title: 'Cochecito de bebé plegable ultraligero con capota',
    brand: 'Marca',
    note: withPrice ? null : 'Texto propio del alta manual',
    link: 'https://www.amazon.es/dp/B0MOCK0003?tag=micanal-21',
    timezone: useTimezone(),
    price: withPrice
      ? { priceCents: 17990, savingBasisCents: 22900, basisIsListPrice: false, discountPct: 21, dealBadge: null, checkedAt: Date.now() }
      : null,
  })
})
