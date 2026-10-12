<script setup lang="ts">
/** Campo de importe en euros que guarda céntimos. */
const cents = defineModel<number | null>({ required: true })
defineProps<{ placeholder?: string }>()

const euros = computed({
  get: () => (cents.value == null ? undefined : cents.value / 100),
  set: (value: number | null | undefined) => {
    cents.value = value == null || Number.isNaN(value) ? null : Math.round(value * 100)
  },
})
</script>

<template>
  <UInputNumber
    v-model="euros"
    :min="0"
    :step="0.5"
    :format-options="{ style: 'currency', currency: 'EUR' }"
    :placeholder="placeholder"
    class="w-full"
  />
</template>
