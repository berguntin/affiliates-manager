import { tick } from '../../services/queue'
import { withRun } from '../../services/runs'

/** Lanza a mano el procesado de la cola (lo mismo que el cron cada 10 minutos). */
export default defineEventHandler(async () => {
  const db = useDb()
  const { status, runId } = await withRun(db, 'tick', 'manual', null, (log) => tick(db, log, queueContext()))
  return { status, runId }
})
