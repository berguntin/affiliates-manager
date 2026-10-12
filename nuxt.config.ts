// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  // Panel privado: SPA. Toda la lógica y la autenticación viven en la API.
  ssr: false,
  devtools: { enabled: false },
  // Iconos empaquetados: sin llamadas a la API de Iconify en tiempo de ejecución.
  icon: { serverBundle: false, clientBundle: { scan: true } },
  app: {
    head: {
      htmlAttrs: { lang: 'es' },
      title: 'Ofertas · Panel',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }],
    },
  },
  typescript: {
    strict: true,
    tsConfig: { compilerOptions: { noUncheckedIndexedAccess: true } },
  },
  nitro: {
    preset: 'cloudflare_module',
    experimental: { tasks: true },
    // Deben coincidir con `triggers.crons` en wrangler.jsonc (UTC)
    scheduledTasks: {
      '0 5 * * *': ['scan:daily'],
      '*/10 * * * *': ['queue:tick'],
    },
    typescript: {
      tsConfig: {
        compilerOptions: {
          noUncheckedIndexedAccess: true,
          types: ['@cloudflare/workers-types'],
        },
      },
    },
  },
})
