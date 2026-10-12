import { describe, expect, it } from 'vitest'
import {
  decodeCallback,
  draftCard,
  encodeCallback,
  extractPrice,
  extractUrls,
  findPriceInText,
  guessTitle,
  parseAllowedUserIds,
  parseDraftReply,
  parsePriceCents,
  pickAmazonUrl,
  queuedCard,
} from '../../server/domain/intake'

const shared =
  'Mira este producto en Amazon: Philips Avent Vigilabebés con cámara y visión nocturna https://amzn.eu/d/abc123X'

describe('enlaces compartidos', () => {
  it('extrae URLs del texto y de las entidades de Telegram', () => {
    expect(extractUrls(shared)).toEqual(['https://amzn.eu/d/abc123X'])
    expect(extractUrls('mira esto', [{ type: 'text_link', offset: 0, length: 4, url: 'https://www.amazon.es/dp/B08N5WRWNW' }])).toEqual([
      'https://www.amazon.es/dp/B08N5WRWNW',
    ])
  })

  it('usa el ASIN de amazon.es directamente y deja los enlaces cortos para resolver', () => {
    expect(pickAmazonUrl(['https://www.amazon.es/dp/B08N5WRWNW?ref=x'])).toEqual({ asin: 'B08N5WRWNW' })
    expect(pickAmazonUrl(['https://amzn.eu/d/abc123X'])).toEqual({ shortUrl: 'https://amzn.eu/d/abc123X' })
    expect(pickAmazonUrl(['https://link.amazon/B067ikL8E'])).toEqual({ shortUrl: 'https://link.amazon/B067ikL8E' })
    expect(pickAmazonUrl(['https://example.com/x'])).toBeNull()
  })

  it('adivina el título quitando la URL y las coletillas de la app de Amazon', () => {
    expect(guessTitle(shared, ['https://amzn.eu/d/abc123X'])).toBe(
      'Philips Avent Vigilabebés con cámara y visión nocturna',
    )
    expect(guessTitle('https://amzn.eu/d/abc', ['https://amzn.eu/d/abc'])).toBeNull()
    expect(guessTitle('Amazon.es: Cuna de viaje plegable', [])).toBe('Cuna de viaje plegable')
  })
})

describe('precios', () => {
  it.each([
    ['19,99', 1999],
    ['19.99 €', 1999],
    ['€19,99', 1999],
    ['1.299,99 €', 129999],
    ['20 euros', 2000],
    ['7,5', 750],
  ])('%s → %i céntimos', (input, cents) => {
    expect(parsePriceCents(input)).toBe(cents)
  })

  it.each(['hola', '', '0', 'precio bajísimo'])('no es un precio: %s', (input) => {
    expect(parsePriceCents(input)).toBeNull()
  })

  it('separa el precio del texto compartido', () => {
    const { priceCents, rest } = extractPrice(`${shared} 34,90€`)
    expect(priceCents).toBe(3490)
    expect(guessTitle(rest, ['https://amzn.eu/d/abc123X'])).toBe('Philips Avent Vigilabebés con cámara y visión nocturna')
  })

  it('encuentra un precio con € dentro de un comentario', () => {
    expect(findPriceInText('Está a 34,90€ hoy')).toBe(3490)
    expect(findPriceInText('talla 3 pack 204')).toBeNull()
  })
})

describe('respuestas a la tarjeta', () => {
  it('distingue precio, título, comentario y quitar precio', () => {
    expect(parseDraftReply('24,95')).toEqual({ field: 'price', priceCents: 2495 })
    expect(parseDraftReply('precio: 24,95 €')).toEqual({ field: 'price', priceCents: 2495 })
    expect(parseDraftReply('sin precio')).toEqual({ field: 'price', priceCents: null })
    expect(parseDraftReply('t: Cuna de viaje')).toEqual({ field: 'title', title: 'Cuna de viaje' })
    expect(parseDraftReply('Ideal para viajes')).toEqual({ field: 'note', note: 'Ideal para viajes' })
    expect(parseDraftReply('c: 12 € más barata que ayer')).toEqual({ field: 'note', note: '12 € más barata que ayer' })
  })
})

describe('autorización y botones', () => {
  it('lee la lista de usuarios autorizados', () => {
    expect(parseAllowedUserIds(' 123, abc,456 ,')).toEqual(['123', '456'])
  })

  it('codifica y decodifica los botones dentro del límite de 64 bytes', () => {
    const themeId = '58201f75-f774-4f84-bb17-c94a55c11961'
    const cbs = [
      { kind: 'theme', draftId: 'k2J9xQ7pLm', themeId },
      { kind: 'cancel', draftId: 'k2J9xQ7pLm' },
      { kind: 'publish', publicationId: themeId },
      { kind: 'next', publicationId: themeId },
      { kind: 'discard', publicationId: themeId },
      { kind: 'text', publicationId: themeId },
      { kind: 'done', publicationId: themeId },
    ] as const
    for (const cb of cbs) {
      const data = encodeCallback(cb)
      expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64)
      expect(decodeCallback(data)).toEqual(cb)
    }
    expect(decodeCallback('z:1')).toBeNull()
  })
})

describe('tarjetas', () => {
  it('la tarjeta del borrador escapa HTML y ofrece las temáticas', () => {
    const { text, keyboard } = draftCard(
      { id: 'd1', asin: 'B08N5WRWNW', title: 'Pañales <talla 3>', note: '', priceCents: 1999 },
      [{ id: 'th1', name: 'Bebé' }],
    )
    expect(text).toContain('<b>Pañales &lt;talla 3&gt;</b>')
    expect(text).toContain('Precio: 19,99')
    expect(keyboard[0]![0]).toEqual({ text: '➕ Bebé', callback_data: 't:d1:th1' })
    expect(keyboard.at(-1)![0]!.callback_data).toBe('x:d1')
  })

  it('la tarjeta en cola ofrece acciones solo para lo pendiente', () => {
    const base = { needsReview: false, reviewReason: null, scheduledAt: null, publishedAt: null, error: null }
    const { text, keyboard } = queuedCard(
      { title: 'Cuna', themeName: 'Bebé', priceCents: null },
      [
        { ...base, id: 'p1', channelName: 'Bebé TG', channelType: 'telegram', status: 'candidata' },
        { ...base, id: 'p2', channelName: 'Bebé WA', channelType: 'whatsapp', status: 'candidata' },
        { ...base, id: 'p3', channelName: 'Otro', channelType: 'telegram', status: 'publicada', publishedAt: 1 },
      ],
      { formatTime: () => '16:10', nextCycle: 1, panelUrl: 'https://x/cola' },
    )
    expect(text).toContain('Sin precio')
    expect(text).toContain('Otro: publicada a las 16:10 ✅')
    expect(keyboard.map((r) => r.map((b) => b.callback_data ?? b.url))).toEqual([
      ['p:p1', 'n:p1', 'd:p1'],
      ['w:p2', 'h:p2', 'd:p2'],
      ['https://x/cola'],
    ])
  })
})
