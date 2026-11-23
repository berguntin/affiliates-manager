import { describe, expect, it } from 'vitest'
import { UNCERTAIN_DELIVERY_REASON } from '../../shared/api'
import { UncertainDeliveryError } from '../../server/channels/types'
import {
  MAX_PUBLISH_PER_TICK,
  WHATSAPP_STALE_SCHEDULE_MS,
  assertPublishIntent,
  planDuePublications,
  sendFailure,
} from '../../server/services/queue'

const NOW = Date.UTC(2026, 10, 23, 10, 10)
const env = { WHATSAPP_GATEWAY_TOKEN: 'TOKEN' }
const wa = (id: string, scheduledAt: number, identifier = '120363171744447809@newsletter') => ({
  id,
  scheduledAt,
  channelType: 'whatsapp' as const,
  channelIdentifier: identifier,
})
const tg = (id: string, scheduledAt: number) => ({ id, scheduledAt, channelType: 'telegram' as const, channelIdentifier: '@canal' })

describe('planDuePublications', () => {
  it('leaves WhatsApp reminders alone without the gateway token', () => {
    const plan = planDuePublications([wa('w1', NOW), tg('t1', NOW)], {}, NOW)
    expect(plan).toEqual({ send: ['t1'], stale: [], deferred: 0 })
  })

  it('sends due WhatsApp publications with the token and a gateway channel id', () => {
    const plan = planDuePublications([wa('w1', NOW - 60_000), tg('t1', NOW)], env, NOW)
    expect(plan.send).toEqual(['w1', 't1'])
  })

  it('keeps WhatsApp channels with a share URL assisted even with the token', () => {
    const plan = planDuePublications([wa('w1', NOW, 'https://whatsapp.com/channel/0029Va')], env, NOW)
    expect(plan).toEqual({ send: [], stale: [], deferred: 0 })
  })

  it('never auto-sends old WhatsApp reminders (may have been shared by hand)', () => {
    const old = NOW - WHATSAPP_STALE_SCHEDULE_MS - 1
    const plan = planDuePublications([wa('old', old), wa('fresh', NOW), tg('t-old', old)], env, NOW)
    expect(plan.stale).toEqual(['old'])
    expect(plan.send).toEqual(['t-old', 'fresh'])
  })

  it('bounds the sends per tick, oldest first, and defers the rest', () => {
    const rows = Array.from({ length: MAX_PUBLISH_PER_TICK + 3 }, (_, i) => tg(`t${i}`, NOW - i * 1000))
    const plan = planDuePublications(rows, env, NOW)
    expect(plan.send).toHaveLength(MAX_PUBLISH_PER_TICK)
    expect(plan.send[0]).toBe(`t${MAX_PUBLISH_PER_TICK + 2}`)
    expect(plan.deferred).toBe(3)
  })

  it('treats a WhatsApp item deferred past the stale threshold as stale (never auto-sent late)', () => {
    const old = NOW - WHATSAPP_STALE_SCHEDULE_MS - 1
    const backlog = Array.from({ length: MAX_PUBLISH_PER_TICK }, (_, i) => tg(`t${i}`, old - i))
    const plan = planDuePublications([...backlog, wa('w-late', old)], env, NOW)
    expect(plan.stale).toEqual(['w-late'])
    expect(plan.send).not.toContain('w-late')
  })
})

describe('assertPublishIntent', () => {
  it('never sends when the user only marks a shared message', () => {
    expect(() => assertPublishIntent('automatic', 'mark')).toThrow('Publicar ya')
  })

  it('never marks as published when the user asked to send on an assisted channel', () => {
    expect(() => assertPublishIntent('assisted', 'send')).toThrow('a mano')
  })

  it('accepts matching intents', () => {
    expect(() => assertPublishIntent('automatic', 'send')).not.toThrow()
    expect(() => assertPublishIntent('assisted', 'mark')).not.toThrow()
  })
})

describe('sendFailure', () => {
  it('sends an uncertain delivery to review so it cannot be published again by hand', () => {
    const failure = sendFailure(new UncertainDeliveryError('Pasarela de WhatsApp (502): Bad gateway'))
    expect(failure.update).toEqual({
      error: 'Pasarela de WhatsApp (502): Bad gateway',
      needsReview: true,
      reviewReason: UNCERTAIN_DELIVERY_REASON,
    })
    expect(failure.message).toContain('Puede que se haya enviado')
  })

  it('keeps a refused send publishable, with the error visible', () => {
    const failure = sendFailure(new Error('Pasarela de WhatsApp (401): Need channel authorization'))
    expect(failure.update).toEqual({ error: 'Pasarela de WhatsApp (401): Need channel authorization' })
    expect(failure.message).toBe('No se pudo publicar: Pasarela de WhatsApp (401): Need channel authorization')
  })
})
