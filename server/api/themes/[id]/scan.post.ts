import { scanTheme } from '../../../services/scan'
import { withRun } from '../../../services/runs'
import { getTheme } from '../../../services/themes'

/** Escaneo manual de una temática (mismo servicio que el cron). */
export default defineEventHandler(async (event) => {
  const db = useDb()
  const theme = (await getTheme(db, requireParam(event, 'id'))) ?? notFound('Temática')
  const { status, runId, result } = await withRun(db, 'scan', 'manual', theme.id, (log) =>
    scanTheme(db, theme, log, { timezone: useTimezone() }),
  )
  const run = (await db.query.runs.findFirst({ where: (r, { eq }) => eq(r.id, runId) }))!
  return { status, created: result ?? 0, stats: run.stats, errors: run.errors }
})
