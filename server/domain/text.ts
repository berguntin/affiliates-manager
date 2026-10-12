/** Utilidades de texto puras. */

/** Minúsculas y sin acentos, para comparar palabras de forma tolerante. */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

export function slugify(value: string): string {
  return (
    normalize(value)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'tematica'
  )
}

/** Recorta sin partir palabras y añade "…". Truncar está permitido; reescribir, no. */
export function truncate(value: string, max: number): string {
  const text = value.trim()
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
