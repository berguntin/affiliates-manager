<script setup lang="ts">
import type { QueueItem } from '#shared/api'
import type { PublicationStatus } from '#shared/types'

const route = useRoute()
const router = useRouter()

const tabs: { label: string; value: string; statuses: PublicationStatus[] }[] = [
  { label: 'Candidatas', value: 'candidatas', statuses: ['candidata'] },
  { label: 'Aprobadas', value: 'aprobadas', statuses: ['aprobada'] },
  { label: 'Programadas', value: 'programadas', statuses: ['programada'] },
]

const tab = computed({
  get: () => (tabs.some((t) => t.value === route.query.tab) ? String(route.query.tab) : 'candidatas'),
  set: (value: string) => router.replace({ query: { ...route.query, tab: value } }),
})
const channel = ref('all')
const channelId = computed(() => (channel.value === 'all' ? undefined : channel.value))

const { data: channels } = await useFetch('/api/channels')
const channelItems = computed(() => [
  { label: 'Todos los canales', value: 'all' },
  ...(channels.value ?? []).map((c) => ({ label: c.name, value: c.id })),
])

const { data, status, refresh } = await useFetch<QueueItem[]>('/api/publications', {
  query: { status: 'candidata,aprobada,programada', channelId },
  default: () => [],
})

const items = computed(() => {
  const statuses = tabs.find((t) => t.value === tab.value)!.statuses
  return data.value.filter((i) => statuses.includes(i.status))
})

const counts = computed(() =>
  Object.fromEntries(tabs.map((t) => [t.value, data.value.filter((i) => t.statuses.includes(i.status)).length])),
)

const tabItems = computed(() =>
  tabs.map((t) => ({ label: t.label, value: t.value, badge: { label: String(counts.value[t.value] ?? 0), size: 'sm' as const } })),
)

function onChanged(updated: QueueItem) {
  data.value = data.value.map((i) => (i.id === updated.id ? updated : i))
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-semibold">Cola</h1>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="ghost"
        color="neutral"
        aria-label="Actualizar"
        :loading="status === 'pending'"
        @click="refresh()"
      />
    </div>

    <UTabs v-model="tab" :items="tabItems" :content="false" size="sm" class="w-full" />
    <USelect v-model="channel" :items="channelItems" class="w-full sm:w-64" />

    <div v-if="status === 'pending' && !data.length" class="space-y-2">
      <USkeleton v-for="i in 3" :key="i" class="h-32 w-full" />
    </div>
    <UEmpty
      v-else-if="!items.length"
      icon="i-lucide-inbox"
      title="Nada por aquí"
      description="Las candidatas aparecen tras el escaneo diario o al lanzar uno manual desde la temática."
    />
    <div v-else class="space-y-3">
      <PublicationCard v-for="item in items" :key="item.id" :item="item" @changed="onChanged" />
    </div>
  </div>
</template>
