import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATES } from '../../server/domain/messages/defaults'
import {
  LEGAL,
  checkRequiredElements,
  formatCheckedAt,
  renderMessage,
  type MessageData,
} from '../../server/domain/messages/render'
import { renderTemplate, validateTemplate } from '../../server/domain/messages/template'

/** Intl separa importe y símbolo con espacio no separable. */
const eur = (v: string) => `${v}\u00a0€`

const link = 'https://www.amazon.es/dp/B0MOCK0001?tag=canal-21&linkCode=ogi'
const checkedAt = Date.UTC(2026, 9, 12, 12, 11) // 14:11 en Madrid (CEST)

const withPrice: MessageData = {
  title: 'Pañales <talla 3> & más',
  brand: 'Dodot',
  note: null,
  link,
  price: {
    priceCents: 1999,
    savingBasisCents: 2999,
    basisIsListPrice: false,
    discountPct: 33,
    dealBadge: null,
    checkedAt,
  },
  timezone: 'Europe/Madrid',
}

const manual: MessageData = { ...withPrice, price: null, note: 'Ideal para la canastilla' }

describe('renderTemplate', () => {
  it('sustituye variables y secciones', () => {
    const out = renderTemplate('{{#a}}A={{a}} {{/a}}{{^b}}sin b{{/b}}', { a: 'x' }, (v) => v)
    expect(out).toBe('A=x sin b')
  })

  it('anida secciones distintas', () => {
    const t = '{{#a}}[{{#b}}{{b}}{{/b}}]{{/a}}'
    expect(renderTemplate(t, { a: 1, b: 2 }, String)).toBe('[2]')
    expect(renderTemplate(t, { a: 1 }, String)).toBe('[]')
  })

  it('valida variables desconocidas y secciones sin cerrar', () => {
    expect(validateTemplate('{{foo}} {{#a}}', ['a'])).toEqual([
      'Variable desconocida: {{foo}}',
      'Falta cerrar {{/a}}',
    ])
  })
})

describe('formatCheckedAt', () => {
  it('usa la hora peninsular con cambio de horario', () => {
    expect(formatCheckedAt(checkedAt, 'Europe/Madrid')).toBe('12/10/2026 a las 14:11, hora peninsular')
    expect(formatCheckedAt(Date.UTC(2026, 11, 1, 12, 0), 'Europe/Madrid')).toBe(
      '01/12/2026 a las 13:00, hora peninsular',
    )
  })
})

describe('renderMessage', () => {
  it('Telegram con precio: escapa HTML e incluye fecha, descargo y aviso', () => {
    const { text, warnings } = renderMessage('telegram-html', DEFAULT_TEMPLATES['telegram-html'], withPrice)
    expect(warnings).toEqual([])
    expect(text).toContain('<b>Pañales &lt;talla 3&gt; &amp; más</b>')
    expect(text).toContain(`🔻 <b>-33%</b> (antes ${eur('29,99')})`)
    expect(text).toContain(
      `💶 Precio: <b>${eur('19,99')}</b> (consultado el 12/10/2026 a las 14:11, hora peninsular)`,
    )
    expect(text).toContain(`<i>${LEGAL.priceDisclaimer}</i>`)
    expect(text.endsWith(`<i>${LEGAL.affiliate}</i>`)).toBe(true)
    expect(text).toContain(link.replace(/&/g, '&amp;'))
    expect(checkRequiredElements(text, { link, withPrice: true })).toEqual([])
  })

  it('WhatsApp sin precio (alta manual): sin descargo de precio y con «consulta el precio»', () => {
    const { text } = renderMessage('whatsapp', DEFAULT_TEMPLATES.whatsapp, manual)
    expect(text).toContain('🛍️ *Pañales <talla 3> & más*')
    expect(text).toContain(`💶 ${LEGAL.noPrice}`)
    expect(text).toContain('Ideal para la canastilla')
    expect(text).not.toContain(LEGAL.priceDisclaimer)
    expect(text).not.toContain('🔻')
    expect(text).toContain(`_${LEGAL.affiliate}_`)
    expect(checkRequiredElements(text, { link, withPrice: false })).toEqual([])
  })

  it('con enlace al aviso legal, sustituye los dos párrafos por una línea enlazada', () => {
    const legalUrl = 'https://t.me/baby_ofertas/2?a=1&b=2'
    const tg = renderMessage('telegram-html', DEFAULT_TEMPLATES['telegram-html'], { ...withPrice, legalUrl }).text
    expect(tg).not.toContain(LEGAL.affiliate)
    expect(tg).not.toContain(LEGAL.priceDisclaimer)
    expect(tg.endsWith('ℹ️ <a href="https://t.me/baby_ofertas/2?a=1&amp;b=2">Enlace de afiliado · precio sujeto a cambios</a>')).toBe(true)
    expect(tg).toContain('(consultado el 12/10/2026 a las 14:11, hora peninsular)')
    expect(checkRequiredElements(tg, { link, withPrice: true, legalUrl })).toEqual([])
    // Sin el enlace del canal, la versión breve no basta.
    expect(checkRequiredElements(tg, { link, withPrice: true })).toEqual([
      'el aviso de afiliado',
      'el aviso de que el precio puede cambiar',
    ])

    const wa = renderMessage('whatsapp', DEFAULT_TEMPLATES.whatsapp, { ...manual, legalUrl }).text
    expect(wa.endsWith(`ℹ️ Enlace de afiliado: ${legalUrl}`)).toBe(true)
    expect(checkRequiredElements(wa, { link, withPrice: false, legalUrl })).toEqual([])
  })

  it('rotula el PVP recomendado como tal y no como «antes»', () => {
    const list = { ...withPrice, price: { ...withPrice.price!, basisIsListPrice: true } }
    const { text } = renderMessage('whatsapp', DEFAULT_TEMPLATES.whatsapp, list)
    expect(text).toContain(`(PVP rec. ${eur('29,99')})`)
    expect(text).not.toContain('antes')
  })

  it('añade bloque de precio y enlace aunque la plantilla los omita', () => {
    const { text, warnings } = renderMessage('whatsapp', '{{titulo}}', withPrice)
    expect(text).toContain('consultado el 12/10/2026')
    expect(text).toContain(link)
    expect(warnings).toContain('La plantilla no incluye {{enlace}}: se ha añadido al final')
  })

  it('pone la entradilla escapada antes de la ficha y la omite si no hay', () => {
    const intro = { ...withPrice, intro: '¡Atentos <familias>!' }
    const { text } = renderMessage('telegram-html', DEFAULT_TEMPLATES['telegram-html'], intro)
    expect(text.startsWith('¡Atentos &lt;familias&gt;!\n\n🛍️ <b>')).toBe(true)
    expect(renderMessage('telegram-html', DEFAULT_TEMPLATES['telegram-html'], withPrice).text.startsWith('🛍️')).toBe(true)
  })

  it('añade la entradilla al principio en plantillas que no la incluyen', () => {
    const { text } = renderMessage('whatsapp', '{{titulo}} {{enlace}}', { ...withPrice, intro: '¡Mirad esto!' })
    expect(text.startsWith('¡Mirad esto!\n\nPañales')).toBe(true)
  })

  it('trunca títulos largos sin reescribirlos', () => {
    const long = { ...manual, title: 'Palabra '.repeat(40) }
    const { text } = renderMessage('whatsapp', '{{titulo}} {{enlace}}', long)
    expect(text.split('\n')[0]!.length).toBeLessThan(130 + link.length)
    expect(text).toContain('…')
  })

  it('detecta textos editados sin los elementos obligatorios', () => {
    expect(checkRequiredElements('Hola', { link, withPrice: true })).toEqual([
      'el enlace del producto',
      'el aviso de afiliado',
      'el aviso de que el precio puede cambiar',
      'la fecha y hora de consulta del precio',
    ])
  })
})
