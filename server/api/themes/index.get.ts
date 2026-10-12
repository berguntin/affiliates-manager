import { listThemes } from '../../services/themes'

export default defineEventHandler(() => listThemes(useDb()))
