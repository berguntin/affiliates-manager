import { describe, expect, it, vi } from 'vitest'
import { INTAKE_USER_AGENT, resolveAsinInput, resolveShortLink, safeEqual } from '../../server/services/intake'

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

  it('resuelve link.amazon → amzlinks.in → amazon.es (enlace compartido por la app)', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(redirect('https://amzlinks.in/B067ikL8E'))
      .mockResolvedValueOnce(
        redirect('https://www.amazon.es/dp/B0GTLLDXNX/ref=cm_sw_r_as_gl_api?linkCode=ml1&tag=otro-21'),
      )
    expect(await resolveShortLink('https://link.amazon/B067ikL8E', fetchFn)).toBe('B0GTLLDXNX')
    expect(fetchFn).toHaveBeenCalledTimes(2)
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

describe('resolveAsinInput (alta manual del panel y bot)', () => {
  it('acepta ASIN y URLs de amazon.es sin ninguna petición', async () => {
    const fetchFn = vi.fn()
    expect(await resolveAsinInput('B08N5WRWNW', fetchFn)).toBe('B08N5WRWNW')
    expect(await resolveAsinInput(' https://www.amazon.es/dp/B08N5WRWNW?th=1 ', fetchFn)).toBe('B08N5WRWNW')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('resuelve enlaces cortos de la app', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(redirect('https://amzlinks.in/B0f5YONr0'))
      .mockResolvedValueOnce(redirect('https://www.amazon.es/dp/B0GTLLDXNX?tag=x-21'))
    expect(await resolveAsinInput('https://link.amazon/B0f5YONr0', fetchFn)).toBe('B0GTLLDXNX')
  })

  it('devuelve null con enlaces que no son de Amazon o si falla la red', async () => {
    expect(await resolveAsinInput('https://example.com/x', vi.fn())).toBeNull()
    expect(await resolveAsinInput('https://link.amazon/x', vi.fn().mockRejectedValue(new Error('red')))).toBeNull()
  })
})

describe('safeEqual', () => {
  it('compara el secreto del webhook', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abd', 'abc')).toBe(false)
    expect(safeEqual(undefined, 'abc')).toBe(false)
  })
})
