# SPEC — Plataforma de canales de ofertas de Amazon (afiliados)

> Documento de referencia del proyecto. Es la base sobre la que se trabaja: cualquier cambio de alcance se refleja aquí primero.
> Estado: **borrador pendiente de aprobación**. No se implementa nada hasta aprobar la arquitectura, el modelo de datos y el plan por fases (§12).

---

## 1. Contexto y objetivo

Sistema que cada día:

1. Detecta ofertas de **Amazon.es** sobre **temáticas configurables** (la primera, productos de bebé; el sistema es genérico).
2. Prepara mensajes con el **enlace de afiliado**.
3. Permite gestionar su publicación en canales de **Telegram** y **WhatsApp**, con una arquitectura abierta a otros canales en el futuro (p. ej. Instagram).

Usuario único: el propietario (frontend engineer: Vue, Nuxt, TypeScript; ya usa Cloudflare Workers).
**Toda la interfaz en español.**

---

## 2. Reglas previas a escribir código

1. Revisar la documentación oficial de la **Amazon Creators API** (sustituta de la PA-API 5.0, ya deprecada).
   - **No inventar endpoints ni campos.**
   - Si la documentación no es accesible, decirlo y diseñar la integración detrás de una interfaz con un proveedor simulado.
2. Proponer **arquitectura, modelo de datos y plan por fases**, y **esperar aprobación** antes de implementar.
3. Señalar los requisitos mal planteados o arriesgados (ver §13).

---

## 3. Stack

| Pieza | Elección | Notas |
|---|---|---|
| Framework | **Nuxt 3** + Nitro | Preset de Cloudflare (Workers). |
| Base de datos | **Cloudflare D1** | Migraciones versionadas en el repo. |
| Tareas programadas | **Cron Triggers** | Escaneo diario (y ver §13 para publicaciones programadas). |
| Ficheros | **R2** | Solo si hace falta guardar imágenes (ver §13). |
| Lenguaje | **TypeScript estricto** | En todo el proyecto. |
| Secretos | `wrangler secret` | Nunca en el repositorio. |
| Autenticación del panel | **Cloudflare Access** (propuesta) o alternativa sencilla y segura | Usuario único. |

Se pueden proponer alternativas justificadas.

---

## 4. Temáticas configurables (back office)

Cada temática (p. ej. "Bebé", "Gaming", "Hogar") se crea y edita desde el panel con:

- **Identidad:** nombre, descripción, estado (activa/inactiva).
- **Criterios de búsqueda:** palabras clave, nodos de categoría (*browse nodes*), exclusiones (palabras o marcas a ignorar).
- **Filtros de calidad:** descuento mínimo real, rango de precio, valoración mínima, número mínimo de reseñas.
- **Ritmo de publicación:** límite de publicaciones al día y franjas horarias.
- **Canales destino:** relación N:M con la entidad Canal.
- **Mensaje:** tono y plantilla.

**Requisito clave:** el escaneo diario recorre todas las temáticas activas **sin código específico por temática**.

---

## 5. Fuentes de productos — `ProductProvider`

Interfaz abstracta con al menos tres implementaciones:

| Implementación | Propósito | Fase |
|---|---|---|
| `CreatorsApiProvider` | Integración real con la Amazon Creators API. | 2 |
| `ManualProvider` | Alta manual desde el panel (URL o ASIN + datos básicos). Debe ser **cómoda**: es la vía principal al inicio, porque el acceso a la API está condicionado a haber generado ventas. | 1 |
| `MockProvider` | Datos de prueba para desarrollo y tests. | 1 |

🚫 **Prohibido el scraping de Amazon** (viola las condiciones del programa de afiliados).

---

## 6. Detección de ofertas reales

- **Histórico propio de precios por ASIN:** una instantánea en cada escaneo.
- **Descuento real:** comparar con el **mínimo** y la **mediana de los últimos 30 días**, no solo con el precio tachado de Amazon.
- **Ofertas sospechosas:** marcar las que tengan descuento inflado.
- **Keepa:** dejar preparada la integración opcional (interfaz), **sin implementar**.
- **Deduplicación:** no volver a proponer el mismo ASIN en **N días** (configurable), salvo que el precio haya bajado más.

---

## 7. Generación de mensajes

- **Plantillas por canal** (el formato cambia):
  - Telegram: HTML o MarkdownV2.
  - WhatsApp: formato propio (`*negrita*`, `_cursiva_`).
- **Redacción con LLM (Anthropic API)** opcional, siguiendo el tono de la temática, con **fallback a plantilla** si la llamada falla. *(Fase 2.)*
- **Todo mensaje incluye obligatoriamente:**
  - Precio y **fecha y hora de consulta**.
  - Advertencia de que **el precio puede cambiar**.
  - El aviso literal: *"En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables."*
- **Enlace de afiliado:** **tracking ID distinto por canal**, para medir en el panel de Afiliados qué canal convierte.
  - 🚫 Sin redirecciones propias que oculten el enlace de Amazon.

---

## 8. Cola de publicaciones

**Estados:** `candidata → aprobada → programada → publicada`, más `descartada` y `caducada`.

- Desde el panel: revisar candidatas, **editar el texto**, aprobar, descartar, programar o publicar al momento.
- **Recomprobación de precio** justo antes de publicar. Si ha cambiado, la publicación se marca y **requiere revisión**.
- **Caducidad:** las candidatas no publicadas caducan a las **24 horas** (Amazon exige precios actualizados).

---

## 9. Canales — `ChannelAdapter`

**Entidad Canal:** tipo, nombre, identificador, tracking ID, temáticas asociadas, estado.

| Adaptador | Modo | Detalle |
|---|---|---|
| **Telegram** | Automático | Bot API oficial en canales: `sendPhoto` con texto (caption) y botón al producto (inline keyboard). |
| **WhatsApp** | **Asistido** | La API oficial no permite publicar en Canales. El panel prepara texto + imagen. En **móvil**: botón con **Web Share API (con archivo)** para compartir a WhatsApp. En **escritorio**: copiar texto y descargar imagen. Después se marca manualmente como publicada. |
| *Futuros* | — | p. ej. Instagram vía Graph API. El diseño debe permitir añadir adaptadores sin tocar el núcleo. |

🚫 **Nada de librerías no oficiales de WhatsApp** (Baileys, whatsapp-web.js, etc.): riesgo de baneo del número.

---

## 10. Panel (back office)

- **Responsive, mobile-first:** se aprobará y publicará desde el teléfono.
- **Secciones:**
  - Resumen del día
  - Cola de publicaciones
  - Temáticas
  - Canales
  - Histórico de publicaciones
  - Ajustes (tags de afiliado, plantillas, claves)
- **Escaneo manual** de una temática con un botón.
- **Registro de ejecuciones del cron** con errores visibles.

---

## 11. Requisitos no funcionales

- **Tests unitarios** de la lógica de negocio: detección de ofertas, deduplicación, generación de mensajes, transiciones de estado.
- **Errores y reintentos** en llamadas externas, respetando los límites de peticiones de la API.
- **README** con puesta en marcha local, variables de entorno y despliegue.
- **Commits pequeños y descriptivos** por funcionalidad.

---

## 12. Fases

### Fase 1 — MVP

1. Modelo de datos, migraciones y autenticación del panel.
2. CRUD de temáticas y canales.
3. `ManualProvider` y `MockProvider`, histórico de precios y detección de ofertas.
4. Generación de mensajes con plantillas.
5. Cola de publicaciones con Telegram automático y WhatsApp asistido.
6. Cron diario funcionando contra `MockProvider`.

### Fase 2

- Integración real con la Creators API (`CreatorsApiProvider`), empezando por un *spike* con credenciales reales (ver [`docs/creators-api.md`](docs/creators-api.md) §8).
- Redacción con LLM (Anthropic API) con fallback a plantilla.
- Estadísticas.

### Fuera de alcance por ahora

- Integración real con Keepa (solo interfaz preparada).
- Otros canales (Instagram, etc.).

---

## 13. Puntos a revisar / riesgos detectados

Observaciones iniciales sobre los requisitos. Cada una debe resolverse (o aceptarse explícitamente) antes o durante el diseño. Las marcadas con *"verificar"* dependen de documentación oficial que hay que contrastar; no se dan por ciertas.

1. **Precios introducidos a mano vs. condiciones de Amazon** *(verificar en el Acuerdo Operativo de Afiliados)*. Las condiciones del programa restringen mostrar precios que no procedan de la API oficial o que no estén actualizados. Con `ManualProvider` el precio lo teclea el usuario: hay que confirmar si es admisible y, en todo caso, tratarlo como precio con marca temporal estricta y caducidad corta.
2. **Recomprobación de precio sin API.** En fase 1 no hay API, así que la "recomprobación justo antes de publicar" no puede ser automática: debe convertirse en una **confirmación manual** del precio en el panel (o bloquear la publicación si la instantánea tiene más de X horas).
3. **Histórico insuficiente al arrancar.** La mínima/mediana de 30 días no existe los primeros días, y con altas manuales el histórico será muy escaso. Hace falta un estado explícito *"sin histórico suficiente"* y una regla de qué hacer en ese caso (no puntuar, usar solo el precio tachado con aviso, o esperar a Keepa).
4. **Imágenes y R2** *(verificar)*. Las licencias de contenido de Amazon suelen limitar el almacenamiento/caché de imágenes de producto. Preferible usar la URL que devuelve la API y no persistir copias; para la Web Share API con archivo bastaría con descargar la imagen al vuelo en el cliente (comprobar CORS) o vía un proxy efímero sin almacenamiento.
5. **Publicaciones programadas con un cron diario.** Un cron diario no basta para publicar en franjas horarias. Se necesita un cron frecuente (p. ej. cada 5–15 min) que despache lo programado, o Cloudflare Queues / alarmas de Durable Objects. Todas las franjas se definen en **Europe/Madrid**; los Cron Triggers van en UTC (cuidado con el cambio de hora).
6. **Cron Triggers con Nuxt/Nitro en Cloudflare** *(verificar)*. El soporte de `scheduled` en el preset de Cloudflare de Nitro (tareas programadas) hay que comprobarlo; alternativa: un Worker separado con el cron que comparta D1 con el de Nuxt.
7. **Límite de caption en Telegram.** `sendPhoto` limita el texto a 1024 caracteres; el aviso legal + advertencia de precio ocupan una parte notable. Las plantillas deben validar longitud (y prever fallback a `sendMessage` con vista previa si se excede).
8. **WhatsApp y Web Share API** *(verificar)*. Compartir con archivo funciona en Chrome Android y Safari iOS, pero no está garantizado que la hoja de compartir de WhatsApp permita elegir un **Canal** como destino (puede que solo chats). Si no, el flujo móvil sería "copiar texto + guardar imagen + pegar en el canal". Además, al compartir imagen + texto algunas apps descartan el texto.
9. **Tracking ID por canal.** Los tracking IDs adicionales se crean en el panel de Afiliados (hay un límite por cuenta) y deben existir antes de usarse; el panel debería avisar si un canal no tiene tracking ID asignado.
10. **Acceso a la Creators API** *(confirmado en la doc oficial; ver [`docs/creators-api.md`](docs/creators-api.md))*. Requiere **10 ventas cualificadas en los últimos 30 días**, y la cuota (inicialmente 1 TPS / 8.640 TPD) depende de los ingresos generados vía API, así que puede bajar. Si se pierde la elegibilidad, la API responde `AssociateNotEligible`. El sistema debe degradar con elegancia a `ManualProvider` sin romperse.
11. **Campos de precio, ahorro y reseñas** *(ver [`docs/creators-api.md`](docs/creators-api.md) §4–§5)*. La API expone `offersV2.listings.price.savings` y `savingBasis.savingBasisType` (`LIST_PRICE`, `WAS_PRICE`, `LOWEST_PRICE`…), lo que ayuda a detectar descuentos inflados. También expone `violatesMAP` (no mostrar el precio si es `true`) y `customerReviews.count`/`starRating`. No hay filtro de nº mínimo de reseñas ni de exclusiones en la API: se aplican en local. *Verificar con datos reales* que `customerReviews` llega relleno en amazon.es.
12. **Autenticación.** Recomendado **Cloudflare Access** (gratis para un usuario, sin gestionar contraseñas, compatible con móvil). Validar el JWT de Access también en el Worker para no depender solo de la configuración del dominio, y proteger por separado los endpoints de cron/webhooks.
