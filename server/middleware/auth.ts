/**
 * Protege la API del panel. Cloudflare Access ya filtra en el borde; aquí se valida
 * además el JWT para no depender solo de la configuración del dominio.
 */
export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return

  const env = useEnv()
  if (import.meta.dev && env.AUTH_DISABLED === 'true') {
    event.context.userEmail = 'dev@localhost'
    return
  }

  const teamDomain = env.AUTH_TEAM_DOMAIN
  const audience = env.AUTH_AUDIENCE
  const allowedEmails = parseEmailList(env.AUTH_ALLOWED_EMAILS)
  if (!teamDomain || !audience || allowedEmails.length === 0) {
    // Solo nombres de variables, nunca valores.
    const missing = [
      !teamDomain && 'AUTH_TEAM_DOMAIN',
      !audience && 'AUTH_AUDIENCE',
      allowedEmails.length === 0 && 'AUTH_ALLOWED_EMAILS',
    ].filter(Boolean)
    throw createError({
      statusCode: 500,
      message: `Autenticación no configurada: faltan ${missing.join(', ')}`,
      data: { code: 'auth_not_configured', missing },
    })
  }

  const token =
    getRequestHeader(event, 'cf-access-jwt-assertion') ?? getCookie(event, 'CF_Authorization')
  if (!token) {
    throw createError({ statusCode: 401, message: 'No autenticado', data: { code: 'auth_missing_token' } })
  }

  try {
    event.context.userEmail = await verifyAccessToken(token, { teamDomain, audience, allowedEmails })
  } catch (error) {
    // El motivo exacto (AUD, emisor, email…) va al log del Worker, no a la respuesta.
    // El dominio del equipo no es secreto y permite detectar un AUTH_TEAM_DOMAIN erróneo.
    console.warn(
      `[auth] JWT de Access rechazado (equipo ${normalizeTeamDomain(teamDomain)}): ${(error as Error).message}`,
    )
    throw createError({ statusCode: 401, message: 'No autorizado', data: { code: 'auth_invalid' } })
  }
})

declare module 'h3' {
  interface H3EventContext {
    userEmail?: string
  }
}
