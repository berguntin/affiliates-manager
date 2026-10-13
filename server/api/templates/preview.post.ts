import { z } from 'zod'
import { MESSAGE_FORMATS } from '../../../shared/types'
import { renderMessage } from '../../domain/messages/render'
import { listChannels } from '../../services/channels'
import { FORMAT_BY_CHANNEL } from '../../services/scan'

const bodySchema = z.object({
  format: z.enum(MESSAGE_FORMATS),
  body: z.string().max(3000),
  withPrice: z.boolean().default(true),
})

/** Vista previa de una plantilla con un producto de ejemplo. */
const SAMPLE_INTRO = '¡Atentos, familias! Este os va a interesar 👀'

export default defineEventHandler(async (event) => {
  const { format, body, withPrice } = await readValidated(event, bodySchema)
  // Los avisos breves dependen del canal: se muestra el primero de este formato que los tenga.
  const legalChannel = (await listChannels(useDb())).find(
    (c) => c.active && c.legalUrl && FORMAT_BY_CHANNEL[c.type] === format,
  )
  const rendered = renderMessage(format, body, {
    title: 'Cochecito de bebé plegable ultraligero con capota',
    brand: 'Marca',
    note: withPrice ? null : 'Texto propio del alta manual',
    // Solo si la IA está activa; si no, el mensaje real sale sin entradilla.
    intro: useEnv().ANTHROPIC_API_KEY ? SAMPLE_INTRO : null,
    link: 'https://www.amazon.es/dp/B0MOCK0003?tag=micanal-21',
    timezone: useTimezone(),
    price: withPrice
      ? { priceCents: 17990, savingBasisCents: 22900, basisIsListPrice: false, discountPct: 21, dealBadge: null, checkedAt: Date.now() }
      : null,
    legalUrl: legalChannel?.legalUrl ?? null,
    emoji: '🍼',
  })
  return { ...rendered, legalChannel: legalChannel?.name ?? null }
})
