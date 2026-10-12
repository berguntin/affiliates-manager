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
| Ficheros | **R2** | ⚠️ No para imágenes de producto (prohibido almacenarlas, §13.A.3). |
| Lenguaje | **TypeScript estricto** | En todo el proyecto. |
| Secretos | `wrangler secret` | Nunca en el repositorio. |
| Autenticación del panel | **Cloudflare Access** (propuesta) o alternativa sencilla y segura | Usuario único. |

Se pueden proponer alternativas justificadas.

---

## 4. Temáticas configurables (back office)

Cada temática (p. ej. "Bebé", "Gaming", "Hogar") se crea y edita desde el panel con:

- **Identidad:** nombre, descripción, estado (activa/inactiva).
- **Criterios de búsqueda:** palabras clave, nodos de categoría (*browse nodes*), exclusiones (palabras o marcas a ignorar).
- **Filtros de calidad** ⚠️ §13.A.5: descuento mínimo real, rango de precio, valoración mínima, número mínimo de reseñas.
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
| `ManualProvider` ⚠️ §13.A.1 | Alta manual desde el panel (URL o ASIN + datos básicos). Debe ser **cómoda**: es la vía principal al inicio, porque el acceso a la API está condicionado a haber generado ventas. | 1 |
| `MockProvider` | Datos de prueba para desarrollo y tests. | 1 |

🚫 **Prohibido el scraping de Amazon** (viola las condiciones del programa de afiliados).

---

## 6. Detección de ofertas reales

> ⚠️ El histórico propio choca con la Licencia de la API: ver §13.A.2.

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
- **Todo mensaje incluye obligatoriamente** ⚠️ (§13.A.1; ver `docs/creators-api.md` §7.5):
  - Precio y **fecha y hora de consulta**.
  - Advertencia de que **el precio puede cambiar**. Según la Licencia, el texto exigido es: *"Los precios y disponibilidad del Producto son precisos en la fecha y hora indicados y están sujetos a cambios. Se aplicará a la compra del producto el precio e información de disponibilidad que aparezca en Amazon.es en el momento de la compra."* (puede ir enlazado).
  - El aviso literal: *"En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables."*
- **Enlace de afiliado** ⚠️ §13.A.4: **tracking ID distinto por canal**, para medir en el panel de Afiliados qué canal convierte.
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
| **Telegram** ⚠️ §13.A.3 | Automático | Bot API oficial en canales: `sendPhoto` con texto (caption) y botón al producto (inline keyboard). |
| **WhatsApp** ⚠️ §13.A.3 | **Asistido** | La API oficial no permite publicar en Canales. El panel prepara texto + imagen. En **móvil**: botón con **Web Share API (con archivo)** para compartir a WhatsApp. En **escritorio**: copiar texto y descargar imagen. Después se marca manualmente como publicada. |
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

Revisado con la documentación oficial de la Creators API y las **Políticas y el Acuerdo de Afiliados de amazon.es** (detalle y citas en [`docs/creators-api.md`](docs/creators-api.md) §7). Las secciones de la spec afectadas llevan la marca ⚠️.

### 13.A Conflictos con las normas de Amazon (requieren tu decisión)

1. **Precio introducido a mano** (afecta a §5 `ManualProvider` y §7). Las Políticas solo permiten mostrar precio y disponibilidad si vienen de la Creators API o de un enlace que los muestre facilitado por Amazon. **Un precio tecleado no se puede publicar.**
   - *Propuesta:* mientras no haya API, `ManualProvider` publica **sin precio** ("Mira el precio actual en Amazon"), solo con título, ASIN, texto propio y enlace. El precio manual puede guardarse como nota interna para decidir, pero nunca sale en el mensaje. En consecuencia, la regla "todo mensaje incluye precio" pasa a ser "todo mensaje **con precio** incluye fecha y hora y descargo".
2. **Histórico propio de precios de 30 días** (afecta a §6). La Licencia limita la caché de datos de la API a **24 h** y prohíbe *"acumular, analizar, extraer o readaptar"* su contenido sin autorización escrita. Además, los sitios no pueden ofrecer *seguimiento o alertas de precio*.
   - *Propuesta:*
     - Basar el "descuento real" en lo que **Amazon ya calcula**: `savingBasisType` (`WAS_PRICE`/`LOWEST_PRICE` frente a `LIST_PRICE`) y `savings.percentage`. En la UE, la normativa Ómnibus hace que el precio de referencia de una rebaja sea el más bajo de los últimos 30 días, aunque hay que verificarlo.
     - Usar **Keepa** (datos de un tercero con licencia propia) como fuente opcional de histórico.
     - Guardar **sin límite solo ASIN y eventos propios** (qué y cuándo se publicó), y los snapshots de precio con un **TTL de 24 h** y purga automática. La deduplicación del tipo "salvo que el precio haya bajado más" funciona igual: se guarda el **precio publicado** como parte del registro de publicación. Es un dato de nuestro propio mensaje, aunque también hay que verificar que esto es aceptable.
     - Alternativa: pedir autorización por escrito a Afiliados para el histórico.
3. **Imágenes** (afecta a §3 R2, §9 Telegram `sendPhoto` y la descarga de imagen para WhatsApp). Está **prohibido guardar o cachear imágenes**; solo se puede guardar su URL durante ≤ 24 h. Además, no se puede usar el contenido del programa en plataformas que exijan sublicenciar derechos, y subir la foto a Telegram o WhatsApp es una zona gris.
   - *Propuesta:* **no usar R2 para imágenes**.
     - En Telegram, mensaje de texto con **vista previa del enlace de Amazon**: la genera Telegram desde la página de Amazon y no subimos la imagen. Alternativa: `sendPhoto` con la URL de Amazon, asumiendo el riesgo.
     - En WhatsApp, compartir **solo texto con el enlace** (WhatsApp genera la vista previa).
     - Así se resuelven también el límite de 1024 caracteres del caption y el problema de compartir archivos (puntos 13.B.7 y 13.B.8).
4. **Enlaces de afiliado: no se pueden modificar** (afecta a §7). La doc de la API exige no alterar los parámetros de los enlaces que devuelve. **El tracking ID por canal se consigue pidiendo a la API con el tracking ID de cada canal como `partnerTag`.** Coste: una tanda de GetItems por canal al publicar, que además sirve como refresco del precio. Sin API, el enlace manual `https://www.amazon.es/dp/<ASIN>?tag=<tracking-id-del-canal>` es el formato estándar de enlace de texto.
5. **Valoración y nº de reseñas** (afecta a §4). La API **no devuelve reseñas** (no hay recurso documentado y aparece como `null`). Solo existe el filtro de búsqueda `minReviewsRating` (entero 1–4). **El filtro "nº mínimo de reseñas" no se puede implementar**, y "valoración mínima" solo de forma aproximada en la búsqueda.
   - *Propuesta:* mantener ambos campos en la temática. `minReviewsRating` se pasa a la API y el nº de reseñas queda como campo manual opcional (solo para `ManualProvider`, no se muestra).
6. **Los canales deben ser "Sitios" declarados y con suscriptores voluntarios.** Cada canal de Telegram y WhatsApp debe darse de alta en Associates Central. Los enlaces solo pueden ir a destinatarios que lo hayan solicitado: canales públicos a los que se suscriben, no grupos ni chats ajenos.
7. **LLM** (afecta a §7). No se puede modificar el contenido del programa: el título y las características pueden **truncarse**, pero no reescribirse. El LLM solo redacta texto propio (entradilla y tono) y no puede inventar características. Esto se valida antes de publicar.
8. **Uso en contexto móvil.** La Licencia limita el uso del contenido de la API en páginas o apps *diseñadas para móvil* sin aprobación. El back office es privado y los canales son apps de terceros, pero **recomiendo consultarlo con soporte de Afiliados** junto con los puntos 2, 3 y 6 antes de la fase 2.

### 13.B Riesgos técnicos y de diseño

1. **Recomprobación de precio sin API.** Sin API no hay precio que recomprobar (ver 13.A.1). Con API, el refresco antes de publicar (GetItems por canal) es obligatorio, porque la caché de ofertas recomendada es de **1 h**. Si el snapshot tiene más de 1 h, se refresca. Si el precio cambia, la publicación pasa a revisión.
2. **Pérdida de acceso a la API.** Se pierde tras **30 días sin ventas** cualificadas (y vuelve unos 2 días después de nuevas ventas). La API responde `403 AssociateNotEligible`. El sistema debe degradar automáticamente al modo sin API y avisarlo en el panel.
3. **Cuota de peticiones.** Al principio 1 TPS / 8.640 TPD. Después depende de los ingresos vía API y **puede bajar mucho**. Hace falta un presupuesto de llamadas por escaneo configurable, llamadas en serie y backoff con `retryAfterSeconds`. SearchItems devuelve como máximo 100 resultados por consulta (10 × 10).
4. **Publicaciones programadas con un cron diario.** No basta: hace falta un cron frecuente (p. ej. cada 5–15 min) que despache lo programado, o Cloudflare Queues / alarmas de Durable Objects. Las franjas van en **Europe/Madrid** y los Cron Triggers en UTC (cuidado con el cambio de hora).
5. **Cron Triggers con Nuxt/Nitro en Cloudflare** *(verificar)*. Hay que comprobar el soporte de `scheduled` en el preset de Cloudflare de Nitro. Alternativa: un Worker separado con el cron que comparta D1.
6. **Tracking IDs.** Los tracking IDs adicionales se crean en Associates Central (hay un límite por cuenta) y deben existir antes de usarse. Un tag no válido devuelve `400 InvalidPartnerTag`. El panel avisa si un canal no tiene tracking ID o si la API lo rechaza.
7. **Límite de texto en Telegram.** El caption de `sendPhoto` admite 1024 caracteres y `sendMessage` 4096. Con la propuesta 13.A.3 (texto + vista previa) se usa `sendMessage`. Las plantillas validan la longitud igualmente.
8. **WhatsApp y Web Share API** *(verificar)*. No está garantizado que la hoja de compartir permita elegir un **Canal** de WhatsApp como destino. Con la propuesta 13.A.3 basta con compartir texto: `navigator.share({ text })` o copiar al portapapeles.
9. **Autenticación del panel.** Recomendado **Cloudflare Access** (gratis para un usuario, sin contraseñas, cómodo en móvil). Se valida también el JWT de Access en el Worker y se protegen por separado los endpoints internos de cron.
