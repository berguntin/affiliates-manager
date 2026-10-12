<script setup lang="ts">
import type { MessageFormat } from '#shared/types'

const props = defineProps<{ format: MessageFormat; themeId?: string | null }>()

interface TemplateRecord {
  body: string | null
  isDefault: boolean
  defaultBody: string
  variables: string[]
}

const { data, refresh } = await useFetch<TemplateRecord>(`/api/templates/${props.format}`, {
  query: { themeId: props.themeId ?? undefined },
})

const body = ref('')
watch(
  data,
  (d) => {
    if (d) body.value = d.body ?? d.defaultBody
  },
  { immediate: true },
)

const withPrice = ref(true)
const preview = ref<{ text: string; warnings: string[] } | null>(null)
const { run, pending } = useApiAction()

async function updatePreview() {
  if (!data.value) return // sin plantilla cargada no hay nada que previsualizar
  preview.value =
    (await run(() =>
      apiFetch<{ text: string; warnings: string[] }>('/api/templates/preview', {
        method: 'POST',
        body: { format: props.format, body: body.value, withPrice: withPrice.value },
      }),
    )) ?? null
}

let timer: ReturnType<typeof setTimeout> | undefined
watch(
  [body, withPrice],
  () => {
    clearTimeout(timer)
    timer = setTimeout(updatePreview, 400)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearTimeout(timer))

async function save(reset = false) {
  const ok = await run(
    () =>
      apiFetch(`/api/templates/${props.format}`, {
        method: 'PUT',
        body: { themeId: props.themeId ?? null, body: reset ? null : body.value },
      }),
    reset ? 'Plantilla restablecida' : 'Plantilla guardada',
  )
  if (ok) await refresh()
}

const variableTags = computed(() => (data.value?.variables ?? []).map((v) => `{{${v}}}`))
const sectionExample = '{{#marca}}…{{/marca}}'

const channelType = computed(() => (props.format === 'telegram-html' ? 'telegram' : 'whatsapp'))
</script>

<template>
  <div class="space-y-3">
    <p class="text-xs text-muted">
      Variables: <code v-for="tag in variableTags" :key="tag" class="mr-1" v-text="tag" />. Secciones:
      <code v-text="sectionExample" />. El precio con fecha y hora y los avisos legales se añaden siempre.
      <code v-text="'{{entradilla}}'" /> es la frase redactada por IA; si la plantilla no la incluye, va al principio.
      <template v-if="format === 'telegram-html'">Formato HTML de Telegram: &lt;b&gt;, &lt;i&gt;.</template>
      <template v-else>Formato de WhatsApp: *negrita*, _cursiva_.</template>
    </p>
    <UTextarea v-model="body" :rows="12" autoresize class="w-full font-mono text-sm" />
    <div class="flex flex-wrap items-center gap-2">
      <UButton label="Guardar" icon="i-lucide-save" size="sm" :loading="pending" @click="save()" />
      <UButton
        v-if="data && !data.isDefault"
        :label="themeId ? 'Usar la plantilla general' : 'Restablecer la de serie'"
        size="sm"
        variant="ghost"
        color="neutral"
        @click="save(true)"
      />
      <USwitch v-model="withPrice" label="Vista previa con precio" class="ml-auto" />
    </div>
    <div v-if="preview" class="space-y-2">
      <UAlert v-for="w in preview.warnings" :key="w" color="warning" variant="subtle" :description="w" />
      <!-- eslint-disable-next-line vue/no-v-html -- HTML saneado en messageToHtml -->
      <div class="whitespace-pre-wrap break-words rounded-md bg-elevated/50 p-3 text-sm" v-html="messageToHtml(preview.text, channelType)" />
    </div>
  </div>
</template>
