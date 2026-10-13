import { describe, expect, it } from 'vitest'
import { createCopywriter, generateIntros, type Copywriter } from '../../server/services/copywriter'

const input = { title: 'Producto', brand: null, themeName: 'Bebés', tone: '' }

describe('redacción de entradillas', () => {
  it('sin ANTHROPIC_API_KEY queda desactivada y no genera nada', async () => {
    const copywriter = createCopywriter({})
    expect(copywriter.enabled).toBe(false)
    expect(await generateIntros(copywriter, [{ key: 'a', input }])).toEqual(new Map())
  })

  it('genera una entradilla por elemento con concurrencia limitada', async () => {
    let active = 0
    let peak = 0
    const fake: Copywriter = {
      enabled: true,
      async intro(i) {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5))
        active--
        return { source: 'ia', intro: `Hola ${i.title}` }
      },
    }
    const items = Array.from({ length: 10 }, (_, n) => ({ key: n, input: { ...input, title: `P${n}` } }))
    const results = await generateIntros(fake, items)
    expect(results.size).toBe(10)
    expect(results.get(7)).toEqual({ source: 'ia', intro: 'Hola P7' })
    expect(peak).toBeLessThanOrEqual(4)
  })
})

describe('texto propio con IA', () => {
  it('sin ANTHROPIC_API_KEY explica qué falta', async () => {
    const { writeDescription } = await import('../../server/services/copywriter')
    expect(await writeDescription({}, { ...input, notes: 'me encanta' })).toEqual({
      ok: false,
      reason: 'Falta configurar ANTHROPIC_API_KEY',
    })
  })
})
