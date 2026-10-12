import type { MessageFormat } from '../../../shared/types'

/** Plantillas por defecto. Los avisos legales se añaden siempre aparte. */
export const DEFAULT_TEMPLATES: Record<MessageFormat, string> = {
  'telegram-html': `{{#entradilla}}{{entradilla}}

{{/entradilla}}{{#oferta_flash}}⚡ <b>{{oferta_flash}}</b>
{{/oferta_flash}}🛍️ <b>{{titulo}}</b>
{{#marca}}🏷️ {{marca}}
{{/marca}}{{#descuento}}🔻 <b>-{{descuento}}%</b>{{#precio_anterior}} (antes {{precio_anterior}}){{/precio_anterior}}{{#pvp_recomendado}} (PVP rec. {{pvp_recomendado}}){{/pvp_recomendado}}
{{/descuento}}{{#nota}}
{{nota}}
{{/nota}}
{{bloque_precio}}

👉 {{enlace}}`,
  whatsapp: `{{#entradilla}}{{entradilla}}

{{/entradilla}}{{#oferta_flash}}⚡ *{{oferta_flash}}*
{{/oferta_flash}}🛍️ *{{titulo}}*
{{#marca}}🏷️ {{marca}}
{{/marca}}{{#descuento}}🔻 *-{{descuento}}%*{{#precio_anterior}} (antes {{precio_anterior}}){{/precio_anterior}}{{#pvp_recomendado}} (PVP rec. {{pvp_recomendado}}){{/pvp_recomendado}}
{{/descuento}}{{#nota}}
{{nota}}
{{/nota}}
{{bloque_precio}}

👉 {{enlace}}`,
}
