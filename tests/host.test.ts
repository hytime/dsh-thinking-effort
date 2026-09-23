import { Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { describe, expect, it, vi } from 'vitest'

import { apply } from '../src/index.ts'
import { installOpenCodeSession } from '../src/host/opencode-session.ts'
import { readSubagentEffort, resolveSubagentEffort } from '../src/host/subagent.ts'
import type { SettingsPathOp } from '../src/host/types.ts'
import { OPENCODE_SESSION_NAMESPACE } from '../src/compat/opencode-session.ts'
import { hasModelSourceConflict } from '../src/compat/model-source.ts'

type SettingsSection = Record<string, unknown> | undefined

class MemorySettings extends SettingsProvider {
  readonly doc: Record<string, unknown>

  constructor(ctx: ConstructorParameters<typeof SettingsProvider>[0], options?: { doc?: Record<string, unknown> }) {
    super(ctx)
    this.doc = structuredClone(options?.doc ?? {})
  }

  get writable(): boolean {
    return true
  }

  protected load(): Promise<Record<string, unknown>> {
    return Promise.resolve(structuredClone(this.doc))
  }

  protected persist(ns: SettingsNamespace, section: Record<string, unknown>): Promise<void> {
    this.doc[ns] = structuredClone(section)
    return Promise.resolve()
  }
}

async function bootRealOpenCodeHost(): Promise<{
  ctx: Context
  settingsFiber: Fiber
  consumerFiber: Fiber
}> {
  const ctx = new Context()
  const settingsFiber = ctx.plugin(MemorySettings)
  await settingsFiber.await()
  const consumerFiber = ctx.plugin({
    inject: ['settings'],
    apply: (child: Context) => {
      installOpenCodeSession(child as never)
    },
  })
  await consumerFiber.await()
  return { ctx, settingsFiber, consumerFiber }
}

type HarnessOptions = {
  writable?: boolean
  /**
   * The stored user section. These fixtures read it back as the resolved value
   * too, so a path write and a later read stay in step.
   */
  section?: SettingsSection
  descriptors?: Array<Record<string, unknown>>
  rejectUpdates?: number
  pendingUpdate?: boolean
  /** The Loader entry id the plugin's fiber carries; absent means no fiber. */
  entryId?: string
  /**
   * The user's own layer when it differs from the resolved section a host
   * reports. Omitted means the two are the same fixture.
   */
  user?: SettingsSection
  /** The resolved section a host reports, when it differs from the stored one. */
  resolved?: unknown
  /**
   * Runs before each resolved read, so a fixture can advance the store between
   * two fills the way a user's own write does.
   */
  onRead?: () => void
  /**
   * Report every accepted write as a settings change, the way the live service
   * does at the end of `write()`. Lets a fixture exercise the fill's own
   * re-run, including a host whose write never becomes observable.
   */
  emitChangeOnWrite?: boolean
}

/** One recorded write, tagged with the service method the caller reached. */
type HarnessWrite =
  | { readonly kind: 'update'; readonly ns: string; readonly value: Record<string, unknown> }
  | { readonly kind: 'mutate'; readonly ns: string; readonly ops: readonly SettingsPathOp[] }

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Apply one path op the way the rc.7 … 0.1.6 settings service does. That walk
 * descends plain objects only, so a path reaching an array replaces the array
 * rather than indexing into it: a caller addressing `models.<index>` would
 * corrupt the model list here, which is why the fill addresses an array whole.
 */
function applyPathOp(section: Record<string, unknown>, op: SettingsPathOp): Record<string, unknown> {
  const [head, ...rest] = op.path
  if (head === undefined) {
    if (!isPlainRecord(op.value)) {
      throw new TypeError('settings mutate: setting the section root requires a plain object')
    }
    return { ...op.value }
  }
  if (rest.length === 0) return { ...section, [head]: op.value }
  const child = section[head]
  if (!isPlainRecord(child)) {
    return { ...section, [head]: applyPathOp({}, { ...op, path: rest } as SettingsPathOp) }
  }
  return { ...section, [head]: applyPathOp(child, { ...op, path: rest } as SettingsPathOp) }
}

function createHarness(options: HarnessOptions = {}) {
  let section = options.section
  let descriptors = options.descriptors ?? []
  let rejectsLeft = options.rejectUpdates ?? 0
  const pendingUpdateResolvers: Array<() => void> = []
  const pendingUpdateRejecters: Array<(error: Error) => void> = []
  const writes: HarnessWrite[] = []
  const scheduled: Array<{ callback: () => void; delay: number }> = []
  const listeners: Array<{ name: string; callback: (...args: any[]) => unknown; options?: unknown }> = []
  const cleanups: Array<() => void> = []
  /**
   * The descriptor list the service reports. Without an explicit one, the
   * stored section is the user's own layer — which is the layer a path write
   * draws its values from.
   */
  const describe = (): Array<Record<string, unknown>> => {
    if (options.descriptors !== undefined) return descriptors
    return section === undefined ? [] : [{ ns: 'llm-pi-ai', user: userLayer() }]
  }
  /**
   * The user's own layer of the section. It defaults to the stored section —
   * what a host resolving nothing extra reports — and a fixture whose resolved
   * value differs from the user's own layer supplies it here.
   */
  const userLayer = (): SettingsSection => options.user ?? section
  /**
   * The `get` read, which reports the *resolved* section. It defaults to the
   * stored section; a fixture whose resolved value differs from the user's own
   * layer supplies it.
   */
  const resolved = (): unknown => {
    options.onRead?.()
    return options.resolved ?? section
  }
  /** One write barrier for both methods: a queued or failing write behaves alike. */
  const beforeWrite = async (): Promise<void> => {
    if (options.pendingUpdate === true) {
      await new Promise<void>((resolve, reject) => {
        pendingUpdateResolvers.push(resolve)
        pendingUpdateRejecters.push(reject)
      })
    }
    if (rejectsLeft > 0) {
      rejectsLeft -= 1
      throw new Error('update unavailable')
    }
  }
  /**
   * Announce a landed write the way `write()` does, by the end of which the
   * service has reported the document change. The plugin's own listener is one
   * of the subscribers, so this is what re-triggers a fill.
   */
  const announceWrite = (): void => {
    if (options.emitChangeOnWrite !== true) return
    for (const listener of [...listeners]) {
      if (listener.name === 'settings/updated') listener.callback('llm-pi-ai')
    }
  }
  const ctx = {
    ...(options.entryId === undefined ? {} : { fiber: { entry: { options: { id: options.entryId } } } }),
    settings: {
      writable: options.writable ?? true,
      get: (_ns: string) => resolved(),
      update: async (ns: string, value: Record<string, unknown>) => {
        writes.push({ kind: 'update', ns, value })
        await beforeWrite()
        section = { ...(section ?? {}), ...value }
        announceWrite()
      },
      mutate: async (ns: string, ops: readonly SettingsPathOp[]) => {
        writes.push({ kind: 'mutate', ns, ops })
        await beforeWrite()
        section = ops.reduce(applyPathOp, section ?? {})
        announceWrite()
      },
      describe,
      installSection: (_owner: unknown, _namespace: string, _schema: unknown, _entry: unknown, hooks: { setSource: (source: () => unknown) => void; onChange: () => void }) => {
        hooks.setSource(() => ({}))
        hooks.onChange()
      },
    },
    timeout: (callback: () => void, delay: number) => {
      scheduled.push({ callback, delay })
      return () => {}
    },
    on: (name: string, callback: (...args: any[]) => unknown, options?: unknown) => {
      const listener = { name, callback, options }
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
    effect: (callback: () => void | (() => void)) => {
      const cleanup = callback()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
      return cleanup
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
    writes,
    /** The stored section as every recorded write left it. */
    document: () => section,
    scheduled,
    dispose() {
      for (const cleanup of cleanups.splice(0).reverse()) cleanup()
    },
    resolvePendingUpdate() {
      for (const resolve of pendingUpdateResolvers.splice(0)) resolve()
    },
    rejectPendingUpdate(error: Error) {
      for (const reject of pendingUpdateRejecters.splice(0)) reject(error)
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

async function drainRealStream(ctx: Context, options: Record<string, unknown>): Promise<void> {
  const waterfall = ctx.waterfall.bind(ctx) as unknown as (
    thisArg: unknown,
    name: string,
    value: unknown,
    next: () => AsyncIterable<unknown>,
  ) => AsyncIterable<unknown>
  const stream = waterfall(ctx, 'llm/stream', options, async function* () {
    await fetch('https://provider.test/chat/completions')
    yield 'done'
  })
  for await (const _chunk of stream) { /* consume */ }
}

/**
 * The plugin namespace resolves every owned field with schema defaults, so a
 * stored section always describes the same shape even before the user has
 * written profiles or an auto backup. `createdAt: ''` is the client's
 * "never written" sentinel.
 */
const snapshotDefaults = {
  kind: 'dsh-thinking-effort/config-snapshot',
  version: 1,
  createdAt: '',
  pluginVersion: '',
  sourceProfile: 'unknown',
  sections: {},
}

const openCodeSessionFormatDefaults = {
  mode: 'ses-derive',
  time: 'firstUse',
  template: '',
  expression: '',
  script: '',
  validate: '',
  onInvalid: 'warn',
}

const openCodeSessionUserAgentDefaults = { value: '', providers: {} }

describe('real Settings-backed OpenCode registration', () => {
  it('rejects non-boolean model values through the real Settings schema', async () => {
    const host = await bootRealOpenCodeHost()

    try {
      await expect(host.ctx.settings.mutate(OPENCODE_SESSION_NAMESPACE as SettingsNamespace, [{
        op: 'set',
        path: ['opencodeSession', 'providers', 'opencode-go', 'models', 'deepseek-v4-flash'],
        value: 'true',
      }])).rejects.toThrow()
      expect(host.ctx.settings.describe().find((entry) => entry.ns === OPENCODE_SESSION_NAMESPACE)?.value).toEqual({
        opencodeSession: { providers: {}, format: openCodeSessionFormatDefaults, userAgent: openCodeSessionUserAgentDefaults },
        subagentEffort: '',
        profiles: {},
        autoBackup: snapshotDefaults,
      })
    } finally {
      await host.consumerFiber.dispose()
      await host.settingsFiber.dispose()
    }
  })

  it('describes and mutates the namespace, watches changes, and falls back on provider detach', async () => {
    const originalFetch = globalThis.fetch
    const calls: Array<{ init?: RequestInit }> = []
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      calls.push({ init })
      return new Response('ok')
    }) as typeof fetch
    const host = await bootRealOpenCodeHost()

    try {
      expect(host.ctx.settings.describe().map((entry) => String(entry.ns))).toContain(OPENCODE_SESSION_NAMESPACE)
      await host.ctx.settings.mutate(OPENCODE_SESSION_NAMESPACE as SettingsNamespace, [{
        op: 'set',
        path: ['opencodeSession', 'providers', 'opencode-go', 'models', 'deepseek-v4-flash'],
        value: true,
      }])
      expect(host.ctx.settings.describe().find((entry) => entry.ns === OPENCODE_SESSION_NAMESPACE)?.value).toEqual({
        opencodeSession: {
          providers: {
            'opencode-go': { models: { 'deepseek-v4-flash': true } },
          },
          format: openCodeSessionFormatDefaults,
          userAgent: openCodeSessionUserAgentDefaults,
        },
        subagentEffort: '',
        profiles: {},
        autoBackup: snapshotDefaults,
      })

      await drainRealStream(host.ctx, {
        provider: 'opencode-go',
        model: 'deepseek-v4-flash',
        sessionId: 'real-session',
      })
      expect(new Headers(calls[0]?.init?.headers).get('x-opencode-session')).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)

      await host.settingsFiber.dispose()
      expect(host.ctx.get('settings')).toBeUndefined()
      calls.length = 0
      await drainRealStream(host.ctx, {
        provider: 'opencode-go',
        model: 'deepseek-v4-flash',
        sessionId: 'detached-session',
      })
      expect(new Headers(calls[0]?.init?.headers).has('x-opencode-session')).toBe(false)
    } finally {
      await host.consumerFiber.dispose()
      globalThis.fetch = originalFetch
    }
  })

  it('removes the namespace, watcher, and llm listener when the owner plugin disposes', async () => {
    const originalFetch = globalThis.fetch
    const calls: Array<{ init?: RequestInit }> = []
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      calls.push({ init })
      return new Response('ok')
    }) as typeof fetch
    const host = await bootRealOpenCodeHost()

    try {
      await host.consumerFiber.dispose()
      expect(host.ctx.settings.describe().map((entry) => String(entry.ns))).not.toContain(OPENCODE_SESSION_NAMESPACE)
      await drainRealStream(host.ctx, {
        provider: 'opencode-go',
        model: 'deepseek-v4-flash',
        sessionId: 'disposed-session',
      })
      expect(new Headers(calls[0]?.init?.headers).has('x-opencode-session')).toBe(false)
    } finally {
      await host.settingsFiber.dispose()
      globalThis.fetch = originalFetch
    }
  })
})
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

    expect(harness.writes).toEqual([])
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

    const filledModels = [
      { id: 'first', label: 'keep me', reasoningEfforts: defaults },
      models[1],
      models[2],
      models[3],
      models[4],
    ]
    expect(harness.writes).toEqual([{
      kind: 'mutate',
      ns: 'llm-pi-ai',
      ops: [
        { op: 'set', path: ['providers', 'route', 'models'], value: filledModels },
        {
          op: 'set',
          path: ['providers', 'route', 'modelOverrides', 'first', 'reasoningEfforts'],
          value: defaults,
        },
      ],
    }])
    expect(harness.document()).toEqual({
      topLevel: 'preserve',
      providers: {
        route: {
          providerField: true,
          models: filledModels,
          modelOverrides: {
            first: { id: 'first-override', family: 'keep', reasoningEfforts: defaults },
            'explicit-null': modelOverrides['explicit-null'],
            scalar: modelOverrides.scalar,
          },
        },
      },
    })
  })

  it('preserves a "__proto__" provider key while filling defaults', async () => {
    const section = JSON.parse('{"providers":{"__proto__":{"models":[{"id":"model"}]}}}') as SettingsSection
    const harness = createHarness({ section })

    await runInitial(harness)

    expect(harness.writes).toHaveLength(1)
    const providers = (harness.document() as Record<string, any>).providers
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

    expect(harness.writes).toHaveLength(1)
    const overrides = (harness.document() as Record<string, any>).providers.route.modelOverrides
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

    expect(harness.writes).toHaveLength(1)
  })

  it('only responds to llm-pi-ai settings updates', async () => {
    const harness = createHarness({
      section: { providers: { route: { models: [{ id: 'model' }] } } },
    })
    const listener = harness.listener('settings/updated')

    await listener?.callback('other-namespace')
    expect(harness.writes).toEqual([])

    await listener?.callback('llm-pi-ai')
    await Promise.resolve()
    await Promise.resolve()
    expect(harness.writes).toHaveLength(1)
  })

  it('retries after a late namespace becomes available', async () => {
    const harness = createHarness()

    await runInitial(harness)
    expect(harness.scheduled[1]?.delay).toBe(2000)

    harness.setSection({ providers: { route: { models: [{ id: 'late-model' }] } } })
    await harness.runScheduled(1)

    expect(harness.writes).toHaveLength(1)
  })

  it('keeps retrying while the resolved section reads but the user layer does not', async () => {
    // Under the namespace model the resolved read (`get`) and the user layer
    // read (`describe`) are separate service calls, so a section can resolve
    // before its user layer is available. Every entry then looks unreachable,
    // but that is not a verdict — the layer may still land, and the old chain
    // re-checked for it rather than giving up after the first attempt.
    const harness = createHarness({
      descriptors: [],
      resolved: { providers: { route: { models: [{ id: 'model' }] } } },
    })

    await runInitial(harness)

    expect(harness.writes).toEqual([])
    expect(harness.scheduled.map((task) => task.delay)).toEqual([500, 2000])

    // The retry is what the fill needed: with the layer readable it fills.
    harness.setDescriptors([{
      ns: 'llm-pi-ai',
      user: { providers: { route: { models: [{ id: 'model' }] } } },
    }])
    await harness.runScheduled(1)

    expect(harness.writes).toEqual([{
      kind: 'mutate',
      ns: 'llm-pi-ai',
      ops: [{
        op: 'set',
        path: ['providers', 'route', 'models'],
        value: [{ id: 'model', reasoningEfforts: defaults }],
      }],
    }])
  })

  it('does not retry or surface a rejected update after disposal', async () => {
    const harness = createHarness({
      pendingUpdate: true,
      section: { providers: { route: { models: [{ id: 'model' }] } } },
    })

    await harness.runScheduled(0)
    expect(harness.writes).toHaveLength(1)
    harness.dispose()
    harness.rejectPendingUpdate(new Error('disposed update'))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.scheduled.filter((task) => task.delay === 2000)).toHaveLength(0)
  })
  it('writes one fill when the startup timer and a change event overlap', async () => {
    const harness = createHarness({
      pendingUpdate: true,
      section: { providers: { route: { models: [{ id: 'model' }] } } },
    })

    // The startup timer fires and its write is still queued when a change
    // event arrives, so both triggers read the same unfilled section. Without
    // single-flighting the fill, both write it and bump the revision twice.
    const initial = harness.runScheduled(0)
    const event = harness.listener('settings/updated')?.callback('llm-pi-ai')
    harness.resolvePendingUpdate()
    await initial
    await event
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.writes).toHaveLength(1)
  })

  it('re-runs the fill for a change that lands while one is in flight', async () => {
    // The user wrote `first` with the fill's help, then adds `second`: two
    // writes separated by the store's own latency gate. The second arrives while
    // the first fill's write is still queued. Dropping that change event — the
    // old behaviour — leaves `second` without defaults until the next restart;
    // the queued run re-reads the section once the racing write has landed.
    let reads = 0
    const harness = createHarness({
      pendingUpdate: true,
      section: { providers: { route: { models: [{ id: 'first' }] } } },
      onRead: () => {
        reads += 1
        if (reads === 2) {
          harness.setSection({ providers: { route: { models: [{ id: 'first' }, { id: 'second' }] } } })
        }
      },
    })

    const initial = harness.runScheduled(0)
    await Promise.resolve()
    await Promise.resolve()
    const event = harness.listener('settings/updated')?.callback('llm-pi-ai')
    harness.resolvePendingUpdate()
    await initial
    await event
    for (let turn = 0; turn < 6; turn += 1) await Promise.resolve()

    // Two reads and two writes: the queued run re-read the section rather than
    // the event being dropped, and its write covers the model the event was
    // raised for.
    expect(reads).toBe(2)
    expect(harness.writes).toHaveLength(2)
    expect(harness.writes[1]).toEqual({
      kind: 'mutate',
      ns: 'llm-pi-ai',
      ops: [{
        op: 'set',
        path: ['providers', 'route', 'models'],
        value: [
          { id: 'first', reasoningEfforts: defaults },
          { id: 'second', reasoningEfforts: defaults },
        ],
      }],
    })
  })

  it('bounds the re-runs of a host whose write never becomes observable', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    let reads = 0
    // Every write raises the change event at the end of `write()`, but the
    // resolved read keeps reporting the same unfilled model no matter how many
    // writes land. A healthy host converges on the second pass; this one would
    // re-trigger itself forever, so the pass budget is what stops it.
    const harness = createHarness({
      section: { providers: { route: { models: [{ id: 'model' }] } } },
      resolved: { providers: { route: { models: [{ id: 'model' }] } } },
      emitChangeOnWrite: true,
      onRead: () => { reads += 1 },
    })

    try {
      await runInitial(harness)
      for (let turn = 0; turn < 20; turn += 1) await Promise.resolve()

      expect(reads).toBe(5)
      expect(harness.writes).toHaveLength(5)
      // The fill's own verdict is `filled`, so no retry is scheduled either.
      expect(harness.scheduled.map((task) => task.delay)).toEqual([500])
      const lines = log.mock.calls.map((call) => call.join(' '))
      expect(lines.some((line) => line.includes('stopped the fill after 5 passes'))).toBe(true)
    } finally {
      log.mockRestore()
    }
  })

  it('stops retrying when every missing model comes from a lower settings layer', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    // The descriptor's resolved value carries a model list the stored section
    // does not have: the shape a composition base or a schema default gives a
    // live host. Nothing can be written for it, so a retry would re-read the
    // same section and reach the same verdict.
    const harness = createHarness({
      section: {},
      resolved: { providers: { base: { models: [{ id: 'base-only' }] } } },
    })

    try {
      await runInitial(harness)

      expect(harness.writes).toEqual([])
      // The startup timer only; the retry chain stops at the first verdict.
      expect(harness.scheduled.map((task) => task.delay)).toEqual([500])
      const lines = log.mock.calls.map((call) => call.join(' '))
      expect(lines.some((line) => line.includes('left 1 model(s) unfilled'))).toBe(true)
    } finally {
      log.mockRestore()
    }
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
      expect(harness.writes).toHaveLength(2)
      expect(log).toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })
})

describe('subagent effort section read order', () => {
  const own = (user: unknown) => ({ ns: 'thinking-effort', user })
  const legacy = (user: unknown) => ({ ns: 'llm-pi-ai', user })

  it('reads the plugin section first, so it wins when both locations are set', () => {
    const settings = { describe: () => [own({ subagentEffort: 'high' }), legacy({ subagentEffort: 'max' })] }

    expect(readSubagentEffort(settings as never, () => {}, 'thinking-effort')).toBe('high')
  })

  it('falls back to the legacy llm-pi-ai location the older releases wrote to', () => {
    const missing = { describe: () => [legacy({ subagentEffort: 'max' })] }
    expect(readSubagentEffort(missing as never, () => {}, 'thinking-effort')).toBe('max')

    // An empty string is "unset", not a stored value, so the legacy setting still wins.
    const empty = { describe: () => [own({ subagentEffort: '' }), legacy({ subagentEffort: 'max' })] }
    expect(readSubagentEffort(empty as never, () => {}, 'thinking-effort')).toBe('max')
  })

  it('keeps the legacy read when the plugin section is present but unreadable', () => {
    const settings = { describe: () => [own('not-a-user-layer'), legacy({ subagentEffort: 'off' })] }
    expect(readSubagentEffort(settings as never, () => {}, 'thinking-effort')).toBe('off')
    expect(readSubagentEffort({ describe: () => [] } as never, () => {}, 'thinking-effort')).toBeUndefined()
    expect(readSubagentEffort(undefined)).toBeUndefined()
  })

  it('resolves a custom wire value from the plugin section through the provider model', () => {
    const settings = {
      describe: () => [own({ subagentEffort: 'ultra' })],
      get: () => ({ providers: { route: { models: [{ id: 'model', reasoningEfforts: { high: 'ultra' } }] } } }),
    }

    expect(resolveSubagentEffort(
      settings as never,
      { provider: 'route', model: 'model' },
      () => {},
      'thinking-effort',
    )).toBe('high')
  })

  it('leaves an unmapped custom wire value alone and logs why', () => {
    const log = vi.fn()
    const settings = {
      describe: () => [own({ subagentEffort: 'ultra' })],
      get: () => ({ providers: { route: { models: [{ id: 'model', reasoningEfforts: { high: 'high' } }] } } }),
    }

    expect(resolveSubagentEffort(
      settings as never,
      { provider: 'route', model: 'model' },
      log,
      'thinking-effort',
    )).toBeUndefined()
    expect(log).toHaveBeenCalledWith('subagent custom effort is not mapped for', 'route/model')
  })

  it('addresses the plugin section by the live Loader entry id', async () => {
    const harness = createHarness({
      writable: false,
      entryId: 'thinking-effort',
      descriptors: [own({ subagentEffort: 'max' }), legacy({ subagentEffort: 'off' })],
    })

    const result = await harness.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => ({ provider: 'provider', model: 'model' }),
    )

    expect(result).toEqual({ provider: 'provider', model: 'model', reasoningEffort: 'max' })
  })

  it('follows a renamed Loader entry id rather than the compiled default', async () => {
    const harness = createHarness({
      writable: false,
      entryId: 'renamed-entry',
      descriptors: [{ ns: 'renamed-entry', user: { subagentEffort: 'low' } }, legacy({ subagentEffort: 'max' })],
    })

    const result = await harness.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => ({ provider: 'provider', model: 'model' }),
    )

    expect(result).toEqual({ provider: 'provider', model: 'model', reasoningEffort: 'low' })
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

  it('fails closed for model source conflict between models[] and modelOverrides', async () => {
    const harness = createHarness({
      writable: false,
      section: {
        providers: {
          route: {
            models: [{ id: 'model', reasoningEfforts: { high: 'from-models' } }],
            modelOverrides: { model: { reasoningEfforts: { high: 'from-overrides' } } },
          },
        },
      },
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'from-models' } }],
    })
    const config = { provider: 'route', model: 'model' }

    const result = await harness.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => config,
    )

    expect(result).toBe(config)
  })

  it('keeps normal model lookup when modelOverrides is empty', async () => {
    const harness = createHarness({
      writable: false,
      section: { providers: { route: { models: [{ id: 'model', reasoningEfforts: { high: 'ultra' } }], modelOverrides: {} } } },
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'ultra' } }],
    })
    const config = { provider: 'route', model: 'model' }

    const result = await harness.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => config,
    )

    expect(result).toEqual({ ...config, reasoningEffort: 'high' })
  })

  it('fails closed for an own __proto__ model override key', async () => {
    const section = JSON.parse('{"providers":{"route":{"models":[{"id":"__proto__","reasoningEfforts":{"high":"from-models"}}],"modelOverrides":{"__proto__":{"reasoningEfforts":{"high":"from-overrides"}}}}}}') as SettingsSection
    expect(hasModelSourceConflict((section as Record<string, any>).providers.route)).toBe(true)
    const harness = createHarness({
      writable: false,
      section,
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'from-models' } }],
    })
    const config = { provider: 'route', model: '__proto__' }

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
