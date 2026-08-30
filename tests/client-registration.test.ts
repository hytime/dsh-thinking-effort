import { describe, expect, it, vi } from 'vitest'

import { apply, inject, name } from '../src/client/index.js'
import { LOCALE_NS } from '../src/client/constants.js'

function createHarness(mode: 'modern' | 'legacy') {
  const injected: string[][] = []
  const registrations: Array<{ descriptor: Record<string, unknown>; render: unknown }> = []
  const disposed: string[] = []
  const addLanguage = vi.fn((entry: { id: string }) => () => disposed.push(entry.id))
  const register = vi.fn(() => () => disposed.push('dictionary'))
  const locale = {
    register,
    addLanguage,
    bind: () => (key: string) => key,
    getSnapshot: () => ({ active: 'zh', locales: [{ id: 'zh' }] }),
  }
  const slots = {
    inject: vi.fn((_name: string, callback: () => void) => callback()),
    register: vi.fn((descriptor: Record<string, unknown>, render: unknown) => {
      registrations.push({ descriptor, render })
      return () => disposed.push('slot')
    }),
  }
  const remoteSettings = {
    describe: vi.fn().mockResolvedValue({ ok: true, value: { namespaces: [] } }),
    mutate: vi.fn().mockResolvedValue({ ok: true, value: { namespaces: [] } }),
  }
  const legacySettings = {
    describe: vi.fn().mockResolvedValue({ result: { ok: true, value: { namespaces: [] } } }),
    mutate: vi.fn().mockResolvedValue({ result: { ok: true, value: { namespaces: [] } } }),
  }
  const connection = mode === 'legacy' ? { api: { settings: legacySettings } } : {}
  let effectDisposer: (() => void) | undefined
  const context = {
    get: vi.fn((key: string) => ({ slots, connection, locale }[key as 'slots' | 'connection' | 'locale'])),
    effect: vi.fn((callback: () => void | (() => void)) => {
      effectDisposer = callback() as (() => void) | undefined
      return effectDisposer
    }),
    inject: vi.fn((names: string[], callback: (remoteContext: { get: (key: string) => unknown }) => void) => {
      injected.push(names)
      if (mode === 'modern') callback({ get: (key) => key === 'remote.settings' ? remoteSettings : undefined })
    }),
  }

  return { context, slots, locale, injected, registrations, disposed, addLanguage, register, remoteSettings, legacySettings, disposeEffect: () => effectDisposer?.() }
}

describe('client registration', () => {
  it('exports the scoped identity and exact hard injection list', () => {
    expect(name).toBe('@hytime/dsh-thinking-effort')
    expect(inject).toEqual(['slots', 'connection', 'locale'])
  })

  it('lazily requests remote.settings and registers the expected settings slot', () => {
    const harness = createHarness('modern')
    apply(harness.context)

    expect(harness.context.inject).toHaveBeenCalledWith(['remote.settings'], expect.any(Function))
    expect(harness.slots.inject).toHaveBeenCalledWith('settings.section', expect.any(Function))
    expect(harness.registrations).toHaveLength(1)
    expect(harness.registrations[0]?.descriptor).toMatchObject({
      name: 'settings.section',
      id: 'thinking-effort',
      order: 12,
      locale: LOCALE_NS,
    })
    expect(harness.remoteSettings.describe).not.toHaveBeenCalled()
  })

  it('keeps legacy fallback active and does not replace the first successful mount', () => {
    const harness = createHarness('legacy')
    apply(harness.context)

    expect(harness.context.inject).toHaveBeenCalledWith(['remote.settings'], expect.any(Function))
    expect(harness.registrations).toHaveLength(1)
    expect(harness.legacySettings.describe).not.toHaveBeenCalled()
  })

  it('disposes dictionaries and externally registered languages', () => {
    const harness = createHarness('modern')
    apply(harness.context)

    expect(harness.register).toHaveBeenCalledWith(LOCALE_NS, expect.objectContaining({ zh: expect.any(Object), en: expect.any(Object), ja: expect.any(Object), ko: expect.any(Object) }))
    expect(harness.addLanguage).toHaveBeenCalledTimes(2)
    expect(harness.context.effect).toHaveBeenCalledTimes(1)
    harness.disposeEffect()
    expect(harness.disposed).toEqual(['ko', 'ja', 'dictionary'])
  })
})
