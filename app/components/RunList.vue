<script setup lang="ts">
interface Run {
  id: string
  kind: string
  trigger: string
  themeName: string | null
  startedAt: number
  finishedAt: number | null
  status: string
  stats: Record<string, number>
  errors: string[]
}

defineProps<{ runs: Run[] }>()

const statusMeta: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'info' }> = {
  ok: { label: 'Correcta', color: 'success' },
  partial: { label: 'Con avisos', color: 'warning' },
  error: { label: 'Error', color: 'error' },
  running: { label: 'En curso', color: 'info' },
}

const kindLabel = (kind: string) => (kind === 'scan' ? 'Escaneo' : 'Cola')
const statsText = (stats: Record<string, number>) =>
  Object.entries(stats)
    .map(([k, v]) => `${k.replace('_', ' ')}: ${v}`)
    .join(' · ')
</script>

<template>
  <div class="space-y-2">
    <UCard v-for="run in runs" :key="run.id" :ui="{ body: 'p-3 sm:p-4 space-y-1' }">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-medium">
            {{ kindLabel(run.kind) }}{{ run.themeName ? ` · ${run.themeName}` : '' }}
            <span class="font-normal text-muted">({{ run.trigger === 'cron' ? 'cron' : 'manual' }})</span>
          </p>
          <p class="text-xs text-muted">{{ formatDateTime(run.startedAt) }}</p>
        </div>
        <UBadge
          :label="statusMeta[run.status]?.label ?? run.status"
          :color="statusMeta[run.status]?.color ?? 'neutral'"
          variant="subtle"
        />
      </div>
      <p v-if="Object.keys(run.stats).length" class="text-xs text-muted">{{ statsText(run.stats) }}</p>
      <ul v-if="run.errors.length" class="list-disc space-y-0.5 pl-5 text-xs text-error">
        <li v-for="(error, i) in run.errors" :key="i">{{ error }}</li>
      </ul>
    </UCard>
  </div>
</template>
