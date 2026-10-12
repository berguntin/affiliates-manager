<script setup lang="ts">
const { data: themes, status } = await useFetch('/api/themes')
const { data: channels } = await useFetch('/api/channels')

const providerLabel: Record<string, string> = {
  manual: 'Alta manual',
  mock: 'Simulado',
  creators_api: 'Creators API',
}

function channelNames(ids: string[]) {
  return (channels.value ?? []).filter((c) => ids.includes(c.id)).map((c) => c.name)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Temáticas</h1>
      <UButton to="/tematicas/nueva" icon="i-lucide-plus" label="Nueva" />
    </div>

    <div v-if="status === 'pending'" class="space-y-2">
      <USkeleton v-for="i in 3" :key="i" class="h-20 w-full" />
    </div>

    <UEmpty
      v-else-if="!themes?.length"
      icon="i-lucide-tags"
      title="Aún no hay temáticas"
      description="Crea la primera, por ejemplo «Bebé»."
    />

    <div v-else class="space-y-2">
      <NuxtLink v-for="theme in themes" :key="theme.id" :to="`/tematicas/${theme.id}`" class="block">
        <UCard :ui="{ body: 'p-3 sm:p-4' }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="font-medium">{{ theme.name }}</p>
              <p class="truncate text-sm text-muted">
                {{ providerLabel[theme.provider] }} · máx. {{ theme.dailyLimit }}/día ·
                {{ channelNames(theme.channelIds).join(', ') || 'sin canales' }}
              </p>
            </div>
            <UBadge
              :label="theme.active ? 'Activa' : 'Inactiva'"
              :color="theme.active ? 'success' : 'neutral'"
              variant="subtle"
            />
          </div>
        </UCard>
      </NuxtLink>
    </div>
  </div>
</template>
