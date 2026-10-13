<script setup lang="ts">
/**
 * Campo de importe en euros que guarda céntimos. Sin `step-snapping`, el componente
 * redondearía al múltiplo del paso (32,99 → 33).
 */
const cents = defineModel<number | null>({ required: true })
defineProps<{ placeholder?: string }>()

const euros = computed({
  get: () => (cents.value == null ? undefined : cents.value / 100),
  set: (value: number | null | undefined) => {
    cents.value = value == null || Number.isNaN(value) ? null : Math.round(value * 100)
  },
})

// En es-ES el punto es separador de miles (32.99 → 3299): se escribe como coma decimal.
function dotAsComma(event: KeyboardEvent) {
  const input = event.target as HTMLInputElement
  if ((event.key !== '.' && event.key !== 'Decimal') || input.tagName !== 'INPUT') return
  event.preventDefault()
  input.setRangeText(',', input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, 'end')
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
</script>

<template>
  <UInputNumber
    v-model="euros"
    :min="0"
    :step="0.5"
    :step-snapping="false"
    locale="es-ES"
    :format-options="{ style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }"
    :placeholder="placeholder"
    class="w-full"
    @keydown.capture="dotAsComma"
  />
</template>
