# SPEC — Plataforma de canales de ofertas de Amazon (afiliados)

> Documento de referencia del proyecto. Es la base sobre la que se trabaja: cualquier cambio de alcance se refleja aquí primero.
> Estado: **aprobado para la fase 1** (2026-10-12). Decisiones en §14; arquitectura y modelo de datos en [`docs/arquitectura.md`](docs/arquitectura.md).

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
| Framework | **Nuxt 4** + Nitro (ver §14.4) | Preset `cloudflare_module` (Workers). |
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
- **Redacción con LLM (Anthropic API)** opcional, siguiendo el tono de la temática, con **fallback a plantilla** si la llamada falla. El LLM solo redacta la entradilla (§14.6).
- **Todo mensaje incluye obligatoriamente** ⚠️ (§13.A.1 y §14.10; ver `docs/creators-api.md` §7.5):
  - Si lleva precio: el precio con la **fecha y hora de consulta**.
  - La línea breve **«ℹ️ Enlace de afiliado · precio sujeto a cambios»** (sin precio, solo «ℹ️ Enlace de afiliado»).
  - Los textos completos de Amazon (aviso de afiliado y descargo de precios) van en la **descripción del canal**, no en cada mensaje (§14.10).
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
3. `ManualProvider` y `MockProvider`, instantáneas de precio con caducidad de 24 h y detección de ofertas con los datos de Amazon (§14.2).
4. Generación de mensajes con plantillas.
5. Cola de publicaciones con Telegram automático y WhatsApp asistido.
6. Cron diario funcionando contra `MockProvider`.

### Fase 2

- Integración real con la Creators API (`CreatorsApiProvider`), empezando por un *spike* con credenciales reales (ver [`docs/creators-api.md`](docs/creators-api.md) §8).
- ✅ Redacción con LLM (Anthropic API) con fallback a plantilla (§14.6).
- Estadísticas.

### Fase 3 — Posible SaaS (hoja de ruta, sin compromiso)

Hipótesis: los administradores de canales de chollos en Telegram y WhatsApp pagarían por una herramienta que les ahorre trabajo **sin arriesgar su cuenta de Afiliados**. El cumplimiento de las normas de Amazon es el argumento diferencial frente a herramientas que hacen scraping.

**1. Validar antes de construir.** No se empieza la Fase 3 sin señales en estos tres puntos:
- **Uso propio.** Los canales propios generan clics y comisiones (informes de Associates Central por tracking ID), y la herramienta ahorra un tiempo medible a la semana.
- **Entrevistas.** Hablar con 5–10 administradores de canales sobre su flujo actual, qué les quita más tiempo, si tienen acceso a la Creators API y si pagarían, y cuánto.
- **Pilotos a mano.** Con 2–3 interesados, una instalación dedicada por cliente (su propio Worker y su propia D1) antes de hacer la plataforma multicliente.

**2. Restricciones de producto, por las normas de Amazon.** Las medidas temporales de validación de la fase 1 **no se trasladan a clientes**:
- **Precio y descuento manuales (§14.7).** En SaaS desaparecen o quedan en modo «solo API». Las altas manuales se publican sin precio, como en §14.1.
- **Credenciales propias.** Cada cliente usa su propia cuenta de Afiliados y sus credenciales de la Creators API, nunca las de la plataforma. Amazon solo da acceso a la API a afiliados con ventas recientes, así que el público inicial son canales que ya generan comisiones; sin API, la herramienta se queda en alta manual sin precio.
- **Mismas reglas para todos.** Sin scraping, sin almacenar imágenes y con los textos de IA limitados a lo que permite la Licencia (§14.6 y §14.9). Hay que revisar si los términos de Afiliados y de la Creators API permiten que un tercero opere la API por cuenta del afiliado, y documentarlo antes de lanzar.
- **WhatsApp.** Sigue siendo asistido: no hay API oficial para publicar en Canales. Hay que comunicarlo con claridad.

**3. Trabajo técnico** (la base actual se mantiene: Workers, D1, Nitro y la lógica separada en dominio, proveedores y canales):
- **Multicliente.** Un `tenant_id` en todas las tablas y en todas las consultas, o una D1 por cliente. Hay que decidirlo en función del volumen.
- **Autenticación propia.** Registro, login y equipos con roles, porque Cloudflare Access no sirve para clientes.
- **Cobros.** Stripe, con planes según el número de canales, de temáticas y de redacciones con IA.
- **Secretos de cliente cifrados en la base de datos.** Credenciales de la Creators API y tokens de bots, cifrados con una clave del Worker (no como secretos de wrangler). Se rotan y se borran al dar de baja al cliente.
- **Telegram.** O el cliente añade como administrador el bot de la plataforma, o registra su propio bot, y cada bot buzón tiene su propio webhook.
- **Escalado del cron.** Los escaneos y las publicaciones de cada cliente se reparten con Cloudflare Queues, por los límites de subpeticiones y de CPU de una ejecución.
- **Costes de IA.** Límites por cliente y plan, y registro del consumo de tokens.
- **Operación.**
  - Registro de actividad por cliente, alertas cuando una publicación falla y exportación y borrado de datos (RGPD).
  - Términos de uso que dejan al cliente como responsable de su cuenta de Afiliados.

### Fuera de alcance por ahora

- Integración real con Keepa (solo interfaz preparada).
- Otros canales (Instagram, etc.).
- Versión SaaS: ver la hoja de ruta de la Fase 3, que depende de la validación.

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

---

## 14. Decisiones tomadas

1. **Publicar sin API en la fase 1** (resuelve 13.A.1). Los productos dados de alta con `ManualProvider` se publican **sin precio**, con el texto "Consulta el precio actual en Amazon". El precio que se introduzca a mano es solo una nota interna y nunca aparece en un mensaje (modificado temporalmente por §14.7). Los mensajes con precio (procedentes de la API, o del mock en desarrollo) incluyen la fecha y hora de consulta y la línea breve de avisos (§14.10).
2. **Detección de ofertas con los datos de Amazon** (resuelve 13.A.2). Se usan `savingBasisType` y `savings` de OffersV2, junto con las señales de §13.A.2. **No se mantiene un histórico propio de precios**: las instantáneas caducan a las 24 h y se purgan. Keepa queda como fuente opcional detrás de la interfaz `PriceHistoryProvider` (sin implementar). **No se pedirá autorización escrita a Afiliados**: el proyecto es un MVP para validar la idea.
3. **Sin almacenamiento de imágenes** (resuelve 13.A.3). Los mensajes llevan el enlace de Amazon y la vista previa la genera cada plataforma. En Telegram se usa `sendMessage` con `link_preview_options` y un botón al producto. En WhatsApp se comparte solo texto. No se usa R2.
4. **Nuxt 4 en lugar de Nuxt 3.** Nuxt 4 es la versión mayor actual: misma API y mismo Nitro, con la estructura `app/`. Nuxt 3 solo recibe mantenimiento. Para un proyecto nuevo, Nuxt 4 da más vida útil sin coste de aprendizaje.
5. **Autenticación con Cloudflare Access.** El Worker valida además el JWT de Access (`Cf-Access-Jwt-Assertion`) y el email autorizado. En local, la validación se desactiva de forma explícita.
6. **Redacción con IA: solo la entradilla** (resuelve 13.A.7). Con `ANTHROPIC_API_KEY`, el escaneo pide a `claude-opus-5-5` (esfuerzo `low`) **una frase de enganche por oferta** en el tono de la temática. El título, la marca, el precio, el enlace y los avisos siguen saliendo de la plantilla y del renderizador. La frase se valida antes de usarla: una línea, ≤ 180 caracteres, sin cifras, enlaces, formato, afirmaciones de precio o envío, ni tramos del título. Si no hay clave, la llamada falla o la frase no pasa la validación, el mensaje sale **solo con la plantilla**. Máximo 20 llamadas por ejecución. La entradilla se guarda en `deals.intro` para regenerar el mensaje tras una revisión de precio.
7. **Modo de validación: precio introducido a mano (2026-10-12)** — modifica §14.1. Mientras no haya acceso a la Creators API, las altas manuales (panel o bot buzón) pueden llevar un precio tecleado, y ese precio se publica. Las Políticas de Afiliados piden que los precios mostrados procedan de la API (§13.A.1). Por eso esta opción:
   - es una **medida temporal del MVP** para validar la idea con los canales propios;
   - se **sustituye por los precios de la Creators API** en cuanto esté disponible;
   - **no forma parte** de una posible versión para terceros (§12, Fase 3).

   Salvaguardas:
   - el mensaje muestra la fecha y hora del alta como hora de consulta, y «precio sujeto a cambios»;
   - sin precio, el mensaje sale con «Consulta el precio actual en Amazon».

   **Ampliación (2026-10-13):** también se puede indicar el precio de referencia que muestra Amazon (precio anterior tachado o PVP recomendado) para calcular y publicar el descuento («−25% (antes …)» o «(PVP rec. …)»). Tiene el mismo carácter temporal y solo se usa si es mayor que el precio actual. Los filtros de descuento mínimo no se aplican a las altas manuales.
8. **Bot buzón de Telegram.** Un bot aparte (no el que publica) recibe enlaces compartidos desde la app de Amazon por las personas autorizadas, crea la candidata con entradilla de IA y permite publicar, programar o descartar desde el chat. Nunca accede a las páginas de Amazon: solo resuelve redirecciones de enlaces cortos para obtener el ASIN.
9. **Texto propio redactado con IA (alta manual).** En el alta manual del panel, el botón «Redactar con IA» convierte las **notas del usuario** (por qué lo recomienda, para quién es) en un texto de 2 a 4 frases (≤ 480 caracteres) en el tono de la temática. El texto rellena «Texto propio» y se revisa antes de crear la candidata. La IA **solo amplía lo que dicen las notas**: no describe el producto por su cuenta, no usa contenido de Amazon (la Licencia prohíbe modificarlo o reescribirlo) y no inventa características. Se valida igual que la entradilla, con una diferencia: se aceptan las cifras y expresiones que ya estén en las notas. **Pendiente para cuando haya Creators API:** generarlo de forma automática. Aun así, seguirá sin poder parafrasear las características que devuelva la API, por la misma restricción de la Licencia.
10. **Avisos legales en la descripción del canal (2026-10-13, con asesoramiento legal).** Por decisión del propietario, tras consultar con un abogado, los textos completos de Amazon (el aviso de afiliado y el descargo de precios) van en la **descripción de cada canal**, y no se repiten en los mensajes. Cada mensaje lleva solo:
    - la fecha y hora de consulta junto al precio;
    - la línea breve «ℹ️ Enlace de afiliado · precio sujeto a cambios» (sin precio, «ℹ️ Enlace de afiliado»). Identifica cada publicación como comunicación comercial.

    Si el canal tiene «Enlace para la línea de avisos» (p. ej. el mensaje fijado con los textos completos), la línea enlaza a él. La migración `0005` pasa los mensajes aún no publicados al formato breve. Al editar un mensaje a mano, debe conservar la línea breve. **Requisito operativo:** cada canal debe tener los textos completos en su descripción.

