import { daySummary } from '../services/queue'
import { listRuns } from '../services/runs'

export default defineEventHandler(async () => {
  const db = useDb()
  const [summary, runs] = await Promise.all([daySummary(db, useTimezone()), listRuns(db, 5)])
  return { ...summary, lastRuns: runs }
})
