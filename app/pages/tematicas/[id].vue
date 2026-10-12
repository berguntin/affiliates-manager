<script setup lang="ts">
import { themeInputSchema, type ThemeData } from '#shared/schemas'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const isNew = computed(() => id.value === 'nueva')

const { data: channels } = await useFetch('/api/channels')

function defaults(): ThemeData {
  return {
    name: '',
    description: '',
    active: true,
    provider: 'mock',
    searchIndex: 'All',
    keywords: [],
    browseNodes: [],
    excludeKeywords: [],
    excludeBrands: [],
    minDiscountPct: 20,
    minPriceCents: null,
    maxPriceCents: null,
    minRating: null,
    minReviews: null,
    dailyLimit: 5,
    publishWindows: [],
    dedupeDays: 14,
    tone: '',
    channelIds: [],
  }
}

const state = reactive<ThemeData>(defaults())

if (!isNew.value) {
  const theme = await $fetch(`/api/themes/${id.value}`).catch(() => null)
  if (!theme) throw createError({ statusCode: 404, statusMessage: 'Temática no encontrada' })
  Object.assign(state, {
    ...Object.fromEntries(Object.keys(defaults()).map((k) => [k, theme[k as keyof typeof theme]])),
  })
}

const providerItems = [
  { label: 'Simulado (desarrollo)', value: 'mock' },
  { label: 'Alta manual', value: 'manual' },
  { label: 'Creators API (fase 2)', value: 'creators_api', disabled: true },
]

// Índices de búsqueda de amazon.es más habituales (lista completa en docs/creators-api.md)
const searchIndexItems = [
  'All',
  'Baby',
  'Beauty',
  'Electronics',
  'HealthPersonalCare',
  'HomeAndKitchen',
  'ToysAndGames',
  'VideoGames',
  'SportsAndOutdoors',
  'PetSupplies',
  'Computers',
  'Fashion',
]

const ratingItems = [
  { label: 'Sin filtro', value: null },
  ...[1, 2, 3, 4].map((v) => ({ label: `${v}+ estrellas`, value: v })),
]

const channelItems = computed(() =>
  (channels.value ?? []).map((c) => ({
    label: `${c.name} (${c.type === 'telegram' ? 'Telegram' : 'WhatsApp'})`,
    value: c.id,
  })),
)

const { run, pending } = useApiAction()

async function save() {
  const body = themeInputSchema.parse(state)
  const saved = await run(
    () =>
      isNew.value
        ? apiFetch<{ id: string }>('/api/themes', { method: 'POST', body })
        : apiFetch<{ id: string }>(`/api/themes/${id.value}`, { method: 'PUT', body }),
    'Temática guardada',
  )
  if (saved && isNew.value) await router.replace(`/tematicas/${saved.id}`)
}

async function remove() {
  if (!confirm('¿Eliminar la temática y todas sus ofertas y publicaciones?')) return
  const ok = await run(() => apiFetch(`/api/themes/${id.value}`, { method: 'DELETE' }), 'Temática eliminada')
  if (ok !== undefined) await router.replace('/tematicas')
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <UButton to="/tematicas" icon="i-lucide-arrow-left" variant="ghost" color="neutral" aria-label="Volver" />
      <h1 class="text-xl font-semibold">{{ isNew ? 'Nueva temática' : state.name }}</h1>
    </div>


    <ThemeActions v-if="!isNew" :theme-id="id" :provider="state.provider" />

    <UForm :schema="themeInputSchema" :state="state" class="space-y-4" @submit="save">
      <UCard>
        <template #header><h2 class="font-medium">General</h2></template>
        <div class="space-y-4">
          <UFormField label="Nombre" name="name" required>
            <UInput v-model="state.name" placeholder="Bebé" class="w-full" />
          </UFormField>
          <UFormField label="Descripción" name="description">
            <UTextarea v-model="state.description" :rows="2" class="w-full" />
          </UFormField>
          <UFormField name="active">
            <USwitch v-model="state.active" label="Activa (se incluye en el escaneo diario)" />
          </UFormField>
          <UFormField
            label="Fuente de productos"
            name="provider"
            help="Sin acceso a la API, usa «Alta manual»: se publica sin precio (SPEC §14.1)."
          >
            <USelect v-model="state.provider" :items="providerItems" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header><h2 class="font-medium">Criterios de búsqueda</h2></template>
        <div class="space-y-4">
          <UFormField label="Categoría de búsqueda (search index)" name="searchIndex">
            <USelect v-model="state.searchIndex" :items="searchIndexItems" class="w-full" />
          </UFormField>
          <UFormField label="Palabras clave" name="keywords" help="Una búsqueda por cada palabra o frase.">
            <UInputTags v-model="state.keywords" placeholder="Añadir y pulsar Enter" class="w-full" />
          </UFormField>
          <UFormField label="Nodos de categoría (browse nodes)" name="browseNodes">
            <UInputTags v-model="state.browseNodes" placeholder="Ej. 1703495031" class="w-full" />
          </UFormField>
          <UFormField label="Palabras excluidas" name="excludeKeywords">
            <UInputTags v-model="state.excludeKeywords" placeholder="Ej. reacondicionado" class="w-full" />
          </UFormField>
          <UFormField label="Marcas excluidas" name="excludeBrands">
            <UInputTags v-model="state.excludeBrands" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header><h2 class="font-medium">Filtros de calidad</h2></template>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Descuento mínimo real (%)" name="minDiscountPct">
            <UInputNumber v-model="state.minDiscountPct" :min="0" :max="95" class="w-full" />
          </UFormField>
          <UFormField label="Valoración mínima" name="minRating" help="Solo filtra la búsqueda de la API.">
            <USelect v-model="state.minRating" :items="ratingItems" class="w-full" />
          </UFormField>
          <UFormField label="Precio mínimo" name="minPriceCents">
            <EuroInput v-model="state.minPriceCents" placeholder="Sin mínimo" />
          </UFormField>
          <UFormField label="Precio máximo" name="maxPriceCents">
            <EuroInput v-model="state.maxPriceCents" placeholder="Sin máximo" />
          </UFormField>
          <UFormField
            label="Nº mínimo de reseñas"
            name="minReviews"
            help="Informativo: la API no devuelve reseñas (SPEC §13.A.5)."
          >
            <UInputNumber v-model="state.minReviews" :min="0" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header><h2 class="font-medium">Publicación</h2></template>
        <div class="space-y-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Límite de publicaciones al día" name="dailyLimit">
              <UInputNumber v-model="state.dailyLimit" :min="1" :max="50" class="w-full" />
            </UFormField>
            <UFormField
              label="No repetir un producto durante (días)"
              name="dedupeDays"
              help="Salvo que el precio haya bajado."
            >
              <UInputNumber v-model="state.dedupeDays" :min="0" :max="365" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Franjas horarias (hora peninsular)" name="publishWindows">
            <PublishWindowsEditor v-model="state.publishWindows" />
          </UFormField>
          <UFormField label="Canales destino" name="channelIds">
            <USelectMenu
              v-model="state.channelIds"
              :items="channelItems"
              value-key="value"
              multiple
              placeholder="Elige canales"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Tono del mensaje"
            name="tone"
            help="Lo sigue la IA al redactar la entradilla (con ANTHROPIC_API_KEY configurada)."
          >
            <UTextarea v-model="state.tone" :rows="2" placeholder="Cercano, para madres y padres primerizos" class="w-full" />
          </UFormField>
        </div>
      </UCard>

      <UCard v-if="!isNew">
        <template #header>
          <h2 class="font-medium">Plantillas de esta temática</h2>
          <p class="text-xs text-muted">Si no las cambias, se usan las generales de Ajustes.</p>
        </template>
        <UTabs
          :items="[
            { label: 'Telegram', slot: 'telegram' },
            { label: 'WhatsApp', slot: 'whatsapp' },
          ]"
        >
          <template #telegram><TemplateEditor format="telegram-html" :theme-id="id" /></template>
          <template #whatsapp><TemplateEditor format="whatsapp" :theme-id="id" /></template>
        </UTabs>
      </UCard>

      <div class="flex flex-wrap justify-between gap-2">
        <UButton
          v-if="!isNew"
          label="Eliminar"
          icon="i-lucide-trash-2"
          color="error"
          variant="soft"
          @click="remove"
        />
        <UButton type="submit" label="Guardar" icon="i-lucide-save" :loading="pending" class="ml-auto" />
      </div>
    </UForm>
  </div>
</template>
