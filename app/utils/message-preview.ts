/**
 * Convierte el texto de un mensaje a HTML seguro para previsualizarlo en el panel.
 * Todo se escapa y solo se restauran las etiquetas de formato permitidas.
 */
export function messageToHtml(text: string, format: 'telegram' | 'whatsapp'): string {
  if (format === 'telegram') {
    // El texto ya es HTML de Telegram: se escapa entero y se reactivan <b>, <i> y los enlaces https.
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return escaped
      .replace(/&lt;(\/?)(b|i)&gt;/g, '<$1$2>')
      .replace(
        /&lt;a href="(https:\/\/[^"\s<>]+)"&gt;(.*?)&lt;\/a&gt;/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="underline">$2</a>',
      )
      .replace(/&amp;(amp|lt|gt);/g, '&$1;')
  }
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$|[.,;:!?)])/g, '$1<b>$2</b>')
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,;:!?)])/g, '$1<i>$2</i>')
}

export function timeLeft(ms: number, now = Date.now()): string {
  const diff = ms - now
  if (diff <= 0) return 'caducada'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}
