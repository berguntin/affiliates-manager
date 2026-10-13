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
  ManualBasisType,
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
  /**
   * Opcional: la línea «Enlace de afiliado…» de cada mensaje enlaza aquí (p. ej. el
   * mensaje fijado del canal con los textos completos).
   */
  legalUrl: text('legal_url'),
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
    /**
     * Precio introducido a mano. Se publica con la fecha y hora del alta (SPEC §14.7,
     * modo de validación del MVP). La columna conserva su nombre original.
     */
    priceCents: integer('internal_price_cents'),
    /** Precio de referencia visto en Amazon (tachado o PVP recomendado) para mostrar el descuento. */
    basisPriceCents: integer('basis_price_cents'),
    basisType: text('basis_type').$type<ManualBasisType>(),
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
    /** Entradilla redactada por IA (texto propio, validado). null = solo plantilla. */
    intro: text('intro'),
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

/** Borradores del bot buzón (SPEC §14.8): lo compartido antes de elegir temática. */
export const intakeDrafts = sqliteTable(
  'intake_drafts',
  {
    /** Id corto: viaja en los botones de Telegram (callback_data ≤ 64 bytes). */
    id: text('id').primaryKey(),
    chatId: text('chat_id').notNull(),
    userId: text('user_id').notNull(),
    /** Mensaje del bot con la tarjeta; las respuestas a él editan el borrador. */
    cardMessageId: integer('card_message_id'),
    asin: text('asin').notNull(),
    title: text('title'),
    note: text('note').notNull().default(''),
    priceCents: integer('price_cents'),
    themeId: text('theme_id').references(() => themes.id, { onDelete: 'set null' }),
    publicationIds: jsonList('publication_ids'),
    queuedAt: timestamp('queued_at'),
    cancelledAt: timestamp('cancelled_at'),
    createdAt: timestamp('created_at').notNull().default(now),
  },
  (t) => [index('intake_drafts_card_idx').on(t.chatId, t.cardMessageId)],
)
