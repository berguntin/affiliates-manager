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

// «Redactar con IA»: la IA amplía las notas; el original se guarda para poder deshacer.
const { run: runDescribe, pending: describing } = useApiAction()
const notesBeforeAi = ref<string | null>(null)
const canDescribe = computed(() => manual.title.trim().length >= 3 && manual.note.trim().length >= 3)

async function describeWithAi() {
  const result = await runDescribe(() =>
    apiFetch<{ text: string }>(`/api/themes/${props.themeId}/describe`, {
      method: 'POST',
      body: { title: manual.title, brand: manual.brand.trim() || null, notes: manual.note },
    }),
  )
  if (!result) return
  notesBeforeAi.value = manual.note
  manual.note = result.text
}

function undoAi() {
  if (notesBeforeAi.value === null) return
  manual.note = notesBeforeAi.value
  notesBeforeAi.value = null
}

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
  notesBeforeAi.value = null
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
        <UFormField label="Enlace de Amazon o ASIN" required help="URL de amazon.es, enlace compartido desde la app (link.amazon, amzn.eu) o ASIN.">
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
        <UFormField
          label="Texto propio"
          help="Por qué lo recomiendas. Aparece en el mensaje. Escribe unas notas rápidas y la IA las convierte en un texto con el tono de la temática; revísalo antes de crear la candidata."
        >
          <UTextarea v-model="manual.note" :rows="4" :maxlength="500" autoresize class="w-full" />
        </UFormField>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            label="Redactar con IA"
            icon="i-lucide-sparkles"
            color="neutral"
            variant="soft"
            size="sm"
            :disabled="!canDescribe"
            :loading="describing"
            @click="describeWithAi"
          />
          <UButton
            v-if="notesBeforeAi !== null"
            label="Deshacer"
            icon="i-lucide-undo-2"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="undoAi"
          />
          <span v-if="!canDescribe" class="text-xs text-muted">Necesita título y notas.</span>
        </div>
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
