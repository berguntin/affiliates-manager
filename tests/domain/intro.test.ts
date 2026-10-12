import { describe, expect, it } from 'vitest'
import { INTRO_MAX, buildIntroUserMessage, validateIntro } from '../../server/domain/messages/intro'

const product = { title: 'Cochecito de bebé plegable ultraligero con capota', brand: 'Marca' }

describe('entradilla con IA', () => {
  it('acepta una frase de enganche y limpia comillas y espacios', () => {
    expect(validateIntro('  «¡Atentos, familias!   Esta os va a encantar 👀»\n', product)).toEqual({
      ok: true,
      intro: '¡Atentos, familias! Esta os va a encantar 👀',
    })
  })

  it.each([
    ['', 'vacía'],
    ['a'.repeat(INTRO_MAX + 1), `más de ${INTRO_MAX} caracteres`],
    ['Primera línea\nSegunda línea', 'más de una línea'],
    ['Míralo en https://amazon.es', 'contiene un enlace'],
    ['Corre a <b>verlo</b>', 'contiene formato o hashtags'],
    ['Ideal para #bebés', 'contiene formato o hashtags'],
    ['Solo 3 días', 'contiene cifras, precios o porcentajes'],
    ['Ahorra un buen pellizco en €', 'contiene cifras, precios o porcentajes'],
    ['¡Qué precio tan bueno!', 'menciona «precio»'],
    ['Está en su mínimo histórico', 'menciona «mínimo histórico»'],
    ['Nunca ha estado así', 'menciona «nunca visto»'],
    ['Con envío rápido', 'menciona «envío»'],
    ['Un cochecito de bebé plegable que lo cambia todo', 'repite el título'],
  ])('rechaza %j (%s)', (raw, reason) => {
    expect(validateIntro(raw, product)).toEqual({ ok: false, reason })
  })

  it('no confunde palabras que solo contienen una prohibida', () => {
    expect(validateIntro('¡Qué cosa más preciosa para el paseo!', product).ok).toBe(true)
  })

  it('pasa el producto como datos marcados y usa un tono por defecto', () => {
    const message = buildIntroUserMessage({ ...product, themeName: 'Bebés', tone: '' })
    expect(message).toContain('<titulo>Cochecito de bebé plegable ultraligero con capota</titulo>')
    expect(message).toContain('<marca>Marca</marca>')
    expect(message).toContain('Tono: cercano y natural')
  })
})
