import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { QUEUE_TICK_MINUTES, alignToTick, nextTick } from '../../shared/queue-cycle'

const at = (h: number, m: number, s = 0) => Date.UTC(2026, 9, 12, h, m, s)

describe('ciclo de la cola', () => {
  it('ajusta una hora al ciclo en el que se publicará', () => {
    expect(alignToTick(at(13, 55))).toBe(at(14, 0))
    expect(alignToTick(at(14, 0))).toBe(at(14, 0))
    expect(alignToTick(at(14, 0, 1))).toBe(at(14, 10))
  })

  it('el próximo ciclo es siempre posterior a ahora', () => {
    expect(nextTick(at(13, 55))).toBe(at(14, 0))
    expect(nextTick(at(14, 0))).toBe(at(14, 10))
  })

  it('coincide con los Cron Triggers y las tareas de Nitro', () => {
    const cron = `*/${QUEUE_TICK_MINUTES} * * * *`
    expect(readFileSync('wrangler.jsonc', 'utf8')).toContain(`"${cron}"`)
    expect(readFileSync('nuxt.config.ts', 'utf8')).toContain(`'${cron}': ['queue:tick']`)
  })
})
