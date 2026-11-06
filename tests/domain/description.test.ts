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
    ['Ahora a 9,99 €', 'contiene precios'],
    ['Ahora un 30% menos', 'contiene un porcentaje que no está en las notas (30%)'],
    ['Pesa solo 5 kilos', 'contiene una cifra que no está en las notas (5)'],
    ['Y con envío rápido a casa', 'menciona «envío»'],
    ['Un cochecito de bebé plegable que lo cambia todo', 'repite el título'],
  ])('rechaza %j (%s)', (raw, reason) => {
    expect(validateDescription(raw, input)).toEqual({ ok: false, reason })
  })

  it('acepta los porcentajes de las notas (composición) pero no como descuento', () => {
    const notes = 'camiseta 100% algodón, las toallitas son 99,9% agua, ahora un 20% menos'
    expect(validateDescription('Es 100% algodón y las toallitas, 99,9 % agua. Suavísimas.', { ...input, notes })).toEqual({
      ok: true,
      text: 'Es 100% algodón y las toallitas, 99,9 % agua. Suavísimas.',
    })
    expect(validateDescription('Las toallitas son 99.9% agua', { ...input, notes }).ok).toBe(true)
    expect(validateDescription('Un 50% de algodón', { ...input, notes })).toEqual({
      ok: false,
      reason: 'contiene un porcentaje que no está en las notas (50%)',
    })
    const composition = 'camiseta 100% algodón'
    expect(validateDescription('Ahora con un -100% de suavidad', { ...input, notes: composition })).toEqual({
      ok: false,
      reason: 'usa un porcentaje como descuento',
    })
    expect(validateDescription('Ahora un 100% menos de arrugas', { ...input, notes: composition })).toEqual({
      ok: false,
      reason: 'usa un porcentaje como descuento',
    })
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
