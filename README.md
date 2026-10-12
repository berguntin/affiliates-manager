# Ofertas · panel de canales de afiliados

Sistema que detecta ofertas de **Amazon.es** por temáticas configurables, prepara mensajes con enlace de afiliado (un tracking ID por canal) y gestiona su publicación en **Telegram** (automática) y **WhatsApp** (asistida). El panel está en español y pensado para usarse desde el móvil.

- Requisitos y decisiones: [`SPEC.md`](SPEC.md)
- Arquitectura y modelo de datos: [`docs/arquitectura.md`](docs/arquitectura.md)
- Creators API y normas de Afiliados de amazon.es: [`docs/creators-api.md`](docs/creators-api.md)

> **Estado: fase 1 (MVP).**
> - Las fuentes de productos son el **alta manual** (se publica **sin precio**, SPEC §14.1) y un **proveedor simulado** para desarrollo.
> - Fase 2: la **redacción con IA** (entradilla con la Anthropic API, opcional) ya está; la integración con la Creators API, pendiente.

## Stack

- Nuxt 4 + Nitro (preset `cloudflare_module`) en un único Cloudflare Worker. El panel es una SPA con Nuxt UI.
- Cloudflare D1 con Drizzle ORM. Las migraciones SQL están en `server/db/migrations`.
- Cron Triggers enlazados a tareas Nitro:

| Cron (UTC) | Tarea | Qué hace |
|---|---|---|
| `0 5 * * *` | `scan:daily` | Escanea todas las temáticas activas |
| `*/10 * * * *` | `queue:tick` | Publica lo programado, caduca a las 24 h y purga datos de producto |

- Autenticación con **Cloudflare Access**, más validación del JWT en la API.
- TypeScript estricto y Vitest.

## Puesta en marcha local

Requisitos: Node 22 y pnpm 10 (`corepack enable`).

```bash
pnpm install
cp .dev.vars.example .dev.vars        # AUTH_DISABLED=true para desarrollo
pnpm db:migrate:local                 # crea la D1 local en .wrangler/
pnpm dev                              # http://localhost:3000
```

`nuxt dev` emula los bindings de Cloudflare (D1, variables de `.dev.vars`) mediante wrangler.

Primeros pasos en el panel:
1. **Canales → Nuevo**: crea un canal de Telegram o WhatsApp con su tracking ID.
2. **Temáticas → Nueva**: elige «Simulado (desarrollo)» o «Alta manual» y asígnale canales.
3. **Resumen → Escanear ahora**, o, en una temática manual, **Añadir y crear candidata**.
4. **Cola**: revisa, edita, aprueba, programa o publica.

### Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm test` | Tests unitarios (lógica de negocio, mappers, adaptador de Telegram) |
| `pnpm typecheck` | Comprobación de tipos (app y servidor) |
| `pnpm build` | Build para Cloudflare Workers en `.output/` |
| `pnpm db:generate` | Genera una migración a partir de `server/db/schema.ts` |
| `pnpm db:migrate:local` / `db:migrate:remote` | Aplica las migraciones en D1 local o remota |
| `pnpm run deploy` | Build y `wrangler deploy` (`pnpm deploy` a secas es otro comando de pnpm) |

### Probar el cron en local

```bash
pnpm build
pnpm exec wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=0+5+*+*+*"       # escaneo diario
curl "http://localhost:8787/__scheduled?cron=*/10+*+*+*+*"    # procesar cola
```

Las ejecuciones aparecen en **Más → Ejecuciones**, que también permite lanzarlas a mano. Con `wrangler dev` la API exige Cloudflare Access, igual que en producción: usa `pnpm dev` para el panel.

## Variables de entorno

| Variable | Tipo | Descripción |
|---|---|---|
| `DB` | binding D1 | Base de datos (en `wrangler.jsonc`) |
| `TIMEZONE` | var | Zona horaria de las franjas y fechas. Por defecto `Europe/Madrid` |
| `AUTH_TEAM_DOMAIN` | secreto | Dominio del equipo de Cloudflare Zero Trust, p. ej. `mi-equipo.cloudflareaccess.com` |
| `AUTH_AUDIENCE` | secreto | *Application Audience (AUD) Tag* de la aplicación de Access |
| `AUTH_ALLOWED_EMAILS` | secreto | Emails autorizados, separados por comas |
| `TELEGRAM_BOT_TOKEN` | secreto | Token del bot de Telegram |
| `ANTHROPIC_API_KEY` | secreto | Opcional. Activa la entradilla redactada por IA (SPEC §14.6); sin ella, solo plantilla |
| `AUTH_DISABLED` | solo local | `true` desactiva la autenticación. **Solo se respeta en `nuxt dev`** |

En local van en `.dev.vars` (ignorado por git). En producción se configuran con `wrangler secret put NOMBRE`. **Nunca se guardan secretos en el repositorio.**

## Despliegue en Cloudflare

1. **Base de datos**
   ```bash
   pnpm exec wrangler login
   pnpm exec wrangler d1 create affiliates-manager
   ```
   Copia el `database_id` en `wrangler.jsonc` y aplica las migraciones:
   ```bash
   pnpm db:migrate:remote
   ```
2. **Despliegue inicial** (sin secretos de Access, la API responde 500 «Autenticación no configurada»):
   ```bash
   pnpm run deploy
   ```
3. **Cloudflare Access.** Dashboard → Workers & Pages → `affiliates-manager` → Settings → Domains & Routes → en `workers.dev`, **Enable Cloudflare Access**.
   - El aviso que aparece muestra el **AUD** (`POLICY_AUD`) y el **dominio del equipo** (`TEAM_DOMAIN`): guárdalos.
   - En **Manage Cloudflare Access**, deja la política de la aplicación solo con tu email.
   - Las Preview URLs están desactivadas (`preview_urls: false`) porque no quedarían protegidas.
4. **Secretos**
   ```bash
   pnpm exec wrangler secret put AUTH_TEAM_DOMAIN
   pnpm exec wrangler secret put AUTH_AUDIENCE
   pnpm exec wrangler secret put AUTH_ALLOWED_EMAILS
   pnpm exec wrangler secret put TELEGRAM_BOT_TOKEN
   pnpm exec wrangler secret put ANTHROPIC_API_KEY   # opcional
   ```
   No hace falta volver a desplegar: los secretos se aplican al momento. Los Cron Triggers se registran a partir de `triggers.crons` en `wrangler.jsonc`.
5. **Comprobación**: abre la URL en una ventana privada. Debe pedirte el login de Access y, después, cargar el panel; en el panel, **Ajustes** debe mostrar «Cloudflare Access». Sin sesión, `curl https://…workers.dev/api/me` debe devolver la redirección al login de Access, no datos.

### Telegram

1. Crea el bot con [@BotFather](https://t.me/BotFather) y guarda el token como secreto.
2. Añade el bot como **administrador** del canal, con permiso para publicar.
3. En el panel, crea el canal con `@nombre_del_canal` (o el id `-100…`) y pulsa **Verificar bot**.

### Bot buzón (enviar ofertas desde el móvil)

Un **bot aparte** del que publica. Compartís un producto desde la app de Amazon (**Compartir → Telegram → el bot**) y:

1. El bot saca el ASIN del enlace. Los enlaces cortos `amzn.eu` se resuelven siguiendo solo la redirección; nunca se abre la página del producto.
2. Responde con una tarjeta. **Respondiendo a ella** podéis añadir:
   - el precio (`19,99`), que se publica con la fecha y hora del alta (SPEC §14.7, riesgo aceptado);
   - el título (`t: …`), si no venía en el texto compartido;
   - un comentario (cualquier otro texto).
3. Elegís la temática (solo las de fuente «Alta manual»). Se crea la candidata en cada canal con la entradilla de IA.
4. Desde la misma tarjeta:
   - Telegram: 🚀 publicar, ⏰ próximo ciclo o 🗑️ descartar.
   - WhatsApp: 📋 recibir el texto, ✅ marcar como hecho o 🗑️ descartar.

Configuración:
1. Crea el bot con [@BotFather](https://t.me/BotFather) (`/newbot`) y, en `/setjoingroups`, desactiva que lo añadan a grupos.
2. Secretos:
   ```bash
   pnpm exec wrangler secret put INTAKE_BOT_TOKEN          # token del bot buzón
   pnpm exec wrangler secret put INTAKE_WEBHOOK_SECRET     # cadena aleatoria, p. ej. `openssl rand -hex 32`
   pnpm exec wrangler secret put INTAKE_ALLOWED_USER_IDS   # vuestros IDs de Telegram: 111111111,222222222
   ```
   Para saber vuestro ID, escribid al bot: si no estáis autorizados, os lo dice.
3. **Cloudflare Access debe dejar pasar al webhook**, porque Telegram no puede iniciar sesión.
   - En Zero Trust → Access → Applications, crea una aplicación *Self-hosted* con el mismo dominio y la ruta `webhooks/telegram-intake`.
   - Ponle una política con acción **Bypass** e *Include: Everyone*.
   - La ruta sigue protegida por el token secreto que Telegram envía en cada petición.
4. En el panel, **Ajustes → Bot buzón → Conectar webhook**.
5. Para que tu pareja use también el panel, añade su email a la política de Access y a `AUTH_ALLOWED_EMAILS`.

### WhatsApp (publicación asistida)

La API oficial no permite publicar en Canales de WhatsApp, y las librerías no oficiales arriesgan el baneo del número, así que no se usan. En la cola, **Compartir en WhatsApp**:
1. recomprueba el precio;
2. abre el menú de compartir del móvil (o permite copiar el texto);
3. cuando hayas publicado, márcalo con **Ya lo he publicado**.

WhatsApp genera la vista previa a partir del enlace.

### Amazon Afiliados

- Crea un **tracking ID distinto por canal** en Associates Central y da de alta cada canal como «Sitio».
- Los mensajes incluyen siempre el aviso de afiliado. Si llevan precio, incluyen también la fecha y hora de consulta y el descargo exigido por la Licencia (ver `docs/creators-api.md` §7).

## Estructura

```
app/              Panel (páginas, componentes, composables)
shared/           Tipos y validaciones (zod) comunes a panel y API
server/
  domain/         Lógica de negocio pura (ofertas, deduplicación, mensajes, estados, franjas)
  providers/      ProductProvider: manual, simulado, Creators API (fase 2) e histórico (Keepa, pendiente)
  channels/       ChannelAdapter: Telegram (automático) y WhatsApp (asistido)
  services/       Orquestación con E/S: escaneo, cola, plantillas, ejecuciones
  api/            Endpoints REST del panel
  tasks/          Tareas Nitro del cron
  db/             Esquema Drizzle y migraciones
tests/            Vitest
```
