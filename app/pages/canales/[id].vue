<script setup lang="ts">
import { channelInputSchema, type ChannelData } from '#shared/schemas'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const isNew = computed(() => id.value === 'nuevo')

const { data: themes } = await useFetch('/api/themes')

const state = reactive<ChannelData>({
  type: 'telegram',
  name: '',
  identifier: '',
  trackingId: '',
  legalUrl: null,
  active: true,
  themeIds: [],
})

if (!isNew.value) {
  const channel = await $fetch(`/api/channels/${id.value}`).catch(() => null)
  if (!channel) throw createError({ statusCode: 404, statusMessage: 'Canal no encontrado' })
  Object.assign(state, {
    type: channel.type,
    name: channel.name,
    identifier: channel.identifier,
    trackingId: channel.trackingId,
    legalUrl: channel.legalUrl,
    active: channel.active,
    themeIds: channel.themeIds,
  })
}

const typeItems = [
  { label: 'Telegram (publicación automática)', value: 'telegram' },
  { label: 'WhatsApp (publicación asistida)', value: 'whatsapp' },
]

const themeItems = computed(() => (themes.value ?? []).map((t) => ({ label: t.name, value: t.id })))

const identifierHelp = computed(() =>
  state.type === 'telegram'
    ? '@nombre_del_canal o id numérico (-100…). El bot debe ser administrador del canal.'
    : 'Enlace del canal de WhatsApp (solo informativo; la publicación es manual).',
)

const legalUrl = computed({
  get: () => state.legalUrl ?? '',
  set: (value: string) => (state.legalUrl = value.trim() || null),
})
const legalUrlHelp =
  'Opcional. Cada oferta acaba con «ℹ️ Enlace de afiliado · precio sujeto a cambios»; si pones aquí un enlace (p. ej. el mensaje fijado con los textos completos: mantenlo pulsado → Copiar enlace), esa línea enlazará a él.'

const { run, pending } = useApiAction()

async function verify() {
  const result = await run(() => apiFetch<{ ok: boolean; detail: string }>(`/api/channels/${id.value}/verify`, { method: 'POST' }))
  if (result) {
    useToast().add({ title: result.ok ? 'Canal correcto' : 'Revisa el canal', description: result.detail, color: result.ok ? 'success' : 'warning' })
  }
}

async function save() {
  const body = channelInputSchema.parse(state)
  const saved = await run(
    () =>
      isNew.value
        ? apiFetch<{ id: string }>('/api/channels', { method: 'POST', body })
        : apiFetch<{ id: string }>(`/api/channels/${id.value}`, { method: 'PUT', body }),
    'Canal guardado',
  )
  if (saved && isNew.value) await router.replace(`/canales/${saved.id}`)
}

async function remove() {
  if (!confirm('¿Eliminar el canal y su cola de publicaciones?')) return
  const ok = await run(() => apiFetch(`/api/channels/${id.value}`, { method: 'DELETE' }), 'Canal eliminado')
  if (ok !== undefined) await router.replace('/canales')
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <UButton to="/canales" icon="i-lucide-arrow-left" variant="ghost" color="neutral" aria-label="Volver" />
      <h1 class="text-xl font-semibold">{{ isNew ? 'Nuevo canal' : state.name }}</h1>
    </div>

    <UAlert
      icon="i-lucide-info"
      color="neutral"
      variant="subtle"
      description="Da de alta el canal como «Sitio» en Associates Central y crea allí su tracking ID antes de usarlo (SPEC §13.A.6)."
    />

    <UForm :schema="channelInputSchema" :state="state" class="space-y-4" @submit="save">
      <UCard>
        <div class="space-y-4">
          <UFormField label="Tipo" name="type" required>
            <USelect v-model="state.type" :items="typeItems" class="w-full" :disabled="!isNew" />
          </UFormField>
          <UFormField label="Nombre" name="name" required>
            <UInput v-model="state.name" placeholder="Ofertas Bebé" class="w-full" />
          </UFormField>
          <UFormField label="Identificador" name="identifier" required :help="identifierHelp">
            <UInput v-model="state.identifier" class="w-full" />
          </UFormField>
          <UFormField
            label="Tracking ID de Afiliados"
            name="trackingId"
            required
            help="Distinto por canal para medir qué canal convierte. Ej. micanal-21"
          >
            <UInput v-model="state.trackingId" class="w-full" autocapitalize="off" />
          </UFormField>
          <UFormField label="Enlace para la línea de avisos" name="legalUrl" :help="legalUrlHelp">
            <UInput v-model="legalUrl" placeholder="https://t.me/tu_canal/2" inputmode="url" autocapitalize="off" class="w-full" />
          </UFormField>
          <UFormField label="Temáticas" name="themeIds">
            <USelectMenu
              v-model="state.themeIds"
              :items="themeItems"
              value-key="value"
              multiple
              placeholder="Elige temáticas"
              class="w-full"
            />
          </UFormField>
          <UFormField name="active">
            <USwitch v-model="state.active" label="Activo" />
          </UFormField>
        </div>
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
        <UButton
          v-if="!isNew && state.type === 'telegram'"
          label="Verificar bot"
          icon="i-lucide-shield-check"
          variant="soft"
          :loading="pending"
          @click="verify"
        />
        <UButton type="submit" label="Guardar" icon="i-lucide-save" :loading="pending" class="ml-auto" />
      </div>
    </UForm>
  </div>
</template>
