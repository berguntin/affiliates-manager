import { listRuns } from '../../services/runs'

export default defineEventHandler(() => listRuns(useDb(), 100))
