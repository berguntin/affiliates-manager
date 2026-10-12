import { describe, expect, it, vi } from 'vitest'
import { INTAKE_USER_AGENT, resolveShortLink, safeEqual } from '../../server/services/intake'

const redirect = (location: string) => new Response(null, { status: 301, headers: { location } })

describe('resolveShortLink', () => {
  it('obtiene el ASIN de la redirección sin pedir la página de amazon.es', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(redirect('https://www.amazon.es/dp/B08N5WRWNW?ref=cm_sw'))
    expect(await resolveShortLink('https://amzn.eu/d/abc', fetchFn)).toBe('B08N5WRWNW')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]!
    expect(url).toBe('https://amzn.eu/d/abc')
    expect(init).toMatchObject({ redirect: 'manual', headers: { 'user-agent': INTAKE_USER_AGENT } })
    expect(INTAKE_USER_AGENT.startsWith('Agent/')).toBe(true)
  })

  it('sigue redirecciones intermedias de enlaces cortos', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(redirect('https://amzn.eu/d/otro'))
      .mockResolvedValueOnce(redirect('https://www.amazon.es/gp/product/B08N5WRWNW'))
    expect(await resolveShortLink('https://amzn.eu/d/abc', fetchFn)).toBe('B08N5WRWNW')
  })

  it('se detiene si la redirección lleva a amazon.es sin ASIN (no abre la página)', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(redirect('https://www.amazon.es/s?k=pañales'))
    expect(await resolveShortLink('https://amzn.eu/d/abc', fetchFn)).toBeNull()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('devuelve null si no hay redirección', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('ok', { status: 200 }))
    expect(await resolveShortLink('https://amzn.eu/d/abc', fetchFn)).toBeNull()
  })
})

describe('safeEqual', () => {
  it('compara el secreto del webhook', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abd', 'abc')).toBe(false)
    expect(safeEqual(undefined, 'abc')).toBe(false)
  })
})
