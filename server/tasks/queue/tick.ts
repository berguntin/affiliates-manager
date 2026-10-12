import { tick } from '../../services/queue'
import { withRun } from '../../services/runs'

export default defineTask({
  meta: { name: 'queue:tick', description: 'Publica lo programado, caduca candidatas y purga datos de más de 24 h' },
  async run() {
    const db = useDb()
    const { status, runId } = await withRun(db, 'tick', 'cron', null, (log) => tick(db, log, queueContext()))
    return { result: { status, runId } }
  },
})
