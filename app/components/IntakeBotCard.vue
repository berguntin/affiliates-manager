<script setup lang="ts">
interface IntakeStatus {
  configured: boolean
  bot?: string
  webhookUrl?: string | null
  pending?: number
  lastError?: string | null
  lastErrorAt?: number | null
  error?: string
}

const { data, refresh, pending: loading } = await useFetch<IntakeStatus>('/api/intake/status')
const { run, pending } = useApiAction()

async function connect() {
  const result = await run(
    () => apiFetch<{ url: string; bot: string }>('/api/intake/setup', { method: 'POST' }),
    'Webhook del buzón registrado',
  )
  if (result) await refresh()
}

const expectedUrl = computed(() =>
  typeof window === 'undefined' ? '' : `${window.location.origin}/webhooks/telegram-intake`,
)
const connected = computed(() => Boolean(data.value?.webhookUrl) && data.value?.webhookUrl === expectedUrl.value)
</script>

<template>
  <UCard>
    <template #header>
      <h2 class="font-medium">Bot buzón de Telegram</h2>
      <p class="text-xs text-muted">
        Compartid enlaces desde la app de Amazon al bot y entran en la cola con la entradilla de IA.
      </p>
    </template>

    <div v-if="loading && !data" class="text-sm text-muted">Comprobando…</div>
    <div v-else-if="!data?.configured" class="space-y-2 text-sm">
      <p>Sin configurar. Crea el bot con @BotFather y añade estos secretos:</p>
      <ul class="list-disc pl-5 text-muted">
        <li><code>INTAKE_BOT_TOKEN</code>: token del bot buzón (no el que publica).</li>
        <li><code>INTAKE_WEBHOOK_SECRET</code>: una cadena aleatoria larga.</li>
        <li><code>INTAKE_ALLOWED_USER_IDS</code>: vuestros IDs de Telegram, separados por comas.</li>
      </ul>
      <p class="text-xs text-muted">
        ¿No sabes tu ID? Escribe al bot cuando tenga el token: te responderá con él.
      </p>
    </div>
    <div v-else class="space-y-3 text-sm">
      <UAlert v-if="data.error" color="error" variant="subtle" :description="data.error" />
      <ul v-else class="divide-y divide-default">
        <li class="flex justify-between gap-3 py-2"><span>Bot</span><span class="text-muted">{{ data.bot }}</span></li>
        <li class="flex justify-between gap-3 py-2">
          <span>Webhook</span>
          <span class="flex items-center gap-1.5 text-right text-muted">
            <UIcon
              :name="connected ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'"
              :class="connected ? 'text-success' : 'text-muted'"
              class="size-4 shrink-0"
            />
            {{ connected ? 'Conectado' : data.webhookUrl ? 'Apunta a otra URL' : 'Sin conectar' }}
          </span>
        </li>
        <li v-if="data.lastError" class="py-2 text-error">
          Último error de Telegram ({{ formatDateTime(data.lastErrorAt) }}): {{ data.lastError }}
        </li>
      </ul>
      <UButton
        :label="connected ? 'Volver a conectar' : 'Conectar webhook'"
        icon="i-lucide-plug"
        :variant="connected ? 'soft' : 'solid'"
        :loading="pending"
        @click="connect"
      />
      <p class="text-xs text-muted">
        Cloudflare Access debe dejar pasar <code>/webhooks/telegram-intake</code> (política «Bypass», ver README):
        Telegram no puede iniciar sesión.
      </p>
    </div>
  </UCard>
</template>
