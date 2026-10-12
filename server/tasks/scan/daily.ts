import { withRun } from '../../services/runs'
import { scanAllThemes } from '../../services/scan'
import { createCopywriter } from '../../services/copywriter'

export default defineTask({
  meta: { name: 'scan:daily', description: 'Escanea todas las temáticas activas y crea candidatas' },
  async run() {
    const db = useDb()
    const { status, runId } = await withRun(db, 'scan', 'cron', null, (log) =>
      scanAllThemes(db, log, { timezone: useTimezone(), copywriter: createCopywriter(useEnv()) }),
    )
    return { result: { status, runId } }
  },
})
