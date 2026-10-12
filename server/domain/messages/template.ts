/**
 * Motor mínimo de plantillas (subconjunto de Mustache):
 *   {{variable}}                valor escapado según el formato
 *   {{#variable}}…{{/variable}} solo si tiene valor
 *   {{^variable}}…{{/variable}} solo si no tiene valor
 */

export type TemplateValues = Record<string, string | number | null | undefined>

const SECTION = /\{\{([#^])([a-z_]+)\}\}([\s\S]*?)\{\{\/\2\}\}/
const VARIABLE = /\{\{([a-z_]+)\}\}/g
const TAG = /\{\{([#^/]?)([a-z_]+)\}\}/g

const present = (v: TemplateValues[string]) => v !== null && v !== undefined && v !== ''

export function renderTemplate(
  body: string,
  values: TemplateValues,
  escape: (value: string) => string,
): string {
  let out = body
  let match: RegExpExecArray | null
  while ((match = SECTION.exec(out))) {
    const [whole, kind, name, inner] = match
    const show = kind === '#' ? present(values[name!]) : !present(values[name!])
    out = out.slice(0, match.index) + (show ? inner : '') + out.slice(match.index + whole.length)
  }
  return out.replace(VARIABLE, (_, name: string) => {
    const value = values[name]
    return present(value) ? escape(String(value)) : ''
  })
}

/** Errores de sintaxis o variables desconocidas. */
export function validateTemplate(body: string, allowed: readonly string[]): string[] {
  const errors: string[] = []
  const stack: string[] = []
  for (const [, kind, name] of body.matchAll(TAG)) {
    if (!allowed.includes(name!)) errors.push(`Variable desconocida: {{${kind}${name}}}`)
    if (kind === '#' || kind === '^') stack.push(name!)
    else if (kind === '/') {
      const open = stack.pop()
      if (open !== name) errors.push(`Cierre {{/${name}}} sin apertura correspondiente`)
    }
  }
  for (const open of stack) errors.push(`Falta cerrar {{/${open}}}`)
  return [...new Set(errors)]
}
