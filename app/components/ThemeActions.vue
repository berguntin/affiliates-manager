<script setup lang="ts">
import { NOTE_MAX } from '#shared/schemas'
import type { ManualBasisType, ProviderId } from '#shared/types'

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
  basisPriceCents: null as number | null,
  basisType: 'WAS_PRICE' as ManualBasisType,
})

const basisOptions = [
  { label: 'Precio anterior (tachado)', value: 'WAS_PRICE' },
  { label: 'PVP recomendado', value: 'LIST_PRICE' },
]

/** Mismo cálculo que el servidor: solo hay descuento si el precio de referencia es mayor. */
const manualDiscount = computed(() => {
  const { priceCents, basisPriceCents } = manual
  if (priceCents == null || basisPriceCents == null || basisPriceCents <= priceCents) return null
  return Math.round(((basisPriceCents - priceCents) / basisPriceCents) * 100)
})
const basisError = computed(() => {
  if (manual.basisPriceCents == null) return undefined
  if (manual.priceCents == null) return 'Indica también el precio actual'
  if (manual.basisPriceCents <= manual.priceCents) return 'Debe ser mayor que el precio actual'
  return undefined
})

// «Rellenar desde Amazon»: precio y características al pegar el enlace.
interface Lookup {
  asin: string
  title: string | null
  brand: string | null
  priceCents: number | null
  basisPriceCents: number | null
  basisType: ManualBasisType | null
  features: string[]
  bullets: string
}
const { run: runLookup, pending: lookingUp } = useApiAction()
/** Viñetas leídas de Amazon: la IA no las reescribe (se apartan al redactar). */
const bullets = ref('')
const notesWithoutBullets = computed(() =>
  bullets.value ? manual.note.replace(bullets.value, '').trim() : manual.note.trim(),
)
const lastLookup = ref<string | null>(null)

/** Mismo criterio que el servidor (ASIN suelto, URL de Amazon o enlace corto). */
const looksLikeProduct = (v: string) =>
  /^[A-Z0-9]{10}$/i.test(v.trim()) || /https?:\/\/\S*(amazon|amzn|a\.co)/i.test(v)

async function lookup() {
  const input = manual.asinOrUrl.trim()
  if (!looksLikeProduct(input)) return
  lastLookup.value = input
  const result = await runLookup(() =>
    apiFetch<Lookup>('/api/products/lookup', { method: 'POST', body: { asinOrUrl: input } }),
  )
  if (!result || manual.asinOrUrl.trim() !== input) return
  if (result.title) manual.title = result.title
  if (result.brand) manual.brand = result.brand
  manual.priceCents = result.priceCents
  manual.basisPriceCents = result.basisPriceCents
  manual.basisType = result.basisType ?? 'WAS_PRICE'
  bullets.value = result.bullets
  if (result.bullets && !manual.note.includes(result.bullets)) {
    manual.note = (manual.note.trim() ? `${manual.note.trim()}\n\n${result.bullets}` : result.bullets).slice(0, NOTE_MAX)
  }
  toast.add({
    title: result.priceCents != null ? 'Datos y precio leídos de Amazon' : 'Datos leídos de Amazon, sin precio',
    description: `${result.features.length} característica(s). Revísalo antes de crear la candidata.`,
    color: result.priceCents != null ? 'success' : 'warning',
  })
}

// Al pegar un enlace se rellena solo (una vez por enlace).
let lookupTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => manual.asinOrUrl,
  (value) => {
    clearTimeout(lookupTimer)
    if (value.trim() && value.trim() !== lastLookup.value) lookupTimer = setTimeout(lookup, 600)
  },
)
onBeforeUnmount(() => clearTimeout(lookupTimer))

const { data: recent, refresh: refreshRecent } = await useFetch<
  { id: string; asin: string; title: string; createdAt: number; consumedAt: number | null }[]
>(`/api/themes/${props.themeId}/manual-products`, { default: () => [] })

// «Redactar con IA»: la IA amplía las notas; el original se guarda para poder deshacer.
const { run: runDescribe, pending: describing } = useApiAction()
const notesBeforeAi = ref<string | null>(null)
const canDescribe = computed(() => manual.title.trim().length >= 3 && notesWithoutBullets.value.length >= 3)

async function describeWithAi() {
  const result = await runDescribe(() =>
    apiFetch<{ text: string }>(`/api/themes/${props.themeId}/describe`, {
      method: 'POST',
      body: { title: manual.title, brand: manual.brand.trim() || null, notes: notesWithoutBullets.value },
    }),
  )
  if (!result) return
  notesBeforeAi.value = manual.note
  manual.note = manual.note.includes(bullets.value) && bullets.value ? `${result.text}\n\n${bullets.value}` : result.text
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
        basisPriceCents: manual.basisPriceCents,
        basisType: manual.basisType,
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
  Object.assign(manual, {
    asinOrUrl: '',
    title: '',
    brand: '',
    note: '',
    priceCents: null,
    basisPriceCents: null,
    basisType: 'WAS_PRICE',
  })
  notesBeforeAi.value = null
  lastLookup.value = ''
  bullets.value = ''
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
        <p class="text-xs text-muted">Se crea la candidata al momento. Si indicas precio, se publica con la fecha y hora del alta; con el precio anterior, también el descuento.</p>
      </template>
      <form class="space-y-3" @submit.prevent="addManual">
        <UFormField
          label="Enlace de Amazon o ASIN"
          required
          help="URL de amazon.es, enlace compartido desde la app (link.amazon, amzn.eu) o ASIN. Al pegarlo se rellenan el título, el precio y las características."
        >
          <div class="flex gap-2">
            <UInput
              v-model="manual.asinOrUrl"
              placeholder="https://www.amazon.es/dp/B0…"
              inputmode="url"
              autocapitalize="off"
              class="w-full"
            />
            <UButton
              icon="i-lucide-download"
              color="neutral"
              variant="soft"
              aria-label="Rellenar desde Amazon"
              :loading="lookingUp"
              :disabled="!looksLikeProduct(manual.asinOrUrl)"
              @click="lookup"
            />
          </div>
        </UFormField>
        <UFormField label="Título" required>
          <UInput v-model="manual.title" class="w-full" />
        </UFormField>
        <UFormField label="Marca">
          <UInput v-model="manual.brand" class="w-full" />
        </UFormField>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Precio actual" help="Opcional. Se publica con la fecha y hora de ahora.">
            <EuroInput v-model="manual.priceCents" placeholder="Opcional" />
          </UFormField>
          <UFormField
            label="Precio antes del descuento"
            :error="basisError"
            :help="manualDiscount != null ? `Se publicará −${manualDiscount}%` : 'Opcional. El precio tachado o el PVP recomendado que muestra Amazon.'"
          >
            <EuroInput v-model="manual.basisPriceCents" placeholder="Opcional" />
          </UFormField>
        </div>
        <UFormField v-if="manual.basisPriceCents != null" label="¿Qué precio es?">
          <URadioGroup v-model="manual.basisType" :items="basisOptions" orientation="horizontal" />
        </UFormField>
        <UFormField
          label="Texto propio"
          help="Por qué lo recomiendas y las características de Amazon en viñetas. Aparece en el mensaje. Escribe unas notas rápidas y la IA las convierte en un texto con el tono de la temática; revísalo antes de crear la candidata."
        >
          <UTextarea v-model="manual.note" :rows="4" :maxlength="NOTE_MAX" autoresize class="w-full" />
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
