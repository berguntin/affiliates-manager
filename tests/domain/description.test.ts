import { describe, expect, it } from 'vitest'
import {
  DESCRIPTION_MAX,
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
    expect(validateDescription(raw, input)).toEqual({
      ok: true,
      text: 'Lo usamos a diario y, después de 2 años, sigue perfecto.\n\nCabe hasta en un maletero pequeño 🚗',
    })
  })

  it.each([
    ['', 'vacío'],
    ['a'.repeat(DESCRIPTION_MAX + 1), `más de ${DESCRIPTION_MAX} caracteres`],
    ['Míralo en www.amazon.es', 'contiene un enlace'],
    ['Lo **recomendamos** mucho', 'contiene formato o hashtags'],
    ['Ahora un 30% menos', 'contiene precios o porcentajes'],
    ['Pesa solo 5 kilos', 'contiene una cifra que no está en las notas (5)'],
    ['Y con envío rápido a casa', 'menciona «envío»'],
    ['Un cochecito de bebé plegable que lo cambia todo', 'repite el título'],
  ])('rechaza %j (%s)', (raw, reason) => {
    expect(validateDescription(raw, input)).toEqual({ ok: false, reason })
  })

  it('permite lo que ya está en las notas del usuario', () => {
    const notes = 'cochecito de bebé plegable que llevamos de viaje, el envío llegó al día siguiente'
    expect(validateDescription('Nuestro cochecito de bebé plegable de viaje. El envío llegó al día siguiente.', { ...input, notes }).ok).toBe(true)
  })

  it('marca producto y notas como datos', () => {
    const message = buildDescriptionUserMessage({ ...input, brand: 'Marca', themeName: 'Bebés', tone: '' })
    expect(message).toContain('<titulo>Cochecito de bebé plegable ultraligero con capota</titulo>')
    expect(message).toContain('<marca>Marca</marca>')
    expect(message).toContain(`<notas>${input.notes}</notas>`)
    expect(message).toContain('Tono: cercano y natural')
  })
})
