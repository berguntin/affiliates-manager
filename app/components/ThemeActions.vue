<script setup lang="ts">
import type { ProviderId } from '#shared/types'

const props = defineProps<{ themeId: string; provider: ProviderId }>()
const toast = useToast()
const { run, pending } = useApiAction()

async function scan() {
  const result = await run(() =>
    apiFetch<{ created: number; errors: string[]; stats: Record<string, number> }>(
      `/api/themes/${props.themeId}/scan`,
      { method: 'POST' },
    ),
  )
  if (!result) return
  toast.add({
    title: `${result.created} candidata(s) nueva(s)`,
    description:
      [
        Object.entries(result.stats)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · '),
        ...result.errors,
      ]
        .filter(Boolean)
        .join(' — ') || undefined,
    color: result.errors.length ? 'warning' : 'success',
    actions: result.created ? [{ label: 'Ver cola', to: '/cola' }] : undefined,
  })
}

// --- Alta manual ---
const manual = reactive({
  asinOrUrl: '',
  title: '',
  brand: '',
  note: '',
  priceCents: null as number | null,
})

const { data: recent, refresh: refreshRecent } = await useFetch<
  { id: string; asin: string; title: string; createdAt: number; consumedAt: number | null }[]
>(`/api/themes/${props.themeId}/manual-products`, { default: () => [] })

async function addManual() {
  const result = await run(() =>
    apiFetch<{ asin: string; created: number; errors: string[] }>(`/api/themes/${props.themeId}/manual-products`, {
      method: 'POST',
      body: {
        asinOrUrl: manual.asinOrUrl,
        title: manual.title,
        brand: manual.brand.trim() || null,
        note: manual.note,
        priceCents: manual.priceCents,
      },
    }),
  )
  if (!result) return
  toast.add({
    title: result.created ? `Candidata creada (${result.asin})` : `Guardado ${result.asin}, sin candidata nueva`,
    description: result.errors.join(' · ') || undefined,
    color: result.created ? 'success' : 'warning',
    actions: result.created ? [{ label: 'Ver cola', to: '/cola' }] : undefined,
  })
  Object.assign(manual, { asinOrUrl: '', title: '', brand: '', note: '', priceCents: null })
  await refreshRecent()
}
</script>

<template>
  <div class="space-y-4">
    <UButton
      v-if="provider !== 'manual'"
      label="Escanear ahora"
      icon="i-lucide-scan-search"
      block
      :loading="pending"
      @click="scan"
    />

    <UCard v-else>
      <template #header>
        <h2 class="font-medium">Alta manual de producto</h2>
        <p class="text-xs text-muted">Se crea la candidata al momento. Si indicas precio, se publica con la fecha y hora del alta.</p>
      </template>
      <form class="space-y-3" @submit.prevent="addManual">
        <UFormField label="URL de amazon.es o ASIN" required>
          <UInput
            v-model="manual.asinOrUrl"
            placeholder="https://www.amazon.es/dp/B0…"
            inputmode="url"
            autocapitalize="off"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Título" required>
          <UInput v-model="manual.title" class="w-full" />
        </UFormField>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Marca">
            <UInput v-model="manual.brand" class="w-full" />
          </UFormField>
          <UFormField label="Precio actual" help="Opcional. Se publica con la fecha y hora de ahora.">
            <EuroInput v-model="manual.priceCents" placeholder="Opcional" />
          </UFormField>
        </div>
        <UFormField label="Texto propio" help="Por qué lo recomiendas. Aparece en el mensaje.">
          <UTextarea v-model="manual.note" :rows="2" class="w-full" />
        </UFormField>
        <UButton type="submit" label="Añadir y crear candidata" icon="i-lucide-plus" block :loading="pending" />
      </form>
      <div v-if="recent.length" class="mt-4 space-y-1">
        <p class="text-xs font-medium text-muted">Últimas altas</p>
        <p v-for="p in recent.slice(0, 5)" :key="p.id" class="truncate text-xs text-muted">
          {{ formatDateTime(p.createdAt) }} · {{ p.asin }} · {{ p.title }}
        </p>
      </div>
    </UCard>
  </div>
</template>
