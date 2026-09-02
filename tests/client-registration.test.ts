import { describe, expect, it, vi } from 'vitest'

import { apply, inject, name } from '../src/client/index.js'
import { LOCALE_NS } from '../src/client/constants.js'
import { observeTakeoverSettings, resolveTakeoverDescription } from '../src/client/takeover-runtime.js'
import { providerGatewayCompatViewFrom } from '../src/client/model-inventory.js'
import { resolveTakeoverGatewayCompat, resolveTakeoverProviders, takeoverGatewayCompatInputs } from '../src/compat/gateway/resolve.js'
import type { SettingsNamespace } from '../src/client/types.js'

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
    const render = harness.registrations[0]?.render
    const element = (render as () => { props?: { settings?: { describe: () => Promise<unknown> } } })()
    await element.props?.settings?.describe()

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

    expect(harness.remoteSettings.describe.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('passes the resolved takeover snapshot to the settings consumer', async () => {
    const harness = createHarness('modern')
    harness.remoteSettings.describe.mockResolvedValue({
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
          schema: { properties: { providers: { additionalProperties: { properties: { compat: { properties: { supportsDeveloperRole: {}, maxTokensField: {} } } } } } } },
        }],
      },
    })

    apply(harness.context)
    const render = harness.registrations[0]?.render
    const element = (render as () => { props?: Record<string, unknown> })()
    const observed = element.props?.settings as { describe: () => Promise<unknown> }
    await observed.describe()

    const runtime = element.props?.takeoverRuntime as { getSnapshot: () => { providers: readonly string[]; compat: readonly unknown[] } }
    expect(runtime.getSnapshot()).toMatchObject({
      providers: ['local'],
      compat: expect.arrayContaining([expect.objectContaining({ provider: 'local', model: 'model' })]),
    })
  })

  it('clears the runtime snapshot when the mount effect is disposed', () => {
    const harness = createHarness('modern')
    apply(harness.context)
    const render = harness.registrations[0]?.render
    const element = (render as () => { props?: Record<string, unknown> })()
    const runtime = element.props?.takeoverRuntime as { getSnapshot: () => { providers: readonly string[]; compat: readonly unknown[] }; update: (resolution: { providers: readonly string[]; compat: readonly unknown[] }) => void }
    runtime.update({ providers: ['local'], compat: [] })

    harness.disposeEffect()

    expect(runtime.getSnapshot()).toEqual({ providers: [], compat: [] })
  })

  it.each([
    ['rc7 remains unsupported', 'legacy' as const, { properties: { providers: { additionalProperties: { properties: { compat: { properties: {} } } } } } }, [], false],
    ['rc2 accepts the optional takeover', 'legacy' as const, { properties: { providers: { additionalProperties: { properties: { compat: { properties: { supportsDeveloperRole: {}, maxTokensField: {} } } } } } } }, ['local'], true],
    ['alpha3 accepts the optional takeover', 'modern' as const, { properties: { providers: { additionalProperties: { properties: { compat: { properties: { supportsDeveloperRole: {}, maxTokensField: {} } } } } } } }, ['local'], true],
  ])('%s publishes the expected runtime capability result', (_label, profile, schema, expectedProviders, includeTakeover) => {
    const piAiNamespace = {
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
      schema,
    }
    const response = {
      ok: true as const,
      value: {
        namespaces: [
          piAiNamespace,
          ...(includeTakeover ? [{ ns: 'llm-openai-completions', revision: 1, value: { enabled: true, providers: ['local'] } }] : []),
        ],
      },
    }

    expect(resolveTakeoverDescription({ compatibilityProfile: profile }, response).providers).toEqual(expectedProviders)
  })

  it('ignores late descriptions after the observer is disposed', async () => {
    let resolveDescription!: (value: { ok: true; value: { namespaces: [] } }) => void
    const settings = {
      externalLanguages: false,
      compatibilityProfile: 'modern' as const,
      describe: vi.fn(() => new Promise<{ ok: true; value: { namespaces: [] } }>((resolve) => { resolveDescription = resolve })),
      mutate: vi.fn(),
    }
    const onResolution = vi.fn()
    const observed = observeTakeoverSettings(settings, onResolution)
    const pending = observed.describe()
    observed.dispose()
    resolveDescription({ ok: true, value: { namespaces: [] } })
    await pending

    expect(onResolution).not.toHaveBeenCalled()
  })

  it('publishes only the newest overlapping description', async () => {
    const resolvers: Array<(value: { ok: true; value: { namespaces: [] } }) => void> = []
    const settings = {
      externalLanguages: false,
      compatibilityProfile: 'modern' as const,
      describe: vi.fn(() => new Promise<{ ok: true; value: { namespaces: [] } }>((resolve) => { resolvers.push(resolve) })),
      mutate: vi.fn(),
    }
    const onResolution = vi.fn()
    const observed = observeTakeoverSettings(settings, onResolution)
    const first = observed.describe()
    const second = observed.describe()
    resolvers[1]!({ ok: true, value: { namespaces: [] } })
    await second
    resolvers[0]!({ ok: true, value: { namespaces: [] } })
    await first

    expect(onResolution).toHaveBeenCalledTimes(1)
  })

  it('does not describe again after a failed mutation', async () => {
    const settings = {
      externalLanguages: false,
      compatibilityProfile: 'modern' as const,
      describe: vi.fn(),
      mutate: vi.fn().mockResolvedValue({ ok: false as const, error: { message: 'conflict' } }),
    }
    const observed = observeTakeoverSettings(settings, vi.fn())

    await observed.mutate('llm-pi-ai', [], 1)

    expect(settings.describe).not.toHaveBeenCalled()
  })

  it('keeps model-level takeover compat separate instead of projecting the first model', () => {
    const result = resolveTakeoverDescription({ compatibilityProfile: 'modern' }, {
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
                models: [
                  { id: 'first', reasoningEfforts: { high: 'high' }, compat: { maxTokensField: 'max_tokens' } },
                  { id: 'second', reasoningEfforts: { high: 'high' }, compat: { maxTokensField: 'max_completion_tokens' } },
                ],
              },
            },
          },
          schema: { properties: { providers: { additionalProperties: { properties: { compat: { properties: { supportsDeveloperRole: {}, maxTokensField: {} } } } } } } },
        }],
      },
    })

    expect(result.compat).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'local' }),
      expect.objectContaining({ provider: 'local', model: 'first', maxTokensField: { value: 'max_tokens', source: 'model' } }),
      expect.objectContaining({ provider: 'local', model: 'second', maxTokensField: { value: 'max_completion_tokens', source: 'model' } }),
    ]))
    const view = providerGatewayCompatViewFrom({
      value: { providers: { local: { models: [{ id: 'first' }, { id: 'second' }] } } },
      schema: { properties: { providers: { additionalProperties: { properties: { compat: { properties: { supportsDeveloperRole: {}, maxTokensField: {} } } } } } } },
    }, 'local', 'modern', result)
    expect(view.maxTokensField).toBe('auto')
  })

  it('does not publish takeover compatibility when both model sources are present', () => {
    const result = resolveTakeoverDescription({ compatibilityProfile: 'modern' }, {
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
                models: [{ id: 'model', reasoningEfforts: { high: 'high' }, compat: { maxTokensField: 'max_tokens' } }],
                modelOverrides: { model: { reasoningEfforts: { high: 'high' }, compat: { maxTokensField: 'max_completion_tokens' } } },
              },
            },
          },
          schema: { properties: { providers: { additionalProperties: { properties: { compat: { properties: { supportsDeveloperRole: {}, maxTokensField: {} } } } } } } },
        }],
      },
    })

    expect(result).toEqual({ providers: [], compat: [] })
  })

  it('enumerates model overrides when models is an empty array', () => {
    const result = resolveTakeoverDescription({ compatibilityProfile: 'modern' }, {
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
                models: [],
                modelOverrides: {
                  'override-model': {
                    reasoningEfforts: { high: 'high' },
                    compat: { maxTokensField: 'max_completion_tokens' },
                  },
                },
              },
            },
          },
          schema: { properties: { providers: { additionalProperties: { properties: { compat: { properties: { supportsDeveloperRole: {}, maxTokensField: {} } } } } } } },
        }],
      },
    })

    expect(result.providers).toEqual(['local'])
    expect(result.compat).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'local', model: 'override-model', maxTokensField: { value: 'max_completion_tokens', source: 'model' } }),
    ]))
  })

  it('keeps takeover model resolution own-property based and fail closed for malformed entries', () => {
    const inherited = Object.create({ inherited: { compat: { supportsDeveloperRole: true } } }) as Record<string, unknown>
    Object.defineProperty(inherited, '__proto__', {
      configurable: true,
      enumerable: true,
      value: { compat: { maxTokensField: 'max_tokens' } },
      writable: true,
    })
    inherited.malformed = null
    const section = {
      providers: {
        local: {
          compat: { supportsDeveloperRole: false },
          modelOverrides: inherited,
        },
      },
    }

    expect(takeoverGatewayCompatInputs(section, 'local', 'inherited')).toEqual({
      providerCompat: { supportsDeveloperRole: false },
    })
    expect(takeoverGatewayCompatInputs(section, 'local', '__proto__')).toEqual({
      providerCompat: { supportsDeveloperRole: false },
      modelCompat: { maxTokensField: 'max_tokens' },
    })
    expect(takeoverGatewayCompatInputs(section, 'local', 'malformed')).toEqual({
      providerCompat: { supportsDeveloperRole: false },
    })
  })
  it('always schedules a post-mutation describe when an older describe overlaps it', async () => {
    type MutationResult = { ok: true; value: { ns: string; revision: number; value: Record<string, unknown> } }
    type DescriptionResult = { ok: true; value: { namespaces: SettingsNamespace[] } }
    const schema = { properties: { providers: { additionalProperties: { properties: { compat: { properties: { supportsDeveloperRole: {}, maxTokensField: {} } } } } } } }
    const description = (provider: string): DescriptionResult => ({
      ok: true,
      value: {
        namespaces: [{
          ns: 'llm-pi-ai',
          revision: provider === 'old' ? 3 : 4,
          value: { providers: { [provider]: { api: 'openai-completions', baseURL: 'http://gateway.test/v1', compat: { supportsDeveloperRole: provider === 'old' }, models: [{ id: 'model', reasoningEfforts: { high: 'high' }, compat: { maxTokensField: provider === 'old' ? 'max_tokens' : 'max_completion_tokens' } }] } } },
          schema,
        }],
      },
    })
    let resolveMutation!: (value: MutationResult) => void
    const descriptions: Array<(value: DescriptionResult) => void> = []
    const settings = {
      externalLanguages: false,
      compatibilityProfile: 'modern' as const,
      describe: vi.fn(() => new Promise<DescriptionResult>((resolve) => { descriptions.push(resolve) })),
      mutate: vi.fn(() => new Promise<MutationResult>((resolve) => { resolveMutation = resolve })),
    }
    const resolutions: Array<{ providers: readonly string[]; compat: readonly unknown[] }> = []
    const observed = observeTakeoverSettings(settings, (resolution) => resolutions.push(resolution))

    const mutation = observed.mutate('llm-pi-ai', [], 1)
    const overlappingDescribe = observed.describe()
    resolveMutation({ ok: true, value: { ns: 'llm-pi-ai', revision: 2, value: {} } })
    await mutation

    expect(settings.describe).toHaveBeenCalledTimes(2)
    descriptions[0]!(description('old'))
    descriptions[1]!(description('new'))
    await overlappingDescribe
    await Promise.resolve()
    expect(resolutions).toHaveLength(1)
    expect(resolutions[0]).toMatchObject({
      providers: ['new'],
      compat: expect.arrayContaining([
        expect.objectContaining({
          provider: 'new',
          supportsDeveloperRole: { value: false, source: 'provider' },
        }),
        expect.objectContaining({
          provider: 'new',
          model: 'model',
          maxTokensField: { value: 'max_completion_tokens', source: 'model' },
        }),
      ]),
    })
    expect(resolutions[0]?.compat).not.toEqual(expect.arrayContaining([expect.objectContaining({ provider: 'old' })]))
  })

  it('invalidates the previous runtime snapshot when post-mutation describe rejects', async () => {
    let describeCount = 0
    const settings = {
      externalLanguages: false,
      compatibilityProfile: 'modern' as const,
      describe: vi.fn(async () => {
        describeCount += 1
        if (describeCount === 1) {
          return {
            ok: true as const,
            value: {
              namespaces: [{
                ns: 'llm-pi-ai',
                revision: 1,
                value: { providers: { local: { api: 'openai-completions', baseURL: 'http://gateway.test/v1', models: [{ id: 'model', reasoningEfforts: { high: 'high' } }] } } },
                schema: { properties: { providers: { additionalProperties: { properties: { compat: { properties: { supportsDeveloperRole: {}, maxTokensField: {} } } } } } } },
              }],
            },
          }
        }
        throw new Error('describe unavailable')
      }),
      mutate: vi.fn(async () => ({ ok: true as const, value: { ns: 'llm-pi-ai', revision: 2, value: {} } })),
    }
    const resolutions: Array<{ providers: readonly string[]; compat: readonly unknown[] }> = []
    const observed = observeTakeoverSettings(settings, (resolution) => resolutions.push(resolution))

    await observed.describe()
    await observed.mutate('llm-pi-ai', [], 1)
    await Promise.resolve()
    await Promise.resolve()

    expect(resolutions.at(-1)).toEqual({ providers: [], compat: [] })
    observed.dispose()
  })

  it('republishes a valid resolution after a rejected post-mutation describe', async () => {
    let describeCount = 0
    const valid = {
      ok: true as const,
      value: {
        namespaces: [{
          ns: 'llm-pi-ai',
          revision: 1,
          value: { providers: { local: { api: 'openai-completions', baseURL: 'http://gateway.test/v1', models: [{ id: 'model', reasoningEfforts: { high: 'high' } }] } } },
          schema: { properties: { providers: { additionalProperties: { properties: { compat: { properties: { supportsDeveloperRole: {}, maxTokensField: {} } } } } } } },
        }],
      },
    }
    const settings = {
      externalLanguages: false,
      compatibilityProfile: 'modern' as const,
      describe: vi.fn(async () => {
        describeCount += 1
        if (describeCount === 2) throw new Error('describe unavailable')
        return valid
      }),
      mutate: vi.fn(async () => ({ ok: true as const, value: { ns: 'llm-pi-ai', revision: 2, value: {} } })),
    }
    const resolutions: Array<{ providers: readonly string[]; compat: readonly unknown[] }> = []
    const observed = observeTakeoverSettings(settings, (resolution) => resolutions.push(resolution))

    await observed.describe()
    await observed.mutate('llm-pi-ai', [], 1)
    await Promise.resolve()
    await Promise.resolve()
    expect(resolutions.at(-1)).toEqual({ providers: [], compat: [] })

    await observed.describe()

    expect(resolutions.at(-1)).toMatchObject({
      providers: ['local'],
      compat: expect.arrayContaining([expect.objectContaining({ provider: 'local', model: 'model' })]),
    })
    observed.dispose()
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
  })

  it('registers a render factory for the provider compatibility settings surface', () => {
    const harness = createHarness('modern')
    apply(harness.context)

    const render = harness.registrations[0]?.render
    expect(render).toEqual(expect.any(Function))
    const element = (render as () => { props?: Record<string, unknown> })()
    expect(element.props).toEqual(expect.objectContaining({ settings: expect.any(Object), locale: expect.any(Object), t: expect.any(Function) }))
  })

  it('keeps legacy fallback active and does not replace the first successful mount', async () => {
    const harness = createHarness('legacy')
    apply(harness.context)

    expect(harness.context.on).toHaveBeenCalledWith('internal/service', expect.any(Function))
    expect(harness.registrations).toHaveLength(1)
    const render = harness.registrations[0]?.render
    const element = (render as () => { props?: { settings?: { describe: () => Promise<unknown> } } })()
    await element.props?.settings?.describe()
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
