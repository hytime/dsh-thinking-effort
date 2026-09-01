import { describe, expect, it, vi } from 'vitest'

import { apply, inject, name } from '../src/client/index.js'
import { LOCALE_NS } from '../src/client/constants.js'
import { resolveTakeoverGatewayCompat, resolveTakeoverProviders } from '../src/compat/gateway/resolve.js'

function createHarness(mode: 'modern' | 'legacy') {
  const listeners: Array<(name: string) => void> = []
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
    get: vi.fn((key: string) => key === 'remote.settings'
      ? mode === 'modern' ? remoteSettings : undefined
      : ({ slots, connection, locale }[key as 'slots' | 'connection' | 'locale'])),
    on: vi.fn((event: string, callback: (name: string) => void) => {
      expect(event).toBe('internal/service')
      listeners.push(callback)
      return () => undefined
    }),
    effect: vi.fn((callback: () => void | (() => void)) => {
      effectDisposer = callback() as (() => void) | undefined
      return effectDisposer
    }),
  }

  return { context, slots, locale, listeners, registrations, disposed, addLanguage, register, remoteSettings, legacySettings, disposeEffect: () => effectDisposer?.() }
}


describe('client registration through the guarded context', () => {
  it('mounts after the remote.settings service is announced without context.inject', () => {
    const registrations: Array<{ descriptor: Record<string, unknown>; render: unknown }> = []
    const listeners: Array<(name: string) => void> = []
    let remoteSettings: unknown
    const slots = {
      inject: vi.fn((_name: string, callback: () => void) => callback()),
      register: vi.fn((descriptor: Record<string, unknown>, render: unknown) => {
        registrations.push({ descriptor, render })
        return () => undefined
      }),
    }
    const locale = {
      register: vi.fn(() => () => undefined),
      bind: () => (key: string) => key,
      getSnapshot: () => ({ locales: [{ id: 'zh' }] }),
    }
    const services: Record<string, unknown> = {
      slots,
      connection: {},
      locale,
    }
    const context = {
      get: vi.fn((key: string) => key === 'remote.settings' ? remoteSettings : services[key]),
      on: vi.fn((event: string, callback: (name: string) => void) => {
        expect(event).toBe('internal/service')
        listeners.push(callback)
        return () => undefined
      }),
      effect: vi.fn((callback: () => void | (() => void)) => callback()),
    }

    apply(context as Parameters<typeof apply>[0])
    expect(registrations).toHaveLength(0)

    remoteSettings = {
      describe: vi.fn(),
      mutate: vi.fn(),
    }
    for (const listener of listeners) listener('remote.settings')

    expect(registrations).toHaveLength(1)
    expect(registrations[0]?.descriptor).toMatchObject({
      name: 'settings.section',
      id: 'thinking-effort',
    })
  })
})

describe('client registration', () => {
  it('resolves takeover capabilities from the mounted settings descriptor', async () => {
    const harness = createHarness('legacy')
    harness.legacySettings.describe.mockResolvedValue({
      result: {
        ok: true,
        value: {
          namespaces: [{
            ns: 'llm-pi-ai',
            revision: 1,
            value: {
              providers: {
                local: {
                  api: 'openai-completions',
                  baseURL: 'http://gateway.test/v1',
                  models: [{ id: 'model', reasoningEfforts: { high: 'high' }, compat: { thinkingFormat: 'qwen', supportsReasoningEffort: true } }],
                },
              },
            },
            schema: { properties: { providers: { additionalProperties: { properties: { compat: { properties: {} } } } } } },
          }],
        },
      },
    })

    apply(harness.context)
    await Promise.resolve()

    expect(harness.legacySettings.describe).toHaveBeenCalled()
  })

  it('re-resolves after the observed settings API describes or mutates', async () => {
    const harness = createHarness('modern')
    apply(harness.context)
    const render = harness.registrations[0]?.render
    const element = (render as () => { props?: { settings?: { describe: () => Promise<unknown>; mutate: (ns: string, ops: readonly unknown[], revision: number) => Promise<unknown> } } })()
    const observed = element.props?.settings
    expect(observed).toBeDefined()

    await observed!.describe()
    await observed!.mutate('llm-pi-ai', [], 1)
    await Promise.resolve()

    expect(harness.remoteSettings.describe.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('uses runtime profile and descriptor schema to fail closed for takeover capability', () => {
    const piAi = {
      providers: {
        local: {
          api: 'openai-completions',
          baseURL: 'http://gateway.test/v1',
          models: [{ id: 'model', reasoningEfforts: { high: 'high' }, compat: { thinkingFormat: 'qwen', supportsReasoningEffort: true } }],
        },
      },
    }
    const oldSchema = { properties: { providers: { additionalProperties: { properties: { compat: { properties: {} } } } } } }
    const fullSchema = { properties: { providers: { additionalProperties: { properties: { compat: { properties: { supportsDeveloperRole: {}, maxTokensField: {} } } } } } } }

    expect(resolveTakeoverProviders({ runtimeProfile: 'legacy', descriptorSchema: oldSchema, piAi })).toEqual([])
    expect(resolveTakeoverProviders({ runtimeProfile: 'legacy', descriptorSchema: fullSchema, piAi })).toEqual(['local'])
    expect(resolveTakeoverGatewayCompat({ runtimeProfile: 'legacy', descriptorSchema: fullSchema, piAi, provider: 'local', model: 'model' })).toMatchObject({
      thinkingFormat: { value: 'qwen', source: 'model' },
      supportsReasoningEffort: { value: true, source: 'model' },
    })
    expect(resolveTakeoverProviders({ runtimeProfile: 'unknown', descriptorSchema: fullSchema, piAi })).toEqual([])
  })

  it('exports the scoped identity and exact hard injection list', () => {
    expect(name).toBe('@hytime/dsh-thinking-effort')
    expect(inject).toEqual(['slots', 'connection', 'locale'])
  })

  it('reads remote.settings and registers the expected settings slot', () => {
    const harness = createHarness('modern')
    apply(harness.context)

    expect(harness.context.get).toHaveBeenCalledWith('remote.settings')
    expect(harness.context.on).toHaveBeenCalledWith('internal/service', expect.any(Function))
    expect(harness.slots.inject).toHaveBeenCalledWith('settings.section', expect.any(Function))
    expect(harness.registrations).toHaveLength(1)
    expect(harness.registrations[0]?.descriptor).toMatchObject({
      name: 'settings.section',
      id: 'thinking-effort',
      order: 12,
      locale: LOCALE_NS,
    })
    expect(harness.remoteSettings.describe).toHaveBeenCalled()
  })

  it('registers a render factory for the provider compatibility settings surface', () => {
    const harness = createHarness('modern')
    apply(harness.context)

    const render = harness.registrations[0]?.render
    expect(render).toEqual(expect.any(Function))
    const element = (render as () => { props?: Record<string, unknown> })()
    expect(element.props).toEqual(expect.objectContaining({ settings: expect.any(Object), locale: expect.any(Object), t: expect.any(Function) }))
  })

  it('keeps legacy fallback active and does not replace the first successful mount', () => {
    const harness = createHarness('legacy')
    apply(harness.context)

    expect(harness.context.on).toHaveBeenCalledWith('internal/service', expect.any(Function))
    expect(harness.registrations).toHaveLength(1)
    expect(harness.legacySettings.describe).toHaveBeenCalled()
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
