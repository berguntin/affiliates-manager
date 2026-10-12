import { eq, inArray } from 'drizzle-orm'
import type { ChannelData } from '../../shared/schemas'
import type { Db } from '../utils/db'
import { schema } from '../utils/db'

const { channels, themeChannels } = schema

export type Channel = typeof channels.$inferSelect
export type ChannelWithThemes = Channel & { themeIds: string[] }

export async function listChannels(db: Db): Promise<ChannelWithThemes[]> {
  const [rows, links] = await Promise.all([
    db.select().from(channels).orderBy(channels.name),
    db.select().from(themeChannels),
  ])
  return rows.map((c) => ({
    ...c,
    themeIds: links.filter((l) => l.channelId === c.id).map((l) => l.themeId),
  }))
}

export async function getChannel(db: Db, id: string): Promise<ChannelWithThemes | null> {
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, id) })
  if (!channel) return null
  const links = await db.select().from(themeChannels).where(eq(themeChannels.channelId, id))
  return { ...channel, themeIds: links.map((l) => l.themeId) }
}

function columns(data: ChannelData) {
  const { themeIds: _themeIds, ...rest } = data
  return rest
}

export async function createChannel(db: Db, data: ChannelData): Promise<ChannelWithThemes> {
  const id = crypto.randomUUID()
  const themeIds = await existingThemeIds(db, data.themeIds)
  await db.batch([
    db.insert(channels).values({ id, ...columns(data) }),
    ...themeIds.map((themeId) => db.insert(themeChannels).values({ themeId, channelId: id })),
  ])
  return (await getChannel(db, id))!
}

export async function updateChannel(
  db: Db,
  id: string,
  data: ChannelData,
): Promise<ChannelWithThemes | null> {
  if (!(await getChannel(db, id))) return null
  const themeIds = await existingThemeIds(db, data.themeIds)
  await db.batch([
    db
      .update(channels)
      .set({ ...columns(data), updatedAt: Date.now() })
      .where(eq(channels.id, id)),
    db.delete(themeChannels).where(eq(themeChannels.channelId, id)),
    ...themeIds.map((themeId) => db.insert(themeChannels).values({ themeId, channelId: id })),
  ])
  return getChannel(db, id)
}

export async function deleteChannel(db: Db, id: string): Promise<boolean> {
  const deleted = await db.delete(channels).where(eq(channels.id, id)).returning({ id: channels.id })
  return deleted.length > 0
}

async function existingThemeIds(db: Db, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: schema.themes.id })
    .from(schema.themes)
    .where(inArray(schema.themes.id, ids))
  return rows.map((r) => r.id)
}
