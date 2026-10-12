import { eq, inArray, like } from 'drizzle-orm'
import type { ThemeData } from '../../shared/schemas'
import { slugify } from '../domain/text'
import type { Db } from '../utils/db'
import { schema } from '../utils/db'

const { themes, themeChannels } = schema

export type Theme = typeof themes.$inferSelect
export type ThemeWithChannels = Theme & { channelIds: string[] }

export async function listThemes(db: Db): Promise<ThemeWithChannels[]> {
  const [rows, links] = await Promise.all([
    db.select().from(themes).orderBy(themes.name),
    db.select().from(themeChannels),
  ])
  return rows.map((t) => ({
    ...t,
    channelIds: links.filter((l) => l.themeId === t.id).map((l) => l.channelId),
  }))
}

export async function getTheme(db: Db, id: string): Promise<ThemeWithChannels | null> {
  const theme = await db.query.themes.findFirst({ where: eq(themes.id, id) })
  if (!theme) return null
  const links = await db.select().from(themeChannels).where(eq(themeChannels.themeId, id))
  return { ...theme, channelIds: links.map((l) => l.channelId) }
}

async function uniqueSlug(db: Db, name: string, excludeId?: string): Promise<string> {
  const base = slugify(name)
  const taken = await db
    .select({ id: themes.id, slug: themes.slug })
    .from(themes)
    .where(like(themes.slug, `${base}%`))
  const used = new Set(taken.filter((t) => t.id !== excludeId).map((t) => t.slug))
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

function columns(data: ThemeData) {
  const { channelIds: _channelIds, ...rest } = data
  return rest
}

export async function createTheme(db: Db, data: ThemeData): Promise<ThemeWithChannels> {
  const id = crypto.randomUUID()
  const slug = await uniqueSlug(db, data.name)
  const channelIds = await existingChannelIds(db, data.channelIds)
  await db.batch([
    db.insert(themes).values({ id, slug, ...columns(data) }),
    ...channelIds.map((channelId) => db.insert(themeChannels).values({ themeId: id, channelId })),
  ])
  return (await getTheme(db, id))!
}

export async function updateTheme(
  db: Db,
  id: string,
  data: ThemeData,
): Promise<ThemeWithChannels | null> {
  const current = await getTheme(db, id)
  if (!current) return null
  const slug = current.name === data.name ? current.slug : await uniqueSlug(db, data.name, id)
  const channelIds = await existingChannelIds(db, data.channelIds)
  await db.batch([
    db
      .update(themes)
      .set({ slug, ...columns(data), updatedAt: Date.now() })
      .where(eq(themes.id, id)),
    db.delete(themeChannels).where(eq(themeChannels.themeId, id)),
    ...channelIds.map((channelId) => db.insert(themeChannels).values({ themeId: id, channelId })),
  ])
  return getTheme(db, id)
}

export async function deleteTheme(db: Db, id: string): Promise<boolean> {
  const deleted = await db.delete(themes).where(eq(themes.id, id)).returning({ id: themes.id })
  return deleted.length > 0
}

async function existingChannelIds(db: Db, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: schema.channels.id })
    .from(schema.channels)
    .where(inArray(schema.channels.id, ids))
  return rows.map((r) => r.id)
}
