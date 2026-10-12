export default defineEventHandler((event) => ({ email: event.context.userEmail ?? null }))
