<script setup lang="ts">
const { data: channels, status } = await useFetch('/api/channels')
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Canales</h1>
      <UButton to="/canales/nuevo" icon="i-lucide-plus" label="Nuevo" />
    </div>

    <div v-if="status === 'pending'" class="space-y-2">
      <USkeleton v-for="i in 2" :key="i" class="h-20 w-full" />
    </div>

    <UEmpty
      v-else-if="!channels?.length"
      icon="i-lucide-send"
      title="Aún no hay canales"
      description="Añade un canal de Telegram (publicación automática) o de WhatsApp (asistida)."
    />

    <div v-else class="space-y-2">
      <NuxtLink v-for="channel in channels" :key="channel.id" :to="`/canales/${channel.id}`" class="block">
        <UCard :ui="{ body: 'p-3 sm:p-4' }">
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-start gap-3">
              <UIcon
                :name="channel.type === 'telegram' ? 'i-lucide-send' : 'i-lucide-message-circle'"
                class="mt-0.5 size-5 shrink-0 text-muted"
              />
              <div class="min-w-0">
                <p class="font-medium">{{ channel.name }}</p>
                <p class="truncate text-sm text-muted">
                  {{ channel.type === 'telegram' ? 'Telegram · automático' : 'WhatsApp · asistido' }} ·
                  tag {{ channel.trackingId }}
                </p>
              </div>
            </div>
            <UBadge
              :label="channel.active ? 'Activo' : 'Inactivo'"
              :color="channel.active ? 'success' : 'neutral'"
              variant="subtle"
            />
          </div>
        </UCard>
      </NuxtLink>
    </div>
  </div>
</template>
