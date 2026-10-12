<script setup lang="ts">
const { data: status, error } = await useFetch('/api/settings/status')

const unknown = 'No disponible (la API no responde)'
const rows = computed(() => [
  { label: 'Autenticación', value: status.value?.authMode ?? unknown, ok: Boolean(status.value) },
  { label: 'Zona horaria', value: status.value?.timezone ?? unknown, ok: Boolean(status.value) },
  {
    label: 'Bot de Telegram (TELEGRAM_BOT_TOKEN)',
    value: !status.value ? unknown : status.value.telegramConfigured ? 'Configurado' : 'Sin configurar',
    ok: status.value?.telegramConfigured,
  },
  { label: 'Creators API', value: 'Fase 2 (requiere 10 ventas en 30 días)', ok: false },
  { label: 'Redacción con IA (Anthropic)', value: 'Fase 2', ok: false },
])
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-xl font-semibold">Ajustes</h1>

    <UCard>
      <template #header>
        <h2 class="font-medium">Configuración y claves</h2>
      </template>
      <UAlert
        v-if="error"
        class="mb-3"
        color="error"
        variant="subtle"
        :title="`No se pudo leer la configuración (${error.statusCode ?? 'sin respuesta'})`"
        :description="apiErrorMessage(error)"
      />
      <ul class="divide-y divide-default text-sm">
        <li v-for="row in rows" :key="row.label" class="flex items-center justify-between gap-3 py-2">
          <span>{{ row.label }}</span>
          <span class="flex items-center gap-1.5 text-right text-muted">
            <UIcon
              :name="row.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
              :class="row.ok ? 'text-success' : 'text-muted'"
              class="size-4 shrink-0"
            />
            {{ row.value }}
          </span>
        </li>
      </ul>
      <p class="mt-3 text-xs text-muted">
        Los secretos se gestionan con <code>wrangler secret put</code> y nunca se muestran aquí. Los tracking IDs se
        configuran en cada canal.
      </p>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-medium">Plantilla general de Telegram</h2>
      </template>
      <TemplateEditor format="telegram-html" />
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-medium">Plantilla general de WhatsApp</h2>
      </template>
      <TemplateEditor format="whatsapp" />
    </UCard>
  </div>
</template>
