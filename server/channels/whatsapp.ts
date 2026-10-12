import type { ChannelAdapter } from './types'

/**
 * Publicación ASISTIDA: la API oficial de WhatsApp no permite publicar en Canales y las
 * librerías no oficiales arriesgan el baneo del número. El panel prepara el texto
 * (con el enlace, del que WhatsApp genera la vista previa) y la persona lo comparte.
 */
export class WhatsAppAssistedAdapter implements ChannelAdapter {
  readonly type = 'whatsapp' as const
  readonly mode = 'assisted' as const
  readonly format = 'whatsapp' as const
}
