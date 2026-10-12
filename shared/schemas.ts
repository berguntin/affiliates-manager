import { z } from 'zod'
import { CHANNEL_TYPES, PROVIDER_IDS } from './types'

/** Validaciones compartidas por la API y los formularios del panel. */

const trimmedList = z
  .array(z.string().trim().min(1).max(100))
  .max(50)
  .transform((list) => [...new Set(list)])

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato HH:MM')

export const publishWindowSchema = z
  .object({
    days: z.array(z.number().int().min(1).max(7)).min(1, 'Elige al menos un día'),
    start: hhmm,
    end: hhmm,
  })
  .refine((w) => w.start < w.end, { message: 'La hora de fin debe ser posterior a la de inicio' })

const optionalCents = z.number().int().min(0).nullable().default(null)

export const themeInputSchema = z
  .object({
    name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
    description: z.string().trim().max(500).default(''),
    active: z.boolean().default(true),
    provider: z.enum(PROVIDER_IDS).default('mock'),
    searchIndex: z.string().trim().min(1).max(40).default('All'),
    keywords: trimmedList.default([]),
    browseNodes: z
      .array(z.string().regex(/^\d{1,19}$/, 'Los nodos son números'))
      .max(20)
      .default([]),
    excludeKeywords: trimmedList.default([]),
    excludeBrands: trimmedList.default([]),
    minDiscountPct: z.number().int().min(0).max(95).default(20),
    minPriceCents: optionalCents,
    maxPriceCents: optionalCents,
    minRating: z.number().int().min(1).max(4).nullable().default(null),
    minReviews: z.number().int().min(0).nullable().default(null),
    dailyLimit: z.number().int().min(1).max(50).default(5),
    publishWindows: z.array(publishWindowSchema).max(10).default([]),
    dedupeDays: z.number().int().min(0).max(365).default(14),
    tone: z.string().trim().max(300).default(''),
    channelIds: z.array(z.string().min(1)).max(50).default([]),
  })
  .refine(
    (t) => t.minPriceCents == null || t.maxPriceCents == null || t.minPriceCents <= t.maxPriceCents,
    { message: 'El precio mínimo no puede superar al máximo', path: ['maxPriceCents'] },
  )
  .refine((t) => t.provider !== 'creators_api' || t.keywords.length + t.browseNodes.length > 0, {
    message: 'Indica palabras clave o nodos de categoría',
    path: ['keywords'],
  })

export type ThemeInput = z.input<typeof themeInputSchema>
export type ThemeData = z.output<typeof themeInputSchema>

/** Tracking IDs de Afiliados: letras, números y guiones (en amazon.es suelen acabar en -21). */
export const trackingIdSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}[a-zA-Z0-9]$/, 'Tracking ID no válido')

export const channelInputSchema = z
  .object({
    type: z.enum(CHANNEL_TYPES),
    name: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
    identifier: z.string().trim().min(1, 'Obligatorio').max(200),
    trackingId: trackingIdSchema,
    active: z.boolean().default(true),
    themeIds: z.array(z.string().min(1)).max(50).default([]),
  })
  .refine((c) => c.type !== 'telegram' || /^(@[A-Za-z0-9_]{5,32}|-100\d{5,})$/.test(c.identifier), {
    message: 'En Telegram usa @nombre_del_canal o el id numérico (-100…)',
    path: ['identifier'],
  })

export type ChannelInput = z.input<typeof channelInputSchema>
export type ChannelData = z.output<typeof channelInputSchema>

export const ASIN_RE = /^[A-Z0-9]{10}$/

export const manualProductInputSchema = z.object({
  themeId: z.string().min(1),
  /** ASIN o URL de amazon.es de la que se extrae el ASIN. */
  asinOrUrl: z.string().trim().min(10).max(2000),
  title: z.string().trim().min(3).max(300),
  brand: z.string().trim().max(100).nullable().default(null),
  note: z.string().trim().max(500).default(''),
  /** Precio visto ahora en Amazon; se publica con la fecha y hora del alta. */
  priceCents: z.number().int().min(1).nullable().default(null),
})

export type ManualProductInput = z.input<typeof manualProductInputSchema>
