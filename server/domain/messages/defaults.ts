import type { MessageFormat } from '../../../shared/types'

/**
 * Plantillas por defecto: título con el emoji de la temática, gancho, texto
 * propio (con las características, si las hay) y bloque «Antes / Ahora / Ahorro». La línea de avisos
 * («Enlace de afiliado…») se añade siempre aparte.
 */
export const DEFAULT_TEMPLATES: Record<MessageFormat, string> = {
  'telegram-html': `{{#oferta_flash}}⚡ <b>{{oferta_flash}}</b>
{{/oferta_flash}}{{emoji}} <b>{{titulo}}</b>
{{#marca}}🏷️ {{marca}}
{{/marca}}{{#entradilla}}
{{entradilla}}
{{/entradilla}}{{#nota}}
{{nota}}
{{/nota}}
{{#precio_anterior}}💰 Antes: {{precio_anterior}}
{{/precio_anterior}}{{#pvp_recomendado}}💰 PVP recomendado: {{pvp_recomendado}}
{{/pvp_recomendado}}{{#precio}}🔥 Ahora: <b>{{precio}}</b> ({{consultado}})
{{/precio}}{{^precio}}💶 Consulta el precio actual en Amazon.
{{/precio}}{{#descuento}}💸 Ahorro del {{descuento}}%
{{/descuento}}
👉 {{enlace}}`,
  whatsapp: `{{#oferta_flash}}⚡ *{{oferta_flash}}*
{{/oferta_flash}}{{emoji}} *{{titulo}}*
{{#marca}}🏷️ {{marca}}
{{/marca}}{{#entradilla}}
{{entradilla}}
{{/entradilla}}{{#nota}}
{{nota}}
{{/nota}}
{{#precio_anterior}}💰 Antes: {{precio_anterior}}
{{/precio_anterior}}{{#pvp_recomendado}}💰 PVP recomendado: {{pvp_recomendado}}
{{/pvp_recomendado}}{{#precio}}🔥 Ahora: *{{precio}}* ({{consultado}})
{{/precio}}{{^precio}}💶 Consulta el precio actual en Amazon.
{{/precio}}{{#descuento}}💸 Ahorro del {{descuento}}%
{{/descuento}}
👉 {{enlace}}`,
}
