import { WHATSAPP_NEWSLETTER_ID_RE } from '#shared/schemas'

/**
 * Channel mode for labels on the channel pages. The queue does not rely on this: each queue item
 * carries `automatic`, decided by the server.
 */
export function useChannelModes() {
  const { data } = useFetch('/api/settings/status', { key: 'settings-status' })
  const whatsappGateway = computed(() => Boolean(data.value?.whatsappAutomatic))
  const isAutomatic = (channel: { type: 'telegram' | 'whatsapp'; identifier: string }) =>
    channel.type === 'telegram' || (whatsappGateway.value && WHATSAPP_NEWSLETTER_ID_RE.test(channel.identifier))
  return { whatsappGateway, isAutomatic }
}
