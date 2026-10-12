import { withRun } from '../../services/runs'
import { scanAllThemes } from '../../services/scan'

/** Lanza a mano el escaneo de todas las temáticas activas (lo mismo que el cron diario). */
export default defineEventHandler(async () => {
  const db = useDb()
  const { status, runId } = await withRun(db, 'scan', 'manual', null, (log) =>
    scanAllThemes(db, log, { timezone: useTimezone() }),
  )
  return { status, runId }
})
