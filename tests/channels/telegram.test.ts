import { afterEach, describe, expect, it, vi } from 'vitest'
import { TelegramAdapter } from '../../server/channels/telegram'

const channel = { type: 'telegram' as const, name: 'Test', identifier: '@canal_test' }
const message = { text: '<b>Hola</b>', link: 'https://www.amazon.es/dp/B0MOCK0001?tag=t-21' }

afterEach(() => vi.unstubAllGlobals())

function stubFetch(...responses: [number, unknown][]) {
  const fn = vi.fn()
  for (const [status, body] of responses) {
    fn.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }))
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('TelegramAdapter', () => {
  it('envía texto HTML con vista previa del enlace y botón, sin subir imágenes', async () => {
    const fetch = stubFetch([200, { ok: true, result: { message_id: 42 } }])
    const result = await new TelegramAdapter('TOKEN').publish(channel, message)
    expect(result.externalId).toBe('42')
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.telegram.org/botTOKEN/sendMessage')
    expect(JSON.parse(init.body)).toEqual({
      chat_id: '@canal_test',
      text: '<b>Hola</b>',
      parse_mode: 'HTML',
      link_preview_options: { url: message.link, prefer_large_media: true, show_above_text: true },
      reply_markup: { inline_keyboard: [[{ text: '🛒 Ver en Amazon', url: message.link }]] },
    })
  })

  it('reintenta tras un 429 respetando retry_after', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    stubFetch(
      [429, { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 3 } }],
      [200, { ok: true, result: { message_id: 7 } }],
    )
    const result = await new TelegramAdapter('TOKEN', { sleep }).publish(channel, message)
    expect(result.externalId).toBe('7')
    expect(sleep).toHaveBeenCalledWith(3000)
  })

  it('no reintenta errores 4xx y muestra la descripción', async () => {
    const fetch = stubFetch([400, { ok: false, error_code: 400, description: 'Bad Request: chat not found' }])
    await expect(new TelegramAdapter('TOKEN').publish(channel, message)).rejects.toThrow(
      'Telegram (400): Bad Request: chat not found',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('falla con un mensaje claro si no hay token', async () => {
    await expect(new TelegramAdapter(undefined).publish(channel, message)).rejects.toThrow('TELEGRAM_BOT_TOKEN')
  })
})
