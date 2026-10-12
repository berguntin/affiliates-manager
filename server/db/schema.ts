import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from 'drizzle-orm/sqlite-core'
import type {
  ChannelType,
  DealReliability,
  MessageFormat,
  ProviderId,
  PublicationStatus,
  PublishWindow,
  RunKind,
  RunStatus,
  RunTrigger,
  SavingBasisType,
} from '../../shared/types'

/** Fechas como epoch ms. */
const timestamp = (name: string) => integer(name, { mode: 'number' })
const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`
const jsonList = (name: string) =>
  text(name, { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`)

export const themes = sqliteTable('themes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  provider: text('provider').$type<ProviderId>().notNull().default('mock'),
  searchIndex: text('search_index').notNull().default('All'),
  keywords: jsonList('keywords'),
  browseNodes: jsonList('browse_nodes'),
  excludeKeywords: jsonList('exclude_keywords'),
  excludeBrands: jsonList('exclude_brands'),
  minDiscountPct: integer('min_discount_pct').notNull().default(20),
  minPriceCents: integer('min_price_cents'),
  maxPriceCents: integer('max_price_cents'),
  /** Filtro de búsqueda de la API (entero 1–4). La API no devuelve valoraciones. */
  minRating: integer('min_rating'),
  /** Informativo: la API no devuelve el nº de reseñas (SPEC §13.A.5). */
  minReviews: integer('min_reviews'),
  dailyLimit: integer('daily_limit').notNull().default(5),
  publishWindows: text('publish_windows', { mode: 'json' })
    .$type<PublishWindow[]>()
    .notNull()
    .default(sql`'[]'`),
  dedupeDays: integer('dedupe_days').notNull().default(14),
  tone: text('tone').notNull().default(''),
  createdAt: timestamp('created_at').notNull().default(now),
  updatedAt: timestamp('updated_at').notNull().default(now),
})

export const channels = sqliteTable('channels', {
  id: text('id').primaryKey(),
  type: text('type').$type<ChannelType>().notNull(),
  name: text('name').notNull(),
  /** Telegram: @canal o -100…; WhatsApp: URL del canal (informativa). */
  identifier: text('identifier').notNull(),
  trackingId: text('tracking_id').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamp('created_at').notNull().default(now),
  updatedAt: timestamp('updated_at').notNull().default(now),
})

export const themeChannels = sqliteTable(
  'theme_channels',
  {
    themeId: text('theme_id')
      .notNull()
      .references(() => themes.id, { onDelete: 'cascade' }),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.themeId, t.channelId] })],
)

export const manualProducts = sqliteTable(
  'manual_products',
  {
    id: text('id').primaryKey(),
    themeId: text('theme_id')
      .notNull()
      .references(() => themes.id, { onDelete: 'cascade' }),
    asin: text('asin').notNull(),
    title: text('title').notNull(),
    brand: text('brand'),
    /** Texto propio para el mensaje. */
    note: text('note').notNull().default(''),
    /** Nota interna: NUNCA se publica (SPEC §14.1). */
    internalPriceCents: integer('internal_price_cents'),
    /** Se marca al convertirlo en candidata. */
    consumedAt: timestamp('consumed_at'),
    createdAt: timestamp('created_at').notNull().default(now),
  },
  (t) => [index('manual_products_theme_idx').on(t.themeId, t.consumedAt)],
)

export const deals = sqliteTable(
  'deals',
  {
    id: text('id').primaryKey(),
    themeId: text('theme_id')
      .notNull()
      .references(() => themes.id, { onDelete: 'cascade' }),
    asin: text('asin').notNull(),
    source: text('source').$type<ProviderId>().notNull(),
    detectedAt: timestamp('detected_at').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    // Datos de la instantánea (se purgan a las 24 h si no se publican)
    title: text('title'),
    brand: text('brand'),
    imageUrl: text('image_url'),
    priceCents: integer('price_cents'),
    savingBasisCents: integer('saving_basis_cents'),
    savingBasisType: text('saving_basis_type').$type<SavingBasisType>(),
    savingsPct: integer('savings_pct'),
    dealType: text('deal_type'),
    dealEndsAt: timestamp('deal_ends_at'),
    // Evaluación
    effectiveDiscountPct: integer('effective_discount_pct'),
    reliability: text('reliability').$type<DealReliability>().notNull(),
    suspicious: integer('suspicious', { mode: 'boolean' }).notNull().default(false),
    reasons: jsonList('reasons'),
    score: integer('score').notNull().default(0),
    purgedAt: timestamp('purged_at'),
  },
  (t) => [
    index('deals_asin_idx').on(t.asin, t.detectedAt),
    index('deals_theme_idx').on(t.themeId, t.detectedAt),
  ],
)

export const publications = sqliteTable(
  'publications',
  {
    id: text('id').primaryKey(),
    dealId: text('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    channelId: text('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    status: text('status').$type<PublicationStatus>().notNull(),
    text: text('text').notNull(),
    link: text('link').notNull(),
    priceCentsShown: integer('price_cents_shown'),
    priceCheckedAt: timestamp('price_checked_at'),
    needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
    reviewReason: text('review_reason'),
    scheduledAt: timestamp('scheduled_at'),
    publishedAt: timestamp('published_at'),
    externalId: text('external_id'),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().default(now),
    updatedAt: timestamp('updated_at').notNull().default(now),
  },
  (t) => [
    index('publications_status_idx').on(t.status, t.scheduledAt),
    index('publications_deal_idx').on(t.dealId),
    index('publications_channel_idx').on(t.channelId, t.publishedAt),
  ],
)

export const messageTemplates = sqliteTable('message_templates', {
  /** Determinista: `${themeId ?? 'global'}:${format}`. */
  id: text('id').primaryKey(),
  /** null = plantilla global para el formato. */
  themeId: text('theme_id').references(() => themes.id, { onDelete: 'cascade' }),
  format: text('format').$type<MessageFormat>().notNull(),
  body: text('body').notNull(),
  updatedAt: timestamp('updated_at').notNull().default(now),
})

export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    kind: text('kind').$type<RunKind>().notNull(),
    trigger: text('trigger').$type<RunTrigger>().notNull(),
    themeId: text('theme_id').references(() => themes.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at').notNull(),
    finishedAt: timestamp('finished_at'),
    status: text('status').$type<RunStatus>().notNull(),
    stats: text('stats', { mode: 'json' }).$type<Record<string, number>>().notNull().default(sql`'{}'`),
    errors: jsonList('errors'),
  },
  (t) => [index('runs_started_idx').on(t.startedAt)],
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: timestamp('updated_at').notNull().default(now),
})
