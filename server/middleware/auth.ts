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
    throw createError({ statusCode: 500, message: 'Autenticación no configurada' })
  }

  const token =
    getRequestHeader(event, 'cf-access-jwt-assertion') ?? getCookie(event, 'CF_Authorization')
  if (!token) {
    throw createError({ statusCode: 401, message: 'No autenticado' })
  }

  try {
    event.context.userEmail = await verifyAccessToken(token, { teamDomain, audience, allowedEmails })
  } catch {
    throw createError({ statusCode: 401, message: 'No autorizado' })
  }
})

declare module 'h3' {
  interface H3EventContext {
    userEmail?: string
  }
}
