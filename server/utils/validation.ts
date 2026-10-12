import type { H3Event } from 'h3'
import type { z } from 'zod'

/** Lee y valida el cuerpo JSON. Responde 400 con los errores por campo. */
export async function readValidated<S extends z.ZodType>(
  event: H3Event,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown
  try {
    const body = await readRawBody(event)
    raw = body ? JSON.parse(body) : {}
  } catch {
    throw createError({ statusCode: 400, message: 'JSON no válido' })
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw createError({
      statusCode: 400,
      message: 'Datos no válidos',
      data: {
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    })
  }
  return result.data
}

export function requireParam(event: H3Event, name: string): string {
  const value = getRouterParam(event, name)
  if (!value) throw createError({ statusCode: 400, message: `Falta el parámetro ${name}` })
  return value
}

export function notFound(what: string): never {
  throw createError({ statusCode: 404, message: `${what} no encontrado` })
}
