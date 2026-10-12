import { describe, expect, it } from 'vitest'
import { normalizeTeamDomain, parseEmailList } from '../../server/utils/access'

describe('configuración de Cloudflare Access', () => {
  it.each([
    'mi-equipo.cloudflareaccess.com',
    'https://mi-equipo.cloudflareaccess.com',
    ' https://mi-equipo.cloudflareaccess.com/ ',
  ])('normaliza el dominio del equipo: %s', (value) => {
    expect(normalizeTeamDomain(value)).toBe('mi-equipo.cloudflareaccess.com')
  })

  it('lee la lista de emails autorizados', () => {
    expect(parseEmailList(' Yo@Example.com, otra@example.com ,')).toEqual(['yo@example.com', 'otra@example.com'])
    expect(parseEmailList(undefined)).toEqual([])
  })
})
