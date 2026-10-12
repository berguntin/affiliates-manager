<script setup lang="ts">
const { data: summary, refresh } = await useFetch('/api/summary')
const { data: themes } = await useFetch('/api/themes')
const { run, pending } = useApiAction()
const scanning = ref<string | null>(null)

const cards = computed(() => [
  { label: 'Candidatas', value: summary.value?.candidatas ?? 0, to: '/cola?tab=candidatas', icon: 'i-lucide-inbox' },
  { label: 'Aprobadas', value: summary.value?.aprobadas ?? 0, to: '/cola?tab=aprobadas', icon: 'i-lucide-check' },
  { label: 'Programadas', value: summary.value?.programadas ?? 0, to: '/cola?tab=programadas', icon: 'i-lucide-clock' },
  { label: 'Publicadas hoy', value: summary.value?.publicadasHoy ?? 0, to: '/historico', icon: 'i-lucide-send' },
])

async function scan(themeId: string) {
  scanning.value = themeId
  const result = await run(() =>
    apiFetch<{ created: number; errors: string[] }>(`/api/themes/${themeId}/scan`, { method: 'POST' }),
  )
  scanning.value = null
  if (result) {
    useToast().add({
      title: `${result.created} candidata${result.created === 1 ? '' : 's'} nueva${result.created === 1 ? '' : 's'}`,
      description: result.errors.join(' · ') || undefined,
      color: result.errors.length ? 'warning' : 'success',
    })
    await refresh()
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-xl font-semibold">Resumen del día</h1>
      <p class="text-sm text-muted">{{ summary?.date }}</p>
    </div>

    <UAlert
      v-if="summary?.pendientesRevision"
      color="warning"
      variant="subtle"
      icon="i-lucide-badge-alert"
      :title="`${summary.pendientesRevision} publicación(es) requieren revisión por cambio de precio`"
      :actions="[{ label: 'Ver cola', to: '/cola', color: 'warning', variant: 'solid' }]"
    />

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <NuxtLink v-for="card in cards" :key="card.label" :to="card.to">
        <UCard :ui="{ body: 'p-3 sm:p-4' }">
          <div class="flex items-center gap-2 text-sm text-muted">
            <UIcon :name="card.icon" class="size-4" />
            {{ card.label }}
          </div>
          <p class="mt-1 text-2xl font-semibold">{{ card.value }}</p>
        </UCard>
      </NuxtLink>
    </div>

    <section class="space-y-2">
      <h2 class="font-medium">Escanear ahora</h2>
      <UEmpty v-if="!themes?.length" icon="i-lucide-tags" title="Crea una temática para empezar" />
      <div v-else class="grid gap-2 sm:grid-cols-2">
        <UButton
          v-for="theme in themes"
          :key="theme.id"
          :label="theme.name"
          icon="i-lucide-scan-search"
          color="neutral"
          variant="outline"
          block
          class="justify-start"
          :loading="pending && scanning === theme.id"
          :disabled="pending"
          @click="scan(theme.id)"
        />
      </div>
    </section>

    <section class="space-y-2">
      <div class="flex items-center justify-between">
        <h2 class="font-medium">Últimas ejecuciones</h2>
        <UButton to="/ejecuciones" label="Ver todas" variant="link" size="sm" />
      </div>
      <RunList :runs="summary?.lastRuns ?? []" />
    </section>
  </div>
</template>
