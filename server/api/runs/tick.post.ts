import { tick } from '../../services/queue'
import { withRun } from '../../services/runs'

/** Lanza a mano el procesado de la cola (lo mismo que el cron cada 10 minutos). */
export default defineEventHandler(async () => {
  const db = useDb()
  const { status, runId } = await withRun(db, 'tick', 'manual', null, (log) => tick(db, log, queueContext()))
  const run = await db.query.runs.findFirst({ where: (r, { eq }) => eq(r.id, runId) })
  return { status, runId, stats: run?.stats ?? {}, errors: run?.errors ?? [] }
})
