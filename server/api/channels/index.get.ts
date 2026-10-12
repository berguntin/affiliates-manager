import { listChannels } from '../../services/channels'

export default defineEventHandler(() => listChannels(useDb()))
