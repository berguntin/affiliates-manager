import { describe, expect, it } from 'vitest'
import {
  DESCRIPTION_MAX,
  DESCRIPTION_SYSTEM_PROMPT,
  buildDescriptionUserMessage,
  validateDescription,
} from '../../server/domain/messages/description'

const input = {
  title: 'Cochecito de bebé plegable ultraligero con capota',
  notes: 'lo usamos a diario, cabe en el maletero del coche pequeño, 2 años y sigue perfecto',
}

describe('texto propio redactado con IA', () => {
  it('acepta un texto basado en las notas y limpia comillas y espacios', () => {
    const raw = '  «Lo usamos a diario   y, después de 2 años, sigue perfecto.\n\nCabe hasta en un maletero pequeño 🚗»\n'
    expect(validateDescription(raw)).toEqual({
      ok: true,
      text: 'Lo usamos a diario y, después de 2 años, sigue perfecto.\n\nCabe hasta en un maletero pequeño 🚗',
    })
  })

  it.each([
    ['', 'vacío'],
    ['  «»  ', 'vacío'],
    ['a'.repeat(DESCRIPTION_MAX + 1), `más de ${DESCRIPTION_MAX} caracteres`],
  ])('rechaza %j (%s)', (raw, reason) => {
    expect(validateDescription(raw)).toEqual({ ok: false, reason })
  })

  it.each([
    'Pesa solo 5 kilos y es 100% algodón',
    'Ahora a 9,99 €, un 30% menos: mínimo histórico',
    'Con envío rápido a casa en 24 h',
    'Un cochecito de bebé plegable ultraligero con capota que lo cambia todo',
    'Míralo en www.amazon.es #oferta',
    'Lo **recomendamos** mucho <3',
  ])('no filtra el contenido que pide el usuario: %j', (raw) => {
    expect(validateDescription(raw)).toEqual({ ok: true, text: raw })
  })

  it('acepta textos de hasta el máximo de caracteres', () => {
    const raw = 'a'.repeat(DESCRIPTION_MAX)
    expect(validateDescription(raw)).toEqual({ ok: true, text: raw })
  })

  it('el prompt pide usar todo lo que dicen las notas sin rechazarlo', () => {
    expect(DESCRIPTION_SYSTEM_PROMPT).toContain('Usa todo lo que digan las notas')
    expect(DESCRIPTION_SYSTEM_PROMPT).toContain('No lo rechaces')
    expect(DESCRIPTION_SYSTEM_PROMPT).not.toMatch(/Cuenta solo lo que dicen las notas|No menciones precios|No prometas envío/)
  })

  it('marca producto y notas como datos', () => {
    const message = buildDescriptionUserMessage({ ...input, brand: 'Marca', themeName: 'Bebés', tone: '' })
    expect(message).toContain('<titulo>Cochecito de bebé plegable ultraligero con capota</titulo>')
    expect(message).toContain('<marca>Marca</marca>')
    expect(message).toContain(`<notas>${input.notes}</notas>`)
    expect(message).toContain('Tono: cercano y natural')
  })
})
