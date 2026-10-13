# Arquitectura — fase 1

> Referencia técnica. Requisitos en [`SPEC.md`](../SPEC.md); normas de Amazon en [`creators-api.md`](creators-api.md).

## 1. Visión general

Una sola aplicación **Nuxt 4** desplegada como **Cloudflare Worker** (preset `cloudflare_module`):

```
                ┌──────────── Cloudflare Access (login, solo tu email) ────────────┐
 Móvil/PC ──────►  Worker (Nuxt 4 + Nitro)                                          │
                │   ├─ app/          Panel (Vue, Nuxt UI, mobile-first, español)   │
                │   ├─ server/api    API JSON del panel (valida el JWT de Access)   │
                │   └─ server/tasks  Tareas Nitro ← Cron Triggers (scheduled)       │
                └──────┬───────────────────────────────┬─────────────────────────────┘
                       │                               │
                 Cloudflare D1                   APIs externas
              (Drizzle ORM, migraciones   Telegram Bot API · (fase 2) Creators API,
               SQL versionadas)            Anthropic API, Keepa
```

- **Cron Triggers** (UTC), declarados en `wrangler.jsonc` y enlazados a tareas Nitro (`nitro.scheduledTasks`):

| Cron | Tarea | Qué hace |
|---|---|---|
| `0 5 * * *` | `scan:daily` | Recorre las temáticas activas, busca productos y crea candidatas |
| `*/10 * * * *` | `queue:tick` | Publica lo programado que ha vencido y caduca lo que tiene más de 24 h |

  Con `scan:daily` a las 05:00 UTC, las candidatas están listas a las 06:00/07:00 en Madrid. Las franjas de publicación se definen en **Europe/Madrid** y se convierten con `Intl`.
- **Escaneo manual**: el panel llama a `POST /api/themes/:id/scan`, que ejecuta el mismo servicio que el cron.

## 2. Capas del servidor

```
server/
├─ domain/         Lógica de negocio PURA (sin E/S): testeada con Vitest
│  ├─ deals.ts         evaluar oferta (filtros, descuento fiable, sospechosa, puntuación)
│  ├─ dedupe.ts        ¿se puede volver a proponer este ASIN?
│  ├─ publication.ts   máquina de estados de la cola
│  ├─ schedule.ts      franjas horarias, límite diario, siguiente hueco libre
│  ├─ affiliate.ts     construcción y validación de enlaces de afiliado
│  └─ messages/        motor de plantillas, formatos Telegram/WhatsApp, avisos legales, entradilla IA
├─ providers/      ProductProvider + implementaciones (manual, mock; creators-api en fase 2)
│  └─ history/       PriceHistoryProvider (null; Keepa en el futuro)
├─ channels/       ChannelAdapter + telegram (automático) y whatsapp (asistido)
├─ db/             esquema Drizzle, cliente D1, repositorios
├─ services/       orquestación con E/S: scan, publish, expire, runs (registro de ejecuciones)
├─ api/            endpoints REST del panel (validación con zod)
├─ tasks/          tareas Nitro (scan:daily, queue:tick)
└─ middleware/     autenticación Cloudflare Access
```

Regla: `domain/` no importa nada de `db/`, `providers/` ni `channels/`. Los servicios inyectan los datos.

## 3. Interfaces clave

```ts
// server/providers/types.ts
interface ProductProvider {
  readonly id: 'manual' | 'mock' | 'creators_api'
  readonly capabilities: { search: boolean; prices: boolean }
  /** Busca productos para una temática (escaneo). */
  search(query: ThemeSearchQuery): Promise<ProductSnapshot[]>
  /** Refresca ASIN concretos con el tracking ID de un canal (antes de publicar). */
  refresh(asins: string[], partnerTag: string): Promise<ProductSnapshot[]>
}

interface ProductSnapshot {
  asin: string
  source: ProviderId
  capturedAt: number          // epoch ms
  title: string
  brand: string | null
  detailPageUrl: string       // enlace con el tag ya incluido; NO se modifica
  imageUrl: string | null     // solo URL (no se descarga ni se almacena)
  offer: Offer | null         // null = sin precio publicable (ManualProvider)
}

interface Offer {
  priceCents: number
  currency: 'EUR'
  savingBasisCents: number | null
  savingBasisType: 'LIST_PRICE' | 'LOWEST_PRICE' | 'LOWEST_PRICE_STRIKETHROUGH' | 'WAS_PRICE' | null
  savingsPercent: number | null
  availability: string | null // IN_STOCK, IN_STOCK_SCARCE…
  condition: 'New' | 'Used' | 'Refurbished' | 'Unknown'
  isBuyBoxWinner: boolean
  dealType: 'LIGHTNING_DEAL' | 'SUBSCRIBE_AND_SAVE' | null
  dealEndsAt: number | null
  violatesMap: boolean
}

// server/providers/history/types.ts — Keepa en el futuro
interface PriceHistoryProvider {
  getStats(asin: string): Promise<{ min30Cents: number; median30Cents: number } | null>
}

// server/channels/types.ts
interface ChannelAdapter {
  readonly type: 'telegram' | 'whatsapp'
  readonly mode: 'automatic' | 'assisted'
  readonly format: MessageFormat     // 'telegram-html' | 'whatsapp'
  /** Solo los automáticos. */
  publish?(channel: Channel, message: RenderedMessage): Promise<{ externalId: string }>
  /** Valida la configuración del canal (p. ej. que el bot es admin). */
  verify?(channel: Channel): Promise<{ ok: boolean; detail?: string }>
}
```

- `MockProvider` genera respuestas con **la forma JSON real de OffersV2** y las pasa por el mismo *mapper* (`fromCreatorsItem`) que usará `CreatorsApiProvider`. Es determinista: semilla = temática + fecha.
- `ManualProvider` lee los productos dados de alta en el panel (tabla `manual_products`). Construye el enlace estándar `https://www.amazon.es/dp/<ASIN>?tag=<tracking>` y siempre devuelve `offer: null`.

## 4. Modelo de datos (D1)

Fechas en **epoch ms** (`INTEGER`), IDs `TEXT` (UUID) y listas en `TEXT` JSON validado con zod.

```
themes ─┬─< theme_channels >── channels
        ├─< manual_products
        ├─< deals ──< publications >── channels
        └─< message_templates (opcional por temática)
runs (registro de ejecuciones) · settings (clave/valor, sin secretos)
```

| Tabla | Campos principales |
|---|---|
| `themes` | `id`, `name`, `slug`, `description`, `active`, `search_index`, `keywords` (JSON), `browse_nodes` (JSON), `exclude_keywords` (JSON), `exclude_brands` (JSON), `min_discount_pct`, `min_price_cents`, `max_price_cents`, `min_rating` (1–4), `min_reviews` (informativo), `daily_limit`, `publish_windows` (JSON `[{days:[1..7], start:"09:00", end:"11:30"}]`), `dedupe_days`, `tone`, `provider` (`mock`/`manual`/`creators_api`), `created_at`, `updated_at` |
| `channels` | `id`, `type` (`telegram`/`whatsapp`), `name`, `identifier` (`@canal` o `-100…` / URL del canal de WhatsApp), `tracking_id`, `active`, `created_at`, `updated_at` |
| `theme_channels` | `theme_id`, `channel_id` (PK compuesta) |
| `manual_products` | `id`, `theme_id`, `asin`, `title`, `brand`, `note` (texto propio), `internal_price_cents` (**nota interna, nunca se publica**), `created_at` |
| `deals` | `id`, `theme_id`, `asin`, `source`, `detected_at`, `expires_at` (= detectada + 24 h, o el fin de la oferta flash si es antes), datos de la instantánea (`title`, `brand`, `image_url`, `price_cents`, `saving_basis_cents`, `saving_basis_type`, `savings_pct`, `deal_type`, `deal_ends_at`), evaluación (`effective_discount_pct`, `reliability`, `suspicious`, `reasons` JSON, `score`), `intro` (entradilla con IA), `purged_at` |
| `publications` | `id`, `deal_id`, `channel_id`, `status`, `text` (editable), `link`, `price_cents_shown`, `price_checked_at`, `needs_review`, `review_reason`, `scheduled_at`, `published_at`, `external_id`, `error`, `created_at`, `updated_at` |
| `message_templates` | `id`, `theme_id` (null = global), `format` (`telegram-html`/`whatsapp`), `body`, `updated_at` — único por (`theme_id`, `format`) |
| `runs` | `id`, `kind` (`scan`/`tick`), `trigger` (`cron`/`manual`), `theme_id`, `started_at`, `finished_at`, `status` (`running`/`ok`/`partial`/`error`), `stats` (JSON), `errors` (JSON) |
| `settings` | `key`, `value` (JSON) — p. ej. `default_tracking_id`, `timezone` |

**Cumplimiento (§14 de la spec):**
- Las tablas `deals` y `publications` guardan los datos de producto **solo mientras sean necesarios**.
- La tarea `queue:tick` **purga** (pone a `NULL` título, imagen y precios y fija `purged_at`) los `deals` de origen API (`mock`/`creators_api`) con más de 24 h que no estén publicados.
- De lo publicado queda el **texto del mensaje que enviamos** y el precio mostrado, que se necesita para la deduplicación ("salvo que el precio haya bajado más").
- No existe tabla de histórico de precios.

## 5. Flujos

**Escaneo** (`services/scan.ts`), por cada temática activa:
1. `provider.search(query)`, con un presupuesto máximo de llamadas por temática.
2. Por cada producto:
   - aplicar exclusiones y filtros;
   - descartar los no deduplicables;
   - `evaluateDeal()`.
3. Ordenar por puntuación y crear `deals` y una `publication` en estado `candidata` por cada canal activo de la temática, con el texto renderizado.
4. Registrar la ejecución en `runs` con estadísticas y errores. Un fallo en una temática no aborta las demás: la ejecución queda como `partial`.

**Estados de una publicación** (`domain/publication.ts`):

```
candidata ──aprobar──► aprobada ──programar──► programada ──(tick)──► publicada
    │                     │  └──publicar ya──────────────────────────►┘
    └──descartar──► descartada ◄──descartar── (aprobada/programada)
candidata/aprobada/programada ──(expires_at)──► caducada
```

- **Antes de publicar** (manual o por tick): `provider.refresh([asin], channel.tracking_id)`.
  - Si el precio difiere del aprobado, se marca `needs_review` y **no se publica**.
  - Sin precio (manual), no hay nada que recomprobar.
- **Programar**: en la hora indicada o en el **siguiente hueco libre** dentro de las franjas de la temática, respetando el límite diario y una separación mínima. No se puede programar más allá de `expires_at`.
- **Telegram**: `sendMessage` con `parse_mode: HTML`, `link_preview_options` (URL del producto, imagen grande, encima del texto) y un botón *Ver en Amazon*.
- **WhatsApp asistido**: la vista de la publicación ofrece *Compartir* (`navigator.share({ text })`), *Copiar texto* y *Marcar como publicada*. Se compartirá solo texto, y WhatsApp generará la vista previa.

## 6. Mensajes

- Motor mínimo de plantillas: `{{variable}}` y bloques `{{#precio}}…{{/precio}}` / `{{^precio}}…{{/precio}}`. **El escapado depende del formato**: HTML de Telegram (`&`, `<`, `>`) o texto de WhatsApp.
- Los **bloques legales no forman parte de la plantilla editable**: el renderizador los añade siempre, así que no se pueden borrar por error.
  - Con precio: `Precio: 19,99 € (consultado el 12/10/2026 a las 14:11, hora peninsular)` + el descargo literal de la Licencia.
  - Sin precio: `Consulta el precio actual en Amazon`.
  - Siempre: el aviso de afiliado literal.
- El título se **trunca** (nunca se reescribe) a una longitud configurable. Se valida la longitud total frente a los límites de cada plataforma.
- **Entradilla con IA** (`domain/messages/intro.ts` + `services/copywriter.ts`, SPEC §14.6): variable `{{entradilla}}`; si la plantilla no la incluye, va al principio. Se genera una por oferta al escanear (máx. 20 por ejecución, 4 en paralelo), se valida y se guarda en `deals.intro`. Los fallos de la API se agrupan en el registro de la ejecución y el mensaje sale solo con la plantilla.
- **Texto propio con IA** (`domain/messages/description.ts` + `writeDescription` en `services/copywriter.ts`, SPEC §14.9): `POST /api/themes/:id/describe` con `{title, brand, notes}` devuelve `{text}` sin guardar nada. El panel lo pone en «Texto propio» (con «Deshacer») para revisarlo antes del alta.

## 7. Seguridad

- **Cloudflare Access** delante de todo el dominio. El middleware de Nitro valida además `Cf-Access-Jwt-Assertion` con `jose` contra `https://<equipo>.cloudflareaccess.com/cdn-cgi/access/certs` (`aud` configurado) y comprueba el email autorizado. Si falla, responde 401.
- En local: `NUXT_AUTH_DISABLED=true`, que solo se respeta en `import.meta.dev`.
- **Secretos** (`wrangler secret put`): `TELEGRAM_BOT_TOKEN`, `ANTHROPIC_API_KEY` (opcional) y, en la fase 2, `CREATORS_API_CREDENTIAL_ID`/`_SECRET`. El panel solo muestra si están configurados.
- Las tareas del cron no exponen endpoints HTTP.

## 8. Errores y reintentos

- `server/utils/http.ts`: `fetchWithRetry` con backoff exponencial y *jitter*, que respeta `Retry-After` / `retry_after` (Telegram 429) y solo reintenta errores 429 y 5xx. Los errores 4xx se registran sin reintentar.
- Los errores por publicación se guardan en `publications.error` y los de las ejecuciones en `runs.errors`. Ambos se ven en el panel.

## 9. Tests

Vitest sobre `server/domain/**`: evaluación de ofertas, deduplicación, plantillas y escapado, transiciones de estado, franjas y huecos, y enlaces de afiliado. También sobre el *mapper* de Creators API usando las fixtures del mock.

## 10. Bot buzón (SPEC §14.8)

- `server/routes/webhooks/telegram-intake.post.ts`: webhook fuera de `/api`, protegido con `X-Telegram-Bot-Api-Secret-Token`. Responde enseguida y procesa con `waitUntil`.
- `server/domain/intake.ts`: lógica pura (URLs, ASIN, título, precio, respuestas, tarjetas y botones), con tests.
- `server/services/intake.ts`:
  - borradores en `intake_drafts`;
  - al elegir temática, alta manual y `scanTheme` (con entradilla de IA);
  - los botones usan las acciones de la cola (`publish`, `applyAction`).
- Los enlaces cortos se resuelven con `redirect: 'manual'` y `User-Agent: Agent/OfertasBuzon…`. Nunca se piden páginas de amazon.es.

