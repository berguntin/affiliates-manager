import { createRemoteJWKSet, jwtVerify } from 'jose'

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

export interface AccessConfig {
  teamDomain: string
  audience: string
  allowedEmails: string[]
}

/** Valida el JWT que Cloudflare Access añade a cada petición y devuelve el email. */
export async function verifyAccessToken(token: string, config: AccessConfig): Promise<string> {
  const issuer = `https://${config.teamDomain}`
  let jwks = jwksByTeam.get(issuer)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
    jwksByTeam.set(issuer, jwks)
  }
  const { payload } = await jwtVerify(token, jwks, { issuer, audience: config.audience })
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : ''
  if (!email || !config.allowedEmails.includes(email)) {
    throw new Error('Email no autorizado')
  }
  return email
}

export function parseEmailList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}
