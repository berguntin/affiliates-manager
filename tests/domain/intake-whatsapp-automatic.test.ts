import { describe, expect, it } from 'vitest'
import { queuedCard } from '../../server/domain/intake'

const base = {
  channelName: 'Chollos WA',
  channelType: 'whatsapp' as const,
  status: 'candidata',
  needsReview: false,
  reviewReason: null,
  scheduledAt: null,
  publishedAt: null,
  error: null,
}
const opts = { formatTime: () => '10:10', nextCycle: 0, panelUrl: null }
const info = { title: 'Producto', themeName: 'Tech', priceCents: 1999 }

describe('queuedCard with WhatsApp channels', () => {
  it('offers publish and schedule buttons when WhatsApp is automatic', () => {
    const { keyboard } = queuedCard(info, [{ ...base, id: 'p1', automatic: true }], opts)
    const labels = keyboard.flat().map((b) => b.text)
    expect(labels.some((l) => l.startsWith('🚀'))).toBe(true)
    expect(labels.some((l) => l.startsWith('📋'))).toBe(false)
  })

  it('keeps the assisted buttons when WhatsApp is not automatic', () => {
    const { keyboard } = queuedCard(info, [{ ...base, id: 'p1' }], opts)
    const labels = keyboard.flat().map((b) => b.text)
    expect(labels.some((l) => l.startsWith('📋'))).toBe(true)
    expect(labels.some((l) => l.startsWith('🚀'))).toBe(false)
  })
})
