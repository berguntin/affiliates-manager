import type { FetchError } from 'ofetch'

interface ApiErrorData {
  statusMessage?: string
  message?: string
  data?: { issues?: { path: string; message: string }[] }
}

/** Mensaje legible a partir de un error de la API. */
export function apiErrorMessage(error: unknown): string {
  const data = (error as FetchError<ApiErrorData>)?.data
  const issues = data?.data?.issues
  if (issues?.length) return issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join(' · ')
  return data?.message || data?.statusMessage || (error as Error)?.message || 'Error desconocido'
}

/** Ejecuta una acción contra la API mostrando un aviso de éxito o error. */
export function useApiAction() {
  const toast = useToast()
  const pending = ref(false)

  async function run<T>(action: () => Promise<T>, success?: string): Promise<T | undefined> {
    pending.value = true
    try {
      const result = await action()
      if (success) toast.add({ title: success, color: 'success', icon: 'i-lucide-check' })
      return result
    } catch (error) {
      toast.add({ title: 'No se pudo completar', description: apiErrorMessage(error), color: 'error' })
      return undefined
    } finally {
      pending.value = false
    }
  }

  return { run, pending }
}

type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * `$fetch` sin inferencia de rutas: la inferencia tipada de Nitro desborda el
 * compilador con rutas dinámicas. Úsalo para mutaciones; para lecturas, `useFetch`.
 */
export function apiFetch<T = unknown>(
  url: string,
  options: { method?: ApiMethod; body?: unknown; query?: Record<string, unknown> } = {},
): Promise<T> {
  return ($fetch as (url: string, options?: object) => Promise<T>)(url, options)
}
