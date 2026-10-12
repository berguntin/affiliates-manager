import { desc, eq } from 'drizzle-orm'
import type { RunKind, RunStatus, RunTrigger } from '../../shared/types'
import type { Db } from '../utils/db'
import { schema } from '../utils/db'

const { runs } = schema

export class RunLog {
  readonly stats: Record<string, number> = {}
  readonly errors: string[] = []

  constructor(
    private readonly db: Db,
    readonly id: string,
  ) {}

  count(key: string, n = 1) {
    this.stats[key] = (this.stats[key] ?? 0) + n
  }

  error(message: string) {
    this.errors.push(message)
  }

  async finish(failed = false): Promise<RunStatus> {
    const status: RunStatus = failed ? 'error' : this.errors.length > 0 ? 'partial' : 'ok'
    await this.db
      .update(runs)
      .set({ finishedAt: Date.now(), status, stats: this.stats, errors: this.errors.slice(0, 50) })
      .where(eq(runs.id, this.id))
    return status
  }
}

export async function startRun(
  db: Db,
  kind: RunKind,
  trigger: RunTrigger,
  themeId: string | null = null,
): Promise<RunLog> {
  const id = crypto.randomUUID()
  await db.insert(runs).values({ id, kind, trigger, themeId, startedAt: Date.now(), status: 'running' })
  return new RunLog(db, id)
}

/** Ejecuta `fn` registrando estadísticas y errores; nunca deja la ejecución en «running». */
export async function withRun<T>(
  db: Db,
  kind: RunKind,
  trigger: RunTrigger,
  themeId: string | null,
  fn: (log: RunLog) => Promise<T>,
): Promise<{ result: T | null; status: RunStatus; runId: string }> {
  const log = await startRun(db, kind, trigger, themeId)
  try {
    const result = await fn(log)
    return { result, status: await log.finish(), runId: log.id }
  } catch (error) {
    log.error(`Error inesperado: ${(error as Error).message}`)
    return { result: null, status: await log.finish(true), runId: log.id }
  }
}

export async function listRuns(db: Db, limit = 50) {
  return db
    .select({
      id: runs.id,
      kind: runs.kind,
      trigger: runs.trigger,
      themeId: runs.themeId,
      themeName: schema.themes.name,
      startedAt: runs.startedAt,
      finishedAt: runs.finishedAt,
      status: runs.status,
      stats: runs.stats,
      errors: runs.errors,
    })
    .from(runs)
    .leftJoin(schema.themes, eq(runs.themeId, schema.themes.id))
    .orderBy(desc(runs.startedAt))
    .limit(limit)
}
