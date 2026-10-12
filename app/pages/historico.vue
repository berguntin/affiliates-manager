<script setup lang="ts">
import type { QueueItem } from '#shared/api'

const filter = ref<'publicada' | 'descartada,caducada'>('publicada')
const channel = ref('all')
const channelId = computed(() => (channel.value === 'all' ? undefined : channel.value))
const { data: channels } = await useFetch('/api/channels')
const channelItems = computed(() => [
  { label: 'Todos los canales', value: 'all' },
  ...(channels.value ?? []).map((c) => ({ label: c.name, value: c.id })),
])

const { data, status } = await useFetch<QueueItem[]>('/api/publications', {
  query: { status: filter, channelId, limit: 200 },
  default: () => [],
})
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-xl font-semibold">Histórico</h1>
    <div class="flex flex-col gap-2 sm:flex-row">
      <UTabs
        v-model="filter"
        :items="[
          { label: 'Publicadas', value: 'publicada' },
          { label: 'No publicadas', value: 'descartada,caducada' },
        ]"
        :content="false"
        class="flex-1"
      />
      <USelect v-model="channel" :items="channelItems" class="w-full sm:w-56" />
    </div>
    <div v-if="status === 'pending' && !data.length" class="space-y-2">
      <USkeleton v-for="i in 3" :key="i" class="h-24 w-full" />
    </div>
    <UEmpty v-else-if="!data.length" icon="i-lucide-history" title="Sin publicaciones" />
    <div v-else class="space-y-3">
      <PublicationCard v-for="item in data" :key="item.id" :item="item" readonly />
    </div>
  </div>
</template>
