import { describe, expect, it, vi } from 'vitest'

import { apply } from '../src/index.ts'

type SettingsSection = Record<string, unknown> | undefined

type HarnessOptions = {
  writable?: boolean
  section?: SettingsSection
  descriptors?: Array<Record<string, unknown>>
  rejectUpdates?: number
  pendingUpdate?: boolean
}

function createHarness(options: HarnessOptions = {}) {
  let section = options.section
  let descriptors = options.descriptors ?? []
  let rejectsLeft = options.rejectUpdates ?? 0
  let pendingUpdateResolve: (() => void) | undefined
  let pendingUpdateReject: ((error: Error) => void) | undefined
  const updates: Array<{ ns: string; value: Record<string, unknown> }> = []
  const scheduled: Array<{ callback: () => void; delay: number }> = []
  const listeners: Array<{ name: string; callback: (...args: any[]) => unknown; options?: unknown }> = []
  let effectCleanup: (() => void) | undefined
  const ctx = {
    settings: {
      writable: options.writable ?? true,
      get: (_ns: string) => section,
      update: async (ns: string, value: Record<string, unknown>) => {
        updates.push({ ns, value })
        if (options.pendingUpdate === true) {
          await new Promise<void>((resolve, reject) => {
            pendingUpdateResolve = resolve
            pendingUpdateReject = reject
          })
        }
        if (rejectsLeft > 0) {
          rejectsLeft -= 1
          throw new Error('update unavailable')
        }
        section = { ...(section ?? {}), ...value
        }
      },
      describe: () => descriptors,
    },
    timeout: (callback: () => void, delay: number) => {
      scheduled.push({ callback, delay })
      return () => {}
    },
    on: (name: string, callback: (...args: any[]) => unknown, options?: unknown) => {
      listeners.push({ name, callback, options })
      return () => {}
    },
    effect: (callback: () => void | (() => void)) => {
      effectCleanup = callback() as (() => void) | undefined
      return effectCleanup
    },
  }

  apply(ctx)

  return {
    context: ctx,
    setSection(next: SettingsSection) {
      section = next
    },
    setDescriptors(next: Array<Record<string, unknown>>) {
      descriptors = next
    },
    listener(name: string) {
      return listeners.find((entry) => entry.name === name)
    },
    updates,
    scheduled,
    dispose() {
      effectCleanup?.()
    },
    resolvePendingUpdate() {
      pendingUpdateResolve?.()
    },
    rejectPendingUpdate(error: Error) {
      pendingUpdateReject?.(error)
    },
    async runScheduled(index = 0) {
      const task = scheduled[index]
      if (!task) throw new Error(`missing scheduled task ${index}`)
      await task.callback()
      await Promise.resolve()
      await Promise.resolve()
    },
  }
}

const defaults = { off: null, high: 'high', max: 'max' }

async function runInitial(harness: ReturnType<typeof createHarness>) {
  expect(harness.scheduled[0]?.delay).toBe(500)
  await harness.runScheduled(0)
}

describe('Host composition', () => {
  it('registers the agent request hook as a global listener', () => {
    const harness = createHarness({ writable: false })

    expect(harness.listener('agent/request')?.options).toEqual({ global: true })
  })

  it('reads subagent effort after the settings namespace registers', async () => {
    const harness = createHarness({
      writable: false,
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'max' } }],
    })
    const next = vi.fn(async () => ({ provider: 'provider', model: 'model' }))

    const result = await harness.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      next,
    )

    expect(result).toEqual({ provider: 'provider', model: 'model', reasoningEffort: 'max' })
  })

  it('does not update a read-only settings service', async () => {
    const harness = createHarness({
      writable: false,
      section: { providers: { route: { models: [{ id: 'model' }] } } },
    })

    await runInitial(harness)

    expect(harness.updates).toEqual([])
  })

  it('fills models and model overrides while preserving fields and order', async () => {
    const models = [
      { id: 'first', label: 'keep me' },
      { id: 'explicit-null', reasoningEfforts: null, custom: true },
      null,
      'unchanged',
      { id: 'explicit', reasoningEfforts: { low: 'lo' }, extra: 42 },
    ]
    const modelOverrides = {
      first: { id: 'first-override', family: 'keep' },
      'explicit-null': { reasoningEfforts: null },
      scalar: 'unchanged',
    }
    const harness = createHarness({
      section: {
        topLevel: 'preserve',
        providers: {
          route: {
            providerField: true,
            models,
            modelOverrides,
          },
        },
      },
    })

    await runInitial(harness)

    expect(harness.updates).toHaveLength(1)
    expect(harness.updates[0]).toEqual({
      ns: 'llm-pi-ai',
      value: {
        providers: {
          route: {
            providerField: true,
            models: [
              { id: 'first', label: 'keep me', reasoningEfforts: defaults },
              models[1],
              models[2],
              models[3],
              models[4],
            ],
            modelOverrides: {
              first: { id: 'first-override', family: 'keep', reasoningEfforts: defaults },
              'explicit-null': modelOverrides['explicit-null'],
              scalar: modelOverrides.scalar,
            },
          },
        },
      },
    })
  })

  it('preserves a "__proto__" provider key while filling defaults', async () => {
    const section = JSON.parse('{"providers":{"__proto__":{"models":[{"id":"model"}]}}}') as SettingsSection
    const harness = createHarness({ section })

    await runInitial(harness)

    expect(harness.updates).toHaveLength(1)
    const providers = harness.updates[0]?.value.providers as Record<string, any>
    expect(Object.keys(providers)).toEqual(['__proto__'])
    expect(Object.prototype.hasOwnProperty.call(providers, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(providers)).toBe(Object.prototype)
    expect(providers.__proto__).toEqual({
      models: [{ id: 'model', reasoningEfforts: defaults }],
    })
  })

  it('preserves a "__proto__" model override key while filling defaults', async () => {
    const section = JSON.parse(
      '{"providers":{"route":{"modelOverrides":{"__proto__":{"id":"model"}}}}}',
    ) as SettingsSection
    const harness = createHarness({ section })

    await runInitial(harness)

    expect(harness.updates).toHaveLength(1)
    const providers = harness.updates[0]?.value.providers as Record<string, any>
    const overrides = providers.route.modelOverrides as Record<string, any>
    expect(Object.keys(overrides)).toEqual(['__proto__'])
    expect(Object.prototype.hasOwnProperty.call(overrides, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(overrides)).toBe(Object.prototype)
    expect(overrides.__proto__).toEqual({ id: 'model', reasoningEfforts: defaults })
  })

  it('is idempotent after defaults have been filled', async () => {
    const harness = createHarness({
      section: { providers: { route: { models: [{ id: 'model' }] } } },
    })

    await runInitial(harness)
    const retry = harness.scheduled.findIndex((task) => task.delay === 2000)
    expect(retry).toBe(-1)
    await harness.runScheduled(0)

    expect(harness.updates).toHaveLength(1)
  })

  it('only responds to llm-pi-ai settings updates', async () => {
    const harness = createHarness({
      section: { providers: { route: { models: [{ id: 'model' }] } } },
    })
    const listener = harness.listener('settings/updated')

    await listener?.callback('other-namespace')
    expect(harness.updates).toEqual([])

    await listener?.callback('llm-pi-ai')
    await Promise.resolve()
    await Promise.resolve()
    expect(harness.updates).toHaveLength(1)
  })

  it('retries after a late namespace becomes available', async () => {
    const harness = createHarness()

    await runInitial(harness)
    expect(harness.scheduled[1]?.delay).toBe(2000)

    harness.setSection({ providers: { route: { models: [{ id: 'late-model' }] } } })
    await harness.runScheduled(1)

    expect(harness.updates).toHaveLength(1)
  })

  it('does not retry or surface a rejected update after disposal', async () => {
    const harness = createHarness({
      pendingUpdate: true,
      section: { providers: { route: { models: [{ id: 'model' }] } } },
    })

    await harness.runScheduled(0)
    expect(harness.updates).toHaveLength(1)
    harness.dispose()
    harness.rejectPendingUpdate(new Error('disposed update'))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.scheduled.filter((task) => task.delay === 2000)).toHaveLength(0)
  })
  it('logs rejected updates and continues retrying', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const harness = createHarness({
      rejectUpdates: 1,
      section: { providers: { route: { models: [{ id: 'model' }] } } },
    })

    try {
      await runInitial(harness)
      expect(harness.scheduled[1]?.delay).toBe(2000)
      await harness.runScheduled(1)
      expect(harness.updates).toHaveLength(2)
      expect(log).toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })
})

describe('subagent request hook', () => {
  it('ignores inherited provider configuration', async () => {
    const inheritedProviders = Object.create({
      route: { models: [{ id: 'model', reasoningEfforts: { high: 'ultra' } }] },
    }) as Record<string, unknown>
    const harness = createHarness({
      writable: false,
      section: { providers: inheritedProviders },
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'ultra' } }],
    })
    const config = { provider: 'route', model: 'model' }

    const result = await harness.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => config,
    )

    expect(result).toBe(config)
  })

  it('ignores inherited model override configuration', async () => {
    const inheritedOverrides = Object.create({
      model: { reasoningEfforts: { high: 'ultra' } },
    }) as Record<string, unknown>
    const harness = createHarness({
      writable: false,
      section: { providers: { route: { modelOverrides: inheritedOverrides } } },
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'ultra' } }],
    })
    const config = { provider: 'route', model: 'model' }

    const result = await harness.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => config,
    )

    expect(result).toBe(config)
  })

  it('maps standard levels directly and custom wire values back to levels', async () => {
    const standard = createHarness({
      writable: false,
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'xhigh' } }],
    })
    const standardResult = await standard.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => ({ provider: 'route', model: 'model' }),
    )
    expect((standardResult as Record<string, unknown>)?.reasoningEffort).toBe('xhigh')

    const custom = createHarness({
      writable: false,
      section: {
        providers: { route: { models: [{ id: 'model', reasoningEfforts: { high: 'ultra' } }] } },
      },
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'ultra' } }],
    })
    const customResult = await custom.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => ({ provider: 'route', model: 'model' }),
    )
    expect((customResult as Record<string, unknown>)?.reasoningEffort).toBe('high')
  })

  it('leaves the config unchanged for main agents, missing headers, or explicit effort', async () => {
    const harness = createHarness({
      writable: false,
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'max' } }],
    })
    const mainConfig = { provider: 'route', model: 'model' }
    const missingHeaderConfig = { provider: 'route', model: 'model' }
    const explicitConfig = { provider: 'route', model: 'model', reasoningEffort: 'low' }
    const listener = harness.listener('agent/request')

    await expect(listener?.callback(
      { agent: { session: { header: { origin: 'main' } } } },
      async () => mainConfig,
    )).resolves.toBe(mainConfig)
    await expect(listener?.callback({ agent: { session: {} } }, async () => missingHeaderConfig))
      .resolves.toBe(missingHeaderConfig)
    await expect(listener?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => explicitConfig,
    )).resolves.toBe(explicitConfig)
  })

  it('awaits next before handling and does not swallow downstream errors', async () => {
    const harness = createHarness({ writable: false })
    const events: string[] = []
    const listener = harness.listener('agent/request')

    const result = await listener?.callback(
      { agent: { session: { header: { origin: 'main' } } } },
      async () => {
        events.push('next')
        return { provider: 'route', model: 'model' }
      },
    )
    events.push('handler')
    expect(result).toEqual({ provider: 'route', model: 'model' })
    expect(events).toEqual(['next', 'handler'])

    const error = new Error('downstream failure')
    await expect(listener?.callback({}, async () => {
      throw error
    })).rejects.toBe(error)
  })
})
