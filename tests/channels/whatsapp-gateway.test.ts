import { describe, expect, it, vi } from 'vitest'
import { getChannelAdapter, isAutomaticChannel } from '../../server/channels'
import { UncertainDeliveryError } from '../../server/channels/types'
import { WhatsAppGatewayAdapter } from '../../server/channels/whatsapp-gateway'

const channel = { type: 'whatsapp' as const, name: 'Test', identifier: '120363171744447809@newsletter' }
const message = {
  text: '*Oferta* 19,99 € (consultado el 23/11 a las 10:00)\nhttps://www.amazon.es/dp/B0MOCK0001?tag=wa-21\nℹ️ Enlace de afiliado',
  link: 'https://www.amazon.es/dp/B0MOCK0001?tag=wa-21',
}

function fakeFetch(...responses: [number, unknown][]) {
  const fn = vi.fn<typeof fetch>()
  for (const [status, body] of responses) {
    fn.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }))
  }
  return fn
}

const sleep = vi.fn().mockResolvedValue(undefined)
const adapter = (fetchFn: typeof fetch, base?: string, token = 'TOKEN') =>
  new WhatsAppGatewayAdapter(token, base, { fetchFn, sleep })

describe('WhatsAppGatewayAdapter', () => {
  it('sends the rendered text unchanged (link, tracking ID, disclosure, price time) to the channel', async () => {
    const fetchFn = fakeFetch([200, { sent: true, message: { id: 'wamid-1' } }])
    const result = await adapter(fetchFn).publish(channel, message)
    expect(result.externalId).toBe('wamid-1')
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('https://gate.whapi.cloud/messages/text')
    expect(init?.method).toBe('POST')
    expect(init?.redirect).toBe('manual')
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer TOKEN')
    const body = JSON.parse(String(init?.body))
    expect(body).toEqual({ to: channel.identifier, body: message.text })
    expect(body.body).toContain('tag=wa-21')
    expect(body.body).toContain('Enlace de afiliado')
    expect(body.body).toContain('consultado el')
  })

  it('accepts the sent_message id shape and a custom https base URL', async () => {
    const fetchFn = fakeFetch([200, { sent: true, sent_message: { id: 'wamid-2' } }])
    const result = await adapter(fetchFn, 'https://gw.example.test/').publish(channel, message)
    expect(result.externalId).toBe('wamid-2')
    expect(fetchFn.mock.calls[0]![0]).toBe('https://gw.example.test/messages/text')
  })

  it('refuses a non-https gateway URL without sending the token', async () => {
    const fetchFn = fakeFetch()
    const error = await adapter(fetchFn, 'http://gate.whapi.cloud', 'SECRET-TOKEN').publish(channel, message).catch((e) => e)
    expect((error as Error).message).toContain('https://')
    expect((error as Error).message).not.toContain('SECRET-TOKEN')
    expect((error as Error).message).not.toContain('gate.whapi.cloud')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('treats sent:false as a refusal and a 2xx without id as an uncertain delivery', async () => {
    const refused = await adapter(fakeFetch([200, { sent: false }])).publish(channel, message).catch((e) => e)
    expect(refused).not.toBeInstanceOf(UncertainDeliveryError)
    expect((refused as Error).message).toContain('rechazó')

    const noId = await adapter(fakeFetch([200, { sent: true }])).publish(channel, message).catch((e) => e)
    expect(noId).toBeInstanceOf(UncertainDeliveryError)
  })

  it('retries a 429 but never a 5xx on send (not idempotent)', async () => {
    const limited = fakeFetch([429, { error: { message: 'Too many requests' } }], [200, { sent: true, message: { id: 'ok' } }])
    await expect(adapter(limited).publish(channel, message)).resolves.toEqual({ externalId: 'ok' })
    expect(limited).toHaveBeenCalledTimes(2)

    const failing = fakeFetch([502, { error: { message: 'Bad gateway' } }], [200, { sent: true, message: { id: 'dup' } }])
    const error = await adapter(failing).publish(channel, message).catch((e) => e)
    expect(error).toBeInstanceOf(UncertainDeliveryError)
    expect((error as Error).message).toContain('Pasarela de WhatsApp (502)')
    expect(failing).toHaveBeenCalledTimes(1)
  })

  it('does not retry a network error on send', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('connection reset'))
    const error = await adapter(fetchFn).publish(channel, message).catch((e) => e)
    expect(error).toBeInstanceOf(UncertainDeliveryError)
    expect((error as Error).message).toContain('connection reset')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('does not retry 4xx and never puts the token in error messages', async () => {
    const fetchFn = fakeFetch([401, { error: { message: 'Need channel authorization' } }])
    const error = await adapter(fetchFn, undefined, 'SECRET-TOKEN').publish(channel, message).catch((e) => e)
    expect(error).not.toBeInstanceOf(UncertainDeliveryError)
    expect((error as Error).message).toBe('Pasarela de WhatsApp (401): Need channel authorization')
    expect((error as Error).message).not.toContain('SECRET-TOKEN')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('rejects groups, chats and share URLs without calling the gateway', async () => {
    for (const identifier of ['120363000000000000@g.us', '34600000000@s.whatsapp.net', 'https://whatsapp.com/channel/0029Va']) {
      const fetchFn = fakeFetch()
      await expect(adapter(fetchFn).publish({ ...channel, identifier }, message)).rejects.toThrow('@newsletter')
      expect(fetchFn).not.toHaveBeenCalled()
    }
  })

  it('verify reports the connection state of the number', async () => {
    const ok = fakeFetch([200, { status: { code: 4, text: 'AUTH' } }])
    expect(await adapter(ok).verify(channel)).toMatchObject({ ok: true })
    expect(ok.mock.calls[0]![0]).toBe('https://gate.whapi.cloud/health?wakeup=false')
    expect(ok.mock.calls[0]![1]?.method).toBe('GET')

    expect(await adapter(fakeFetch([200, { status: { code: 2, text: 'QR' } }])).verify(channel)).toEqual({
      ok: false,
      detail: 'La pasarela no tiene el número conectado (estado: QR)',
    })
  })
})

describe('channel mode', () => {
  const link = { type: 'whatsapp' as const, identifier: 'https://whatsapp.com/channel/0029Va' }
  const newsletter = { type: 'whatsapp' as const, identifier: channel.identifier }

  it('keeps WhatsApp assisted without a gateway token', () => {
    expect(getChannelAdapter(newsletter, {}).mode).toBe('assisted')
    expect(isAutomaticChannel(newsletter, {})).toBe(false)
    expect(isAutomaticChannel({ type: 'telegram', identifier: '@canal' }, {})).toBe(true)
  })

  it('is automatic only with the token and a gateway channel id', () => {
    const env = { WHATSAPP_GATEWAY_TOKEN: 'TOKEN' }
    expect(getChannelAdapter(newsletter, env).mode).toBe('automatic')
    expect(getChannelAdapter(link, env).mode).toBe('assisted')
    expect(isAutomaticChannel(link, env)).toBe(false)
  })
})
