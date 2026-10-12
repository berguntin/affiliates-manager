import { getChannelAdapter } from '../../../channels'
import { getChannel } from '../../../services/channels'

/** Comprueba la configuración del canal (Telegram: el bot es administrador). */
export default defineEventHandler(async (event) => {
  const channel = (await getChannel(useDb(), requireParam(event, 'id'))) ?? notFound('Canal')
  const adapter = getChannelAdapter(channel.type, useEnv())
  if (!adapter.verify) return { ok: true, detail: 'Canal asistido: no requiere verificación' }
  return adapter.verify(channel)
})
