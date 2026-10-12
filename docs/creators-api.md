# Amazon Creators API y normas de Afiliados de amazon.es — notas de investigación

> Fecha: 2026-10-12. Base para diseñar los proveedores de producto y la generación de mensajes.
> **Nada de aquí se ha probado contra la API real** (no hay credenciales: hacen falta ventas, ver §1).

## 0. Fuentes

Todo lo que sigue sale de **documentación oficial leída directamente**, salvo donde se indique lo contrario:

- Documentación de la Creators API: `https://affiliate-program.amazon.com/creatorsapi/docs/en-us/` (introducción, migración, *concepts*, referencia de operaciones y recursos, errores, *locale reference* de España).
- **Políticas del Programa de Afiliados de amazon.es**, que incluyen la **Licencia** que rige el uso de la Creators API en España: `https://afiliados.amazon.es/help/operating/policies`. La propia doc de la API remite a ella como su *License Agreement*.
- **Acuerdo Operativo de Afiliados de amazon.es**: `https://afiliados.amazon.es/help/operating/agreement`.

Las referencias entre paréntesis del tipo *(Licencia 2.c.h)* son aproximadas, porque la página no numera de forma estable. Hay que buscarlas por texto.

Como fuente secundaria se usó una copia del SDK de Node.js publicada en npm (`creatorsapi-nodejs-sdk@1.2.0`). No es de Amazon y **la doc oficial la contradice en la autenticación** (ver §2): **no usarla**.

---

## 1. Acceso y elegibilidad

- La Creators API sustituye a la PA-API 5.0. Las llamadas a la PA-API 5 devuelven `403 AccessDeniedException`.
- **Requisitos:**
  - Ser afiliado con **aceptación definitiva** en amazon.es.
  - Tener **≥ 10 ventas cualificadas en los últimos 30 días**.
  - Solo el **titular principal** de la cuenta puede registrarse (Associates Central → *Herramientas* → *Creators API*).
  - Se pueden crear como máximo 2 aplicaciones por tienda, con 2 credenciales cada una. El *secret* solo se muestra una vez.
- **Pérdida de acceso:** se pierde tras **30 días seguidos sin ventas cualificadas referidas**. Se recupera unos **2 días** después de que se envíen nuevas ventas. Mientras tanto, la API responde `403 AccessDeniedException` con `reason: AssociateNotEligible`.
- **Consecuencia:** el sistema tiene que funcionar sin API en cualquier momento, no solo al principio.

## 2. Autenticación

- OAuth 2.0 *client credentials* con **Login with Amazon (LwA)**. Credenciales: *Credential ID*, *Credential Secret* y *Version*.
- La versión se asigna según la región de la tienda. **amazon.es → versión 3.2**, con endpoint de token `https://api.amazon.co.uk/auth/o2/token`.

```http
POST https://api.amazon.co.uk/auth/o2/token
Content-Type: application/json

{ "grant_type": "client_credentials", "client_id": "…", "client_secret": "…", "scope": "creatorsapi::default" }
```

- Respuesta: `access_token`, `token_type: bearer`, `expires_in: 3600`.
- **Cachear y reutilizar el token** hasta poco antes de que caduque, compartido entre procesos (en Workers: KV o D1). Pedir uno por petición provoca throttling.
- Cabecera en cada llamada: `Authorization: Bearer <token>`. **Sin sufijo de versión**: la doc oficial dice *"No version header required"*.
  - El SDK de npm usa endpoints de Cognito (2.x) y el sufijo `, Version x.y`. **Descartado.**

## 3. Endpoints y cabeceras

- Base: `https://creatorsapi.amazon`. Todas las operaciones son `POST` con JSON.
- Cabeceras obligatorias: `Content-Type: application/json`, `Authorization: Bearer …`, `x-marketplace: www.amazon.es`.
- Parámetros comunes: `partnerTag` (obligatorio) y `marketplace: "www.amazon.es"`.
  - `partnerTag` admite el *store ID* **o cualquier tracking ID** de la cuenta en ese marketplace.

| Operación | Ruta | Límite | Uso en este proyecto |
|---|---|---|---|
| SearchItems | `/catalog/v1/searchItems` | 10 resultados por página (`itemCount` 1–10) y `itemPage` 1–10, así que **máx. 100 resultados por consulta** | Escaneo diario por temática |
| GetItems | `/catalog/v1/getItems` | **Hasta 10 ASIN = 1 transacción** | Refresco de precio antes de publicar |
| GetBrowseNodes | `/catalog/v1/getBrowseNodes` | Hasta 10 nodos por llamada | Ayuda en el panel para elegir y validar nodos |
| GetVariations | `/catalog/v1/getVariations` | — | No previsto |

- **Locale de España:** idioma `es_ES` y moneda `EUR`. *Search indexes* relevantes: `Baby` (Bebé), `HomeAndKitchen`, `VideoGames`, `ToysAndGames`, `Electronics`, etc. (lista completa en la doc *locale-reference/spain*).

## 4. SearchItems: parámetros útiles

Hace falta al menos uno de estos: `keywords`, `brand`, `title`, `actor`, `artist` o `author`. Además se puede usar:

| Parámetro | Notas |
|---|---|
| `searchIndex` | Por defecto `All` |
| `browseNodeId` | **Uno por petición** |
| `minPrice` / `maxPrice` | **En céntimos** (enteros) |
| `minSavingPercent` | 1–99. Es el ahorro **según Amazon** |
| `minReviewsRating` | Entero 1–4. **Es lo único que hay sobre valoraciones** (ver §5) |
| `availability` | `Available` (por defecto) o `IncludeOutOfStock` |
| `condition` | `Any` (por defecto) o `New`. **Usar `New`** |
| `deliveryFlags` | `Prime`, `FreeShipping`, `FulfilledByAmazon`, `AmazonGlobal` |
| `sortBy` | `AvgCustomerReviews`, `Featured`, `NewestArrivals`, `Price:HighToLow`, `Price:LowToHigh`, `Relevance` |
| `languagesOfPreference` | `["es_ES"]` |
| `resources` | Por defecto solo `itemInfo.title` |

### Correspondencia con los filtros de las temáticas

| Filtro de la temática | En la API | En local |
|---|---|---|
| Palabras clave | `keywords` | — |
| Nodos de categoría | `browseNodeId` (una petición por nodo) | — |
| Rango de precio | `minPrice` / `maxPrice` | Sí |
| Descuento mínimo | `minSavingPercent` | Sí, con la lógica de §6 |
| Valoración mínima | `minReviewsRating` (solo entero) | **No es posible**: la API no devuelve la valoración |
| Nº mínimo de reseñas | — | **No es posible**: la API no lo devuelve |
| Exclusiones | — | Sí, sobre el título y `byLineInfo.brand` |

## 5. Respuesta: recursos y campos

Recursos documentados (hay que pedirlos explícitamente en `resources`): `browseNodeInfo.*`, `images.primary.{small,medium,large}`, `images.variants.*`, `itemInfo.{title,byLineInfo,features,classifications,…}`, `offersV2.listings.{price,availability,condition,dealDetails,isBuyBoxWinner,merchantInfo,type}`, `parentASIN` y `searchRefinements`.

> ⚠️ **No hay recurso de reseñas.** `customerReviews` no figura entre los recursos documentados y en el ejemplo de respuesta oficial aparece como `null`. **Los filtros de "valoración mínima" y "número mínimo de reseñas" de la spec no se pueden aplicar con datos de la API**, salvo el filtro aproximado `minReviewsRating` en la búsqueda.

```
Item
├─ asin, parentASIN
├─ detailPageURL           ← enlace con tag y linkCode: NO MODIFICAR (§7)
├─ itemInfo.title.displayValue, itemInfo.byLineInfo.brand.displayValue, itemInfo.features
├─ images.primary.large { url, width, height }
└─ offersV2.listings[]     ← solo la oferta destacada (buy box). Sin ofertas = sin stock
   ├─ price.money { amount, currency, displayAmount }
   ├─ price.pricePerUnit
   ├─ price.savingBasis { money, savingBasisType, savingBasisTypeLabel }
   │     savingBasisType ∈ LIST_PRICE | LOWEST_PRICE | LOWEST_PRICE_STRIKETHROUGH | WAS_PRICE
   ├─ price.savings { money, percentage }     ← savings = money − savingBasis
   ├─ availability { type, message, minOrderQuantity, maxOrderQuantity }
   │     type ∈ IN_STOCK | IN_STOCK_SCARCE | LEADTIME | OUT_OF_STOCK | PREORDER | AVAILABLE_DATE | UNAVAILABLE | UNKNOWN
   ├─ condition { value: New|Used|Refurbished|Unknown, subCondition, conditionNote }
   ├─ dealDetails { accessType: ALL|PRIME_EARLY_ACCESS|PRIME_EXCLUSIVE, badge, startTime, endTime, percentClaimed, … }
   │     ← si existe, la oferta está activa en ese momento
   ├─ isBuyBoxWinner, merchantInfo { id, name }
   ├─ type ∈ LIGHTNING_DEAL | SUBSCRIBE_AND_SAVE   (ausente en ofertas normales)
   └─ violatesMAP          ← true: no se puede mostrar el precio
```

- Las respuestas con HTTP 200 pueden traer `errors[]` parciales (p. ej. un ASIN no encontrado dentro de un lote).
- El precio corresponde a una dirección de envío estándar del marketplace y puede diferir del que ve cada cliente.

## 6. Detección de ofertas: qué permite la API

- `savingBasisType` indica **respecto a qué** se calcula el descuento:
  - `LIST_PRICE`: PVP recomendado. Es el más propenso a inflarse.
  - `WAS_PRICE` / `LOWEST_PRICE` / `LOWEST_PRICE_STRIKETHROUGH`: precio de referencia real calculado por Amazon.
- En la UE, la normativa Ómnibus obliga a que el precio tachado de una rebaja sea el **más bajo de los últimos 30 días**. Es razonable esperar que en amazon.es `LOWEST_PRICE` refleje eso. **Verificar con datos reales** antes de basar la lógica en ello.
- Señales de oferta sospechosa: base `LIST_PRICE`, `type = SUBSCRIBE_AND_SAVE`, `condition ≠ New`, `isBuyBoxWinner = false` o `violatesMAP = true`.
- `dealDetails.endTime` permite fijar la caducidad de la candidata antes de las 24 h.

## 7. Normas de la Licencia y del Acuerdo de amazon.es que afectan al diseño

Estas cláusulas **cambian requisitos de la spec**. Se citan en resumen; el texto literal está en las fuentes de §0.

1. **Solo se pueden mostrar precios obtenidos de la API** *(Políticas, "Los precios y la disponibilidad del Producto podrán variar…")*. Se puede mostrar precio y disponibilidad solo si (a) Amazon facilita el enlace que los muestra o (b) se obtienen vía la Creators API / PA-API cumpliendo la Licencia.
   → **Un precio tecleado a mano (`ManualProvider`) no se puede publicar.**
2. **Caché máxima de 24 h y prohibición de guardar imágenes** *(Licencia 2.c.h)*:
   - Prohibido guardar o cachear imágenes; solo se puede guardar el **enlace** a la imagen, durante 24 h como máximo.
   - El resto del contenido de la API se puede cachear **≤ 24 h** y después hay que refrescarlo.
   - Los **ASIN** se pueden guardar indefinidamente.
   - La doc técnica recomienda además un TTL de **1 hora para las ofertas** (*Best programming practices*).
3. **Prohibido acumular o analizar contenido de la API sin autorización escrita** *(Licencia 2.c.e)*: *"no accederá a Creators API […] con el fin de acumular, analizar, extraer o readaptar ningún Contenido Publicitario del Producto"*.
   → **Un histórico propio de precios de 30 días con datos de la API choca con esto y con la caché de 24 h.**
4. **Prohibido ofrecer seguimiento o alertas de precio** *(Políticas, (y))*: *"Salvo que Amazon acuerde otra cosa, su Sitio no deberá tener funcionalidad de seguimiento de precios y/o de alertas de precio."*
   → No publicar mensajes del tipo "mínimo histórico" ni gráficas de precio.
5. **Fecha y hora y descargo obligatorios junto al precio** *(Licencia 2.c.i)*:
   - Hay que incluir la marca de fecha y hora de consulta si el precio no se refresca al menos cada hora. La fecha puede omitirse si es del mismo día.
   - Y el descargo literal (o enlazado): *"Los precios y disponibilidad del Producto son precisos en la fecha y hora indicados y están sujetos a cambios. Se aplicará a la compra del producto el precio e información de disponibilidad que aparezca en Amazon.es en el momento de la compra."*
6. **No modificar los enlaces que devuelve la API** *(API rates; Best programming practices)*: *"Alterations of any kind to vended links will lead to missing attribution"*.
   → **El tracking ID por canal se consigue pasando el tracking ID del canal como `partnerTag` en la petición**, no reescribiendo el parámetro `tag`.
7. **Los canales deben ser "Sitios" declarados** *(Políticas, (b))*: no se pueden mostrar enlaces con tu tag *"en un sitio que no sea su Sitio"*.
   → Cada canal de Telegram y WhatsApp tiene que estar dado de alta en Associates Central.
8. **Mensajería permitida si es solicitada** *(Políticas, Actividades de Promoción)*: se pueden incluir enlaces en correos, SMS y mensajes directos desde tus perfiles sociales **siempre que el destinatario haya optado por recibirlos**. Un canal al que el usuario se suscribe encaja; **no enviar a chats o grupos que no lo hayan pedido**.
9. **Contenido de la API en plataformas que exigen sublicencia** *(Políticas, (b))*: no se puede usar el contenido del programa en plataformas, *incluidas redes sociales*, que exijan sublicenciar o ceder derechos a terceros. **Subir la imagen de Amazon a Telegram o WhatsApp es una zona gris**; ver la propuesta en `SPEC.md` §13.
10. **No modificar el contenido del programa** *(Políticas, (a))*: se puede **truncar** el texto (p. ej. el título) sin cambiar su sentido y redimensionar imágenes manteniendo la proporción. **El LLM no debe reescribir el título ni las características**; solo puede redactar texto propio alrededor, sin afirmaciones inexactas.
11. **Aviso de afiliado literal** *(Acuerdo)*: *"En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables"*, de forma clara y destacada. Coincide con la spec.
12. **Uso en móvil** *(Licencia 2.c.d)*: sin autorización no se puede usar el contenido de la API en páginas o apps *diseñadas para móvil*. Es un back office privado, pero **conviene consultarlo con soporte de Afiliados**, igual que el uso en apps de mensajería.
13. **Enlaces de redirección y acortadores propios**: prohibidos, como ya decía la spec.
14. **Agentes** *(Políticas, "Agentes")*: si un agente automatizado accede al contenido del programa, debe identificarse en el *user agent* (`Agent/<nombre>`). Las llamadas a la API ya van autenticadas, pero **nunca se accede a las páginas de amazon.es** (tampoco para generar vistas previas).

## 8. Límites de peticiones

- **Inicial:** 1 TPS y 8.640 TPD durante los primeros 30 días.
- **Después:** 1 TPD por cada 0,05 $ y 1 TPS (máximo 10) por cada 4.320 $ de ingresos por envíos atribuidos a la API en los últimos 30 días. Se recalcula a diario.
  - **Con pocas ventas, la cuota puede ser mucho menor que la inicial.** El presupuesto de llamadas tiene que ser configurable y visible en el panel.
- La atribución exige usar la cuenta principal, pasar siempre `partnerTag` y **no editar los parámetros de las URLs** devueltas.
- **Errores** (todos con `type`, `message` y, según el caso, `reason`):

| HTTP | Tipo | Qué hacer |
|---|---|---|
| 400 | `ValidationException` (`InvalidPartnerTag`, `InvalidAssociate`, `FieldValidationFailed`…) | No reintentar. Registrar y avisar en el panel |
| 401 | `UnauthorizedException` (`TokenExpired`, `InvalidToken`…) | Renovar el token **una vez** y reintentar |
| 403 | `AccessDeniedException` (`AssociateNotEligible`…) | Marcar el proveedor como no disponible y degradar a modo sin API |
| 404 | `ResourceNotFoundException` | No reintentar |
| 429 | `ThrottleException` (puede traer `retryAfterSeconds`) | Backoff exponencial, respetando `retryAfterSeconds` |
| 500 | `InternalServerException` | Backoff exponencial, con un número limitado de intentos |

- **Presupuesto por escaneo:** Σ temáticas × (nodos + consultas) × páginas, más ⌈candidatas/10⌉ GetItems **por cada tracking ID de canal** al publicar. Con 1 TPS, las llamadas van **en serie**, repartidas en el tiempo.

## 9. Decisión para el proyecto

- El dominio usa un `ProductSnapshot` propio. `CreatorsApiProvider` traduce desde `offersV2`. `MockProvider` devuelve fixtures con **la forma exacta de §5** y pasa por el mismo mapper.
- La fase 2 empieza con un *spike*: token LwA 3.2, un GetItems de 1 ASIN en amazon.es y guardar la respuesta real como fixture. Hay que confirmar:
  - el significado de `LOWEST_PRICE` en España;
  - que `customerReviews` no llega;
  - el formato de `detailPageURL`.
