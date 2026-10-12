<script setup lang="ts">
const { data: runs, refresh, status } = await useFetch('/api/runs', { default: () => [] })
const { run, pending } = useApiAction()

const toast = useToast()

async function trigger(kind: 'scan' | 'tick') {
  const result = await run(() =>
    apiFetch<{ status: string; stats: Record<string, number>; errors: string[] }>(`/api/runs/${kind}`, {
      method: 'POST',
    }),
  )
  if (!result) return
  const created = result.stats.candidatas ?? 0
  toast.add({
    title:
      kind === 'scan'
        ? `Escaneo terminado: ${created} candidata${created === 1 ? '' : 's'} nueva${created === 1 ? '' : 's'}`
        : 'Cola procesada',
    description: result.errors.join(' · ') || undefined,
    color: result.status === 'ok' ? 'success' : 'warning',
    actions: kind === 'scan' && created ? [{ label: 'Ver cola', to: '/cola' }] : undefined,
  })
  await refresh()
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-semibold">Ejecuciones</h1>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="ghost"
        color="neutral"
        aria-label="Actualizar"
        :loading="status === 'pending'"
        @click="refresh()"
      />
    </div>
    <p class="text-sm text-muted">
      El cron escanea todas las temáticas activas cada día a las 05:00 UTC y procesa la cola cada 10 minutos
      (publica lo programado, caduca y purga). Puedes lanzarlo a mano:
    </p>
    <div class="flex flex-wrap gap-2">
      <UButton label="Escanear todas" icon="i-lucide-scan-search" :loading="pending" @click="trigger('scan')" />
      <UButton label="Procesar cola" icon="i-lucide-play" variant="soft" :loading="pending" @click="trigger('tick')" />
    </div>
    <UEmpty v-if="!runs.length" icon="i-lucide-activity" title="Aún no hay ejecuciones" />
    <RunList v-else :runs="runs" />
  </div>
</template>
