<script setup lang="ts">
import type { PublishWindow } from '#shared/types'

const windows = defineModel<PublishWindow[]>({ required: true })

function add() {
  windows.value = [...windows.value, { days: [1, 2, 3, 4, 5, 6, 7], start: '09:00', end: '11:00' }]
}

function remove(index: number) {
  windows.value = windows.value.filter((_, i) => i !== index)
}

function toggleDay(window: PublishWindow, day: number) {
  window.days = window.days.includes(day)
    ? window.days.filter((d) => d !== day)
    : [...window.days, day].sort()
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-for="(window, index) in windows"
      :key="index"
      class="space-y-2 rounded-lg border border-default p-3"
    >
      <div class="flex flex-wrap gap-1">
        <UButton
          v-for="day in WEEKDAYS"
          :key="day.value"
          :label="day.short"
          :aria-label="day.label"
          size="sm"
          class="w-9 justify-center"
          :variant="window.days.includes(day.value) ? 'solid' : 'outline'"
          :color="window.days.includes(day.value) ? 'primary' : 'neutral'"
          @click="toggleDay(window, day.value)"
        />
      </div>
      <div class="flex items-center gap-2">
        <UInput v-model="window.start" type="time" aria-label="Desde" class="flex-1" />
        <span class="text-muted">–</span>
        <UInput v-model="window.end" type="time" aria-label="Hasta" class="flex-1" />
        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          aria-label="Eliminar franja"
          @click="remove(index)"
        />
      </div>
    </div>
    <UButton icon="i-lucide-plus" label="Añadir franja" variant="soft" size="sm" @click="add" />
    <p v-if="windows.length === 0" class="text-sm text-muted">
      Sin franjas: las publicaciones programadas se colocan en cualquier hora del día.
    </p>
  </div>
</template>
