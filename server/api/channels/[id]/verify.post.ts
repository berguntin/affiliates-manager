import { getChannelAdapter } from '../../../channels'
import { getChannel } from '../../../services/channels'

/** Comprueba la configuración del canal (Telegram: el bot es administrador; WhatsApp: la pasarela está conectada). */
export default defineEventHandler(async (event) => {
  const channel = (await getChannel(useDb(), requireParam(event, 'id'))) ?? notFound('Canal')
  const env = useEnv()
  const adapter = getChannelAdapter(channel, env)
  if (!adapter.verify) {
    if (channel.type === 'whatsapp' && env.WHATSAPP_GATEWAY_TOKEN) {
      return {
        ok: true,
        detail: 'Canal asistido. Para publicarlo automáticamente, pon como identificador el id del canal en la pasarela (…@newsletter)',
      }
    }
    return { ok: true, detail: 'Canal asistido: no requiere verificación' }
  }
  return adapter.verify(channel)
})
