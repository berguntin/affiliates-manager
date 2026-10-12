<script setup lang="ts">
const route = useRoute()

// Comprobación de salud de la API (Access, secretos, red) en cada navegación.
const { error: healthError, refresh: checkHealth } = await useFetch('/api/me', { server: false })
watch(() => route.path, () => checkHealth())
const apiProblem = computed(() =>
  healthError.value ? describeApiProblem(healthError.value.statusCode, healthError.value.data) : null,
)

const items = [
  { label: 'Resumen', icon: 'i-lucide-layout-dashboard', to: '/' },
  { label: 'Cola', icon: 'i-lucide-list-checks', to: '/cola' },
  { label: 'Temáticas', icon: 'i-lucide-tags', to: '/tematicas' },
  { label: 'Canales', icon: 'i-lucide-send', to: '/canales' },
  { label: 'Más', icon: 'i-lucide-menu', to: '/mas' },
]

const secondary = [
  { label: 'Histórico', icon: 'i-lucide-history', to: '/historico' },
  { label: 'Ejecuciones', icon: 'i-lucide-activity', to: '/ejecuciones' },
  { label: 'Ajustes', icon: 'i-lucide-settings', to: '/ajustes' },
]

function isActive(to: string) {
  if (to === '/') return route.path === '/'
  if (to === '/mas') return secondary.some((s) => route.path.startsWith(s.to))
  return route.path.startsWith(to)
}
</script>

<template>
  <div class="min-h-dvh bg-default pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
    <header
      class="sticky top-0 z-20 border-b border-default bg-default/90 backdrop-blur pt-[env(safe-area-inset-top)]"
    >
      <div class="mx-auto flex h-12 max-w-4xl items-center gap-4 px-4">
        <NuxtLink to="/" class="font-semibold">Ofertas</NuxtLink>
        <nav class="hidden flex-1 items-center gap-1 md:flex">
          <UButton
            v-for="item in [...items.slice(0, 4), ...secondary]"
            :key="item.to"
            :to="item.to"
            :icon="item.icon"
            :label="item.label"
            size="sm"
            :variant="isActive(item.to) ? 'soft' : 'ghost'"
            :color="isActive(item.to) ? 'primary' : 'neutral'"
          />
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-4xl space-y-4 px-4 py-4">
      <UAlert
        v-if="apiProblem"
        color="error"
        variant="subtle"
        icon="i-lucide-shield-alert"
        :title="apiProblem.title"
        :description="apiProblem.description"
        :actions="[{ label: 'Recargar', color: 'error', variant: 'solid', onClick: () => reloadNuxtApp() }]"
      />
      <slot />
    </main>

    <nav
      class="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-default bg-default pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Navegación principal"
    >
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex h-16 flex-col items-center justify-center gap-1 text-xs"
        :class="isActive(item.to) ? 'text-primary' : 'text-muted'"
      >
        <UIcon :name="item.icon" class="size-5" />
        {{ item.label }}
      </NuxtLink>
    </nav>
  </div>
</template>
