export interface ApiProblem {
  title: string
  description: string
}

export interface ErrorBody {
  message?: string
  data?: { code?: string; missing?: string[] }
}

/** Traduce un fallo de la API a un aviso con la causa y qué hacer. */
export function describeApiProblem(status: number | undefined, data: unknown): ApiProblem | null {
  const body = data as ErrorBody | undefined
  const code = body?.data?.code
  if (status === undefined) {
    return {
      title: 'No se puede contactar con la API',
      description:
        'Puede que tu sesión de Cloudflare Access haya caducado (la API redirige al login). Recarga la página.',
    }
  }
  if (code === 'auth_not_configured') {
    return {
      title: 'Autenticación no configurada en el Worker',
      description: `Faltan los secretos ${(body?.data?.missing ?? []).join(', ')}. Configúralos con «wrangler secret put» (ver README).`,
    }
  }
  if (code === 'auth_missing_token') {
    return {
      title: 'La petición no llega a través de Cloudflare Access',
      description:
        'Comprueba que Access está activado en este dominio (Settings → Domains & Routes → Enable Cloudflare Access) y recarga.',
    }
  }
  if (code === 'auth_invalid') {
    return {
      title: 'Cloudflare Access no ha validado tu sesión',
      description:
        'Revisa que AUTH_AUDIENCE sea el AUD de la aplicación de Access, AUTH_TEAM_DOMAIN su dominio de equipo y que tu email esté en AUTH_ALLOWED_EMAILS. El motivo exacto aparece en los logs del Worker.',
    }
  }
  return { title: `Error de la API (${status})`, description: body?.message ?? 'Error desconocido' }
}
