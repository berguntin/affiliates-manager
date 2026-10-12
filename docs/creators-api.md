# Amazon Creators API — notas de investigación

> Fecha: 2026-10-12. Base para diseñar `CreatorsApiProvider` (fase 2).
> **Nada de aquí se ha probado contra la API real** (no hay credenciales: hacen falta ventas, ver §1).

## 0. Fuentes y grado de confianza

| Fuente | Cómo se ha consultado | Confianza |
|---|---|---|
| Documentación oficial (`affiliate-program.amazon.com/creatorsapi/docs`, y sus espejos `.it`, `.com.au`, `.co.jp`) | **Solo a través de extractos de buscador.** La red de este entorno de desarrollo bloquea los dominios de Amazon, así que las páginas no se han podido abrir directamente. | Media-alta |
| SDK de Node.js (paquete npm `creatorsapi-nodejs-sdk@1.2.0`, Apache-2.0, código generado) | Descargado e inspeccionado sin ejecutarlo. **No lo publica Amazon** (el SDK oficial se descarga desde Associates Central); parece una copia del SDK oficial. | Media: los nombres coinciden con la doc oficial, pero hay que contrastarlos con el SDK oficial |
| Webs de terceros (plugins de WordPress, n8n, etc.) | Extractos de buscador. | Baja: solo como pista |

**Acción pendiente:** cuando tengas acceso, contrastar §2–§5 con el SDK oficial y con la referencia de la API. Otra opción es abrir `affiliate-program.amazon.com` en la red del entorno y lo reviso yo.

## 1. Qué es y quién puede usarla

- La Creators API **sustituye a la PA-API 5.0**. Según el aviso oficial de deprecación, las llamadas a la PA-API 5 ya devuelven `403 AccessDeniedException`.
- Es una API REST con autenticación OAuth 2.0 (*client credentials*). Según la guía de migración ofrece la misma funcionalidad que la PA-API 5.0.
- **Requisitos (doc oficial):** estar dado de alta en Afiliados del marketplace y tener **al menos 10 ventas cualificadas en los últimos 30 días**. Solo puede registrarse el titular principal de la cuenta. Las credenciales se crean en Associates Central, menú *Herramientas*.
- Si no se cumplen los requisitos, la API devuelve `AccessDeniedReason = AssociateNotEligible` (enum del SDK). **Se puede perder el acceso** si bajan las ventas, así que el sistema debe degradar a `ManualProvider`.

## 2. Autenticación

- Credenciales: **Credential ID**, **Credential Secret** y **Credential Version**.
- La versión determina la región y el proveedor de identidad (SDK, `OAuth2Config`):

| Versión | Región | Endpoint de token | Scope |
|---|---|---|---|
| `2.1` | NA (Cognito) | `https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token` | `creatorsapi/default` |
| **`2.2`** | **EU (Cognito)** | `https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token` | `creatorsapi/default` |
| `2.3` | FE (Cognito) | `https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token` | `creatorsapi/default` |
| `3.1` | NA (LWA) | `https://api.amazon.com/auth/o2/token` | `creatorsapi::default` |
| **`3.2`** | **EU (LWA)** | `https://api.amazon.co.uk/auth/o2/token` | `creatorsapi::default` |
| `3.3` | FE (LWA) | `https://api.amazon.co.jp/auth/o2/token` | `creatorsapi::default` |

  Para amazon.es corresponde **2.2 o 3.2**, según el tipo de credencial que emita Associates Central.
- Petición de token: `grant_type=client_credentials`, `client_id`, `client_secret`, `scope`. Con Cognito (2.x) se envía como `application/x-www-form-urlencoded`; con LWA (3.x), como JSON.
- **El token dura 1 hora** (`expires_in: 3600`). La doc oficial pide **reutilizarlo** y no pedir uno por petición, porque eso provoca throttling. En Workers, cachearlo en KV o D1 con margen (el SDK renueva 30 s antes).
- Cabecera de autorización:
  - v2.x: `Authorization: Bearer <token>, Version <version>`
  - v3.x: `Authorization: Bearer <token>`

## 3. Endpoints

Base: `https://creatorsapi.amazon`. Todas las operaciones son `POST` con cuerpo JSON y la cabecera **`x-marketplace: www.amazon.es`**.

| Operación | Ruta | Uso en este proyecto |
|---|---|---|
| SearchItems | `/catalog/v1/searchItems` | Escaneo diario por temática. |
| GetItems | `/catalog/v1/getItems` | Recomprobar precios antes de publicar e instantáneas de histórico. **Hasta 10 ASIN por llamada y cuenta como 1 transacción.** |
| GetVariations | `/catalog/v1/getVariations` | No previsto. |
| GetBrowseNodes | `/catalog/v1/getBrowseNodes` | Ayuda en el panel para elegir y validar nodos de categoría. |
| listFeeds / getFeed | `/catalog/v1/listFeeds`, `/catalog/v1/getFeed` | No previsto (no está claro el contenido). |
| listReports / getReport | `/reports/v1/listReports`, `/reports/v1/getReport` | Posible fuente de estadísticas en la fase 2. **Según terceros, requiere un volumen de ventas muy alto**, así que no hay que contar con ello. |

Los parámetros pasan de PascalCase (PA-API) a **lowerCamelCase**.

> La ruta de SearchItems sigue el mismo patrón que las demás (`/catalog/v1/<operación>`). Verificar la mayúscula exacta con el SDK oficial.

## 4. Peticiones relevantes

**SearchItems** (`SearchItemsRequestContent`): `partnerTag` (obligatorio), `keywords`, `browseNodeId`, `searchIndex`, `brand`, `title`, `minPrice`, `maxPrice`, `minSavingPercent`, `minReviewsRating`, `availability` (`Available`|`IncludeOutOfStock`), `condition` (`Any`|`New`), `deliveryFlags` (`AmazonGlobal`, `FreeShipping`, `FulfilledByAmazon`, `Prime`), `sortBy` (`AvgCustomerReviews`, `Featured`, `NewestArrivals`, `Price:HighToLow`, `Price:LowToHigh`, `Relevance`), `itemCount`, `itemPage`, `languagesOfPreference`, `currencyOfPreference`, `resources`, `properties`.

**GetItems** (`GetItemsRequestContent`): `partnerTag` y `itemIds` (obligatorios), `condition`, `currencyOfPreference`, `languagesOfPreference`, `resources`, `properties`.

**`resources` útiles** (hay que pedirlos explícitamente; si no, no vienen en la respuesta):
`itemInfo.title`, `itemInfo.byLineInfo`, `itemInfo.features`, `images.primary.large`, `customerReviews.count`, `customerReviews.starRating`, `browseNodeInfo.browseNodes`, `offersV2.listings.price`, `offersV2.listings.availability`, `offersV2.listings.condition`, `offersV2.listings.dealDetails`, `offersV2.listings.isBuyBoxWinner`, `offersV2.listings.merchantInfo`, `offersV2.listings.type`.

### Correspondencia con los filtros de las temáticas

| Filtro de la temática | Filtro de la API | Comprobación local |
|---|---|---|
| Palabras clave | `keywords` | — |
| Nodos de categoría | `browseNodeId` (uno por petición, así que se hace una búsqueda por nodo) | — |
| Rango de precio | `minPrice` / `maxPrice` | Sí (unidades de la API por verificar: en PA-API eran céntimos) |
| Descuento mínimo | `minSavingPercent` (descuento **según Amazon**) | Sí, **descuento real** con el histórico propio |
| Valoración mínima | `minReviewsRating` | Sí, con `customerReviews.starRating` |
| Nº mínimo de reseñas | — (no hay filtro) | Solo local, con `customerReviews.count` |
| Exclusiones (palabras/marcas) | — | Solo local (título y `byLineInfo.brand`) |

## 5. Respuesta: campos que usaremos

```
Item
├─ asin, parentASIN, detailPageURL        ← el enlace ya incluye el partnerTag enviado
├─ itemInfo.title.displayValue
├─ itemInfo.byLineInfo.brand.displayValue
├─ images.primary.large { url, width, height }
├─ customerReviews { count, starRating.value }
├─ browseNodeInfo.browseNodes[] { id, displayName, salesRank }
└─ offersV2.listings[]
   ├─ price
   │  ├─ money { amount, currency, displayAmount }
   │  ├─ pricePerUnit
   │  ├─ savings { money, percentage }
   │  └─ savingBasis { money, savingBasisType, savingBasisTypeLabel }
   │        savingBasisType ∈ LIST_PRICE | LOWEST_PRICE | LOWEST_PRICE_STRIKETHROUGH | WAS_PRICE
   ├─ availability { type, message, minOrderQuantity, maxOrderQuantity }
   ├─ condition { value, subCondition, conditionNote }
   ├─ dealDetails { accessType, badge, startTime, endTime, percentClaimed, earlyAccessDurationInMilliseconds }
   ├─ isBuyBoxWinner, merchantInfo { id, name }, violatesMAP
   └─ type ∈ HAUL | SUBSCRIBE_AND_SAVE | LIGHTNING_DEAL
```

Implicaciones para el diseño:
- **`savingBasisType` es muy útil para detectar descuentos inflados.** No es lo mismo un descuento sobre `LIST_PRICE` (PVPR, a menudo inflado) que sobre `WAS_PRICE` o `LOWEST_PRICE` (precio anterior real). Hay que guardarlo en cada instantánea.
- Usar el listing con `isBuyBoxWinner = true` como precio de referencia.
- Descartar `type = SUBSCRIBE_AND_SAVE` como oferta normal, porque es un precio condicionado.
- `dealDetails` (ofertas flash, *badge*, `endTime`, `percentClaimed`) da contexto al mensaje y fija una caducidad natural.
- `violatesMAP = true` indica que el precio no se puede mostrar (*Minimum Advertised Price*): **no publicar** el precio en ese caso.
- `customerReviews` aparece en el SDK. En la PA-API 5 este recurso devolvía datos de forma muy limitada; **verificar con datos reales** que llega relleno en amazon.es. Si no llega, los filtros de valoración y reseñas no se podrán aplicar.
- `detailPageURL` lleva el `partnerTag` de la petición. Para tener un tracking ID por canal hay dos opciones: (a) pedir con el tag de cada canal (multiplica las llamadas) o (b) **reescribir el parámetro `tag` del enlace** al generar el mensaje de cada canal. Se elige **(b)**. Verificar en los términos que reescribir el tag está permitido (es un enlace de afiliado estándar sin redirección, así que en principio sí).

## 6. Límites de peticiones (doc oficial)

- Al crear las credenciales: **1 TPS y 8.640 TPD** durante los primeros 30 días.
- Después: 1 TPD por cada 0,05 $ y 1 TPS (máximo 10) por cada 4.320 $ de ingresos por envíos generados vía la API en los últimos 30 días. Se recalcula a diario.
  - Si los ingresos vía la API son bajos, **la cuota puede ser menor que la inicial**. Hay que diseñar con un presupuesto de llamadas configurable.
- Una llamada a GetItems con 10 ASIN = 1 transacción. **Agrupar siempre por lotes de 10.**
- Errores: `ThrottleException` (con `serviceCode` y `quotaCode`), `UnauthorizedException` (`TokenExpired`, `InvalidToken`…), `ValidationException` (`InvalidPartnerTag`, `InvalidAssociate`…), `AccessDeniedException` (`AssociateNotEligible`…), `ResourceNotFoundException`, `InternalServerException`.
  - Solo se reintenta (con backoff) ante throttling y errores 5xx. Con `TokenExpired` se renueva el token una vez. El resto de errores no se reintentan y se registran.

**Presupuesto estimado** por escaneo diario: temáticas × (nodos + bloques de palabras clave) × páginas, más los GetItems de recomprobación (lotes de 10). Con 1 TPS, en un Worker hay que **serializar las llamadas** (cola o bucle con espera) y vigilar el límite de tiempo de CPU/duración del cron.

## 7. Normas de uso relevantes

- La doc oficial dice que las aplicaciones deben **dirigir ventas a Amazon**; las que no cumplan los términos pierden el acceso.
- **No se ha podido confirmar** en la documentación oficial una regla concreta de caché de precios (*"24 horas"*). Los 24 h aparecen en fuentes de terceros. Mantenemos la caducidad de 24 h de la spec como **política propia conservadora** y mostramos siempre la fecha y hora de consulta. Hay que verificarlo en el *Creators API License Agreement* de amazon.es.
- Imágenes: no se ha encontrado la cláusula concreta. Mientras tanto, **no se almacenan copias** (sin R2 para imágenes de producto) y se usa la URL de la API.

## 8. Decisión para el proyecto

- Se diseña `ProductProvider` alineado con este modelo, pero **sin acoplar el dominio a los nombres de la API**. El dominio usa un `ProductSnapshot` propio y el `CreatorsApiProvider` traduce.
- El `MockProvider` devuelve fixtures con **la forma de la respuesta de la Creators API** (§5) y pasa por el mismo mapper. Así, el día que haya credenciales, solo cambia el transporte.
- La fase 2 empieza por un *spike*: obtener el token, hacer un GetItems de 1 ASIN en amazon.es y guardar la respuesta real como fixture para contrastar este documento.
