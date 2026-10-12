import { eq } from 'drizzle-orm'
import type { MessageFormat } from '../../shared/types'
import { DEFAULT_TEMPLATES } from '../domain/messages/defaults'
import type { Db } from '../utils/db'
import { schema } from '../utils/db'

const { messageTemplates } = schema

const templateId = (themeId: string | null, format: MessageFormat) => `${themeId ?? 'global'}:${format}`

/** Plantilla efectiva: la de la temática, si no la global, si no la de serie. */
export async function resolveTemplate(db: Db, themeId: string | null, format: MessageFormat): Promise<string> {
  const ids = [...(themeId ? [templateId(themeId, format)] : []), templateId(null, format)]
  for (const id of ids) {
    const row = await db.query.messageTemplates.findFirst({ where: eq(messageTemplates.id, id) })
    if (row) return row.body
  }
  return DEFAULT_TEMPLATES[format]
}

export async function getTemplateRecord(db: Db, themeId: string | null, format: MessageFormat) {
  const row = await db.query.messageTemplates.findFirst({
    where: eq(messageTemplates.id, templateId(themeId, format)),
  })
  return { body: row?.body ?? null, isDefault: !row, defaultBody: DEFAULT_TEMPLATES[format] }
}

export async function saveTemplate(db: Db, themeId: string | null, format: MessageFormat, body: string | null) {
  const id = templateId(themeId, format)
  if (body === null) {
    await db.delete(messageTemplates).where(eq(messageTemplates.id, id))
    return
  }
  await db
    .insert(messageTemplates)
    .values({ id, themeId, format, body })
    .onConflictDoUpdate({ target: messageTemplates.id, set: { body, updatedAt: Date.now() } })
}
