<script setup lang="ts">
import { RELIABILITY_LABELS, STATUS_LABELS, type QueueItem } from '#shared/api'
import { QUEUE_TICK_MINUTES, alignToTick, nextTick } from '#shared/queue-cycle'

const props = defineProps<{ item: QueueItem; readonly?: boolean }>()
const emit = defineEmits<{ changed: [item: QueueItem] }>()

const toast = useToast()
const { run, pending } = useApiAction()

const isTelegram = computed(() => props.item.channelType === 'telegram')
const preview = computed(() => messageToHtml(props.item.text, props.item.channelType))
const can = (action: QueueItem['actions'][number]) => !props.readonly && props.item.actions.includes(action)

const statusColor = computed(() => {
  switch (props.item.status) {
    case 'publicada':
      return 'success'
    case 'programada':
      return 'info'
    case 'aprobada':
      return 'primary'
    case 'descartada':
    case 'caducada':
      return 'neutral'
    default:
      return 'warning'
  }
})

async function action(name: 'approve' | 'discard' | 'unschedule', success: string) {
  const updated = await run(
    () => apiFetch<QueueItem>(`/api/publications/${props.item.id}/action`, { method: 'POST', body: { action: name } }),
    success,
  )
  if (updated) emit('changed', updated)
}

// --- Editar ---
const editOpen = ref(false)
const draft = ref('')
function openEdit() {
  draft.value = props.item.text
  editOpen.value = true
}
async function saveEdit() {
  const updated = await run(
    () =>
      apiFetch<QueueItem>(`/api/publications/${props.item.id}/action`, {
        method: 'POST',
        body: { action: 'edit', text: draft.value },
      }),
    'Texto guardado',
  )
  if (updated) {
    editOpen.value = false
    emit('changed', updated)
  }
}

// --- Programar ---
const scheduleOpen = ref(false)
const scheduleMode = ref<'next' | 'auto' | 'manual'>('next')
const scheduleAt = ref('')
const now = ref(Date.now())
const nextCycle = computed(() => nextTick(now.value))
const manualCycle = computed(() => (scheduleAt.value ? alignToTick(new Date(scheduleAt.value).getTime()) : null))
const scheduleItems = computed(() => [
  { label: `Próximo ciclo de publicación (${formatTime(nextCycle.value)})`, value: 'next' },
  { label: 'Siguiente hueco libre en las franjas de la temática', value: 'auto' },
  { label: 'A una hora concreta', value: 'manual' },
])
function openSchedule() {
  now.value = Date.now()
  scheduleOpen.value = true
}
async function saveSchedule() {
  const scheduledAt =
    scheduleMode.value === 'next'
      ? nextCycle.value
      : scheduleMode.value === 'manual' && scheduleAt.value
        ? new Date(scheduleAt.value).getTime()
        : null
  const updated = await run(
    () =>
      apiFetch<QueueItem>(`/api/publications/${props.item.id}/action`, {
        method: 'POST',
        body: { action: 'schedule', scheduledAt },
      }),
    'Programada',
  )
  if (updated) {
    scheduleOpen.value = false
    emit('changed', updated)
  }
}

// --- Revisión de precio ---
async function acceptReview() {
  const updated = await run(
    () => apiFetch<QueueItem>(`/api/publications/${props.item.id}/accept-review`, { method: 'POST' }),
    'Mensaje actualizado con el precio actual',
  )
  if (updated) emit('changed', updated)
}

// --- Publicar (Telegram) ---
async function publishNow() {
  if (!confirm(`¿Publicar ahora en ${props.item.channelName}?`)) return
  const result = await run(() =>
    apiFetch<{ published: boolean; item: QueueItem }>(`/api/publications/${props.item.id}/publish`, { method: 'POST' }),
  )
  if (!result) return
  emit('changed', result.item)
  toast.add(
    result.published
      ? { title: 'Publicada en Telegram', color: 'success', icon: 'i-lucide-check' }
      : { title: 'Requiere revisión', description: result.item.reviewReason ?? undefined, color: 'warning' },
  )
}

// --- Publicación asistida (WhatsApp) ---
const shareOpen = ref(false)
const shareReady = ref(false)
const canShare = ref(false)
async function openShare() {
  shareReady.value = false
  shareOpen.value = true
  canShare.value = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const result = await run(() =>
    apiFetch<{ ok: boolean; item: QueueItem }>(`/api/publications/${props.item.id}/recheck`, { method: 'POST' }),
  )
  if (!result) return (shareOpen.value = false)
  emit('changed', result.item)
  if (!result.ok) {
    shareOpen.value = false
    toast.add({ title: 'Requiere revisión', description: result.item.reviewReason ?? undefined, color: 'warning' })
    return
  }
  shareReady.value = true
}
async function share() {
  try {
    await navigator.share({ text: props.item.text })
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      toast.add({ title: 'No se pudo abrir el menú de compartir', description: (error as Error).message, color: 'error' })
    }
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(props.item.text)
    toast.add({ title: 'Texto copiado', color: 'success', icon: 'i-lucide-clipboard-check' })
  } catch {
    toast.add({ title: 'No se pudo copiar: selecciona el texto a mano', color: 'error' })
  }
}
async function markPublished() {
  const result = await run(() =>
    apiFetch<{ published: boolean; item: QueueItem }>(`/api/publications/${props.item.id}/publish`, { method: 'POST' }),
  )
  if (!result) return
  emit('changed', result.item)
  shareOpen.value = false
  toast.add(
    result.published
      ? { title: 'Marcada como publicada', color: 'success', icon: 'i-lucide-check' }
      : { title: 'Requiere revisión', description: result.item.reviewReason ?? undefined, color: 'warning' },
  )
}
</script>

<template>
  <UCard :ui="{ body: 'p-3 sm:p-4 space-y-3' }">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0 space-y-1">
        <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <UIcon :name="isTelegram ? 'i-lucide-send' : 'i-lucide-message-circle'" class="size-4" />
          <span>{{ item.channelName }}</span>
          <span>·</span>
          <span>{{ item.themeName }}</span>
        </div>
        <p class="font-medium leading-snug">{{ item.title ?? item.asin }}</p>
      </div>
      <UBadge :label="STATUS_LABELS[item.status]" :color="statusColor" variant="subtle" class="shrink-0" />
    </div>

    <div class="flex flex-wrap gap-1.5">
      <UBadge
        v-if="item.effectiveDiscountPct"
        :label="`-${item.effectiveDiscountPct}% ${RELIABILITY_LABELS[item.reliability]}`"
        color="neutral"
        variant="outline"
      />
      <UBadge v-if="item.priceCentsShown != null" :label="formatCents(item.priceCentsShown)" color="neutral" variant="outline" />
      <UBadge v-else-if="item.source === 'manual'" label="Sin precio (alta manual)" color="neutral" variant="outline" />
      <UBadge v-if="item.suspicious" label="Sospechosa" color="error" variant="subtle" icon="i-lucide-triangle-alert" />
      <UBadge
        v-if="item.status === 'programada' && item.scheduledAt"
        :label="isTelegram ? `Se publica ${formatDateTime(item.scheduledAt)}` : `Recordatorio ${formatDateTime(item.scheduledAt)} (publicación manual)`"
        color="info"
        variant="subtle"
        icon="i-lucide-clock"
      />
      <UBadge
        v-if="item.status === 'publicada' && item.publishedAt"
        :label="formatDateTime(item.publishedAt)"
        color="success"
        variant="subtle"
        icon="i-lucide-check"
      />
      <UBadge
        v-if="!readonly && ['candidata', 'aprobada', 'programada'].includes(item.status)"
        :label="`Caduca en ${timeLeft(item.expiresAt)}`"
        color="neutral"
        variant="soft"
        icon="i-lucide-hourglass"
      />
    </div>

    <ul v-if="item.reasons.length && !readonly" class="list-disc space-y-0.5 pl-5 text-xs text-muted">
      <li v-for="reason in item.reasons" :key="reason">{{ reason }}</li>
    </ul>

    <UAlert
      v-if="item.needsReview"
      color="warning"
      variant="subtle"
      icon="i-lucide-badge-alert"
      title="Requiere revisión"
      :description="item.reviewReason ?? 'El precio ha cambiado'"
      :actions="readonly ? [] : [{ label: 'Usar precio actual', color: 'warning', variant: 'solid', onClick: acceptReview }]"
    />
    <UAlert v-if="item.error" color="error" variant="subtle" icon="i-lucide-circle-x" :description="item.error" />

    <details v-if="item.text" class="group rounded-md bg-elevated/50 text-sm">
      <summary class="cursor-pointer select-none px-3 py-2 text-muted">Ver mensaje</summary>
      <!-- eslint-disable-next-line vue/no-v-html -- HTML saneado en messageToHtml -->
      <div class="whitespace-pre-wrap break-words px-3 pb-3" v-html="preview" />
    </details>

    <div v-if="!readonly && item.actions.length" class="flex flex-wrap gap-2">
      <template v-if="!item.needsReview">
        <UButton
          v-if="can('publish') && isTelegram"
          label="Publicar ya"
          icon="i-lucide-send"
          size="sm"
          :loading="pending"
          @click="publishNow"
        />
        <UButton
          v-if="can('publish') && !isTelegram"
          label="Compartir en WhatsApp"
          icon="i-lucide-share-2"
          size="sm"
          :loading="pending"
          @click="openShare"
        />
        <UButton
          v-if="can('approve')"
          label="Aprobar"
          icon="i-lucide-check"
          size="sm"
          variant="soft"
          @click="action('approve', 'Aprobada')"
        />
        <UButton
          v-if="can('schedule')"
          :label="item.status === 'programada' ? 'Reprogramar' : 'Programar'"
          icon="i-lucide-calendar-clock"
          size="sm"
          variant="soft"
          @click="openSchedule"
        />
      </template>
      <UButton
        v-if="can('unschedule')"
        label="Desprogramar"
        icon="i-lucide-calendar-x"
        size="sm"
        variant="ghost"
        color="neutral"
        @click="action('unschedule', 'Desprogramada')"
      />
      <UButton v-if="can('edit')" label="Editar" icon="i-lucide-pencil" size="sm" variant="ghost" color="neutral" @click="openEdit" />
      <UButton
        v-if="can('discard')"
        label="Descartar"
        icon="i-lucide-x"
        size="sm"
        variant="ghost"
        color="error"
        class="ml-auto"
        @click="action('discard', 'Descartada')"
      />
    </div>

    <UModal v-model:open="editOpen" title="Editar mensaje" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <UTextarea v-model="draft" :rows="16" autoresize class="w-full font-mono text-sm" />
        <p class="mt-2 text-xs text-muted">
          Deben mantenerse el enlace, «Enlace de afiliado» y, si hay precio, la fecha y hora de consulta y
          «precio sujeto a cambios».
        </p>
      </template>
      <template #footer>
        <UButton label="Cancelar" color="neutral" variant="ghost" @click="editOpen = false" />
        <UButton label="Guardar" :loading="pending" @click="saveEdit" />
      </template>
    </UModal>

    <UModal v-model:open="scheduleOpen" title="Programar publicación">
      <template #body>
        <URadioGroup v-model="scheduleMode" :items="scheduleItems" />
        <template v-if="scheduleMode === 'manual'">
          <UInput v-model="scheduleAt" type="datetime-local" step="600" class="mt-3 w-full" />
          <p v-if="manualCycle && manualCycle >= item.expiresAt" class="mt-2 text-sm text-error">
            A esa hora la oferta ya habrá caducado. Elige una hora anterior.
          </p>
          <p v-else-if="manualCycle" class="mt-2 text-sm">
            Se publicará a las <b>{{ formatDateTime(manualCycle) }}</b> (ciclo de la cola).
          </p>
        </template>
        <p class="mt-3 text-xs text-muted">
          La cola publica cada {{ QUEUE_TICK_MINUTES }} minutos (:00, :10, :20…), así que las horas se ajustan al
          ciclo siguiente.
          Debe publicarse antes de que caduque ({{ formatDateTime(item.expiresAt) }}).
          <template v-if="!isTelegram">En WhatsApp te avisará la cola, pero la publicación es manual.</template>
        </p>
      </template>
      <template #footer>
        <UButton label="Cancelar" color="neutral" variant="ghost" @click="scheduleOpen = false" />
        <UButton
          label="Programar"
          :loading="pending"
          :disabled="scheduleMode === 'manual' && (!manualCycle || manualCycle >= item.expiresAt)"
          @click="saveSchedule"
        />
      </template>
    </UModal>

    <UModal v-model:open="shareOpen" title="Publicar en WhatsApp" :ui="{ content: 'max-w-xl' }">
      <template #body>
        <div v-if="!shareReady" class="flex items-center gap-2 text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Comprobando el precio…
        </div>
        <div v-else class="space-y-3">
          <ol class="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Comparte o copia el texto (WhatsApp genera la vista previa del enlace).</li>
            <li>Publícalo en «{{ item.channelName }}».</li>
            <li>Vuelve aquí y márcalo como publicado.</li>
          </ol>
          <!-- eslint-disable-next-line vue/no-v-html -- HTML saneado en messageToHtml -->
          <div class="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-elevated/50 p-3 text-sm" v-html="preview" />
          <div class="flex flex-wrap gap-2">
            <UButton v-if="canShare" label="Compartir" icon="i-lucide-share-2" @click="share" />
            <UButton label="Copiar texto" icon="i-lucide-copy" :variant="canShare ? 'soft' : 'solid'" @click="copy" />
          </div>
        </div>
      </template>
      <template #footer>
        <UButton label="Cerrar" color="neutral" variant="ghost" @click="shareOpen = false" />
        <UButton label="Ya lo he publicado" icon="i-lucide-check" :disabled="!shareReady" :loading="pending" @click="markPublished" />
      </template>
    </UModal>
  </UCard>
</template>
