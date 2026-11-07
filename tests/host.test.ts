import { Context } from '@deepseek-ai/cordis'
import type { Fiber } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { describe, expect, it, vi } from 'vitest'

import { apply } from '../src/index.ts'
import { installOpenCodeSession } from '@hytime/dsh-feature-opencode'
import { readSubagentEffort, readSubagentModel, resolveSubagentEffort } from '@hytime/dsh-feature-subagent'
import type { SettingsPathOp } from '@hytime/dsh-plugin-kit'
import { OPENCODE_SESSION_NAMESPACE } from '@hytime/dsh-plugin-kit'
import { hasModelSourceConflict } from '@hytime/dsh-plugin-kit'

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
   * The settings model the service presents. A host exposing `installSection`
   * is the `namespace` model (the default here, matching every other fixture);
   * `entry-config` drops it so the probe answers the other way.
   */
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
    // `readSettingsSection` projects the RESOLVED value out of `describe()`, so
    // a descriptor without `value` reads as an absent section and every fill
    // silently does nothing. The resolved and user layers are reported side by
    // side because they answer different questions: `value` is what the fill
    // edits, `user` is what marks a field user-overridden.
    return section === undefined ? [] : [{ ns: 'llm-pi-ai', value: resolved(), user: userLayer() }]
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
      if (listener.name === 'settings/document-updated') listener.callback('llm-pi-ai')
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

/**
 * The resolved `compaction` section of a never-written document.
 *
 * These two assertions compare the WHOLE resolved namespace, so every schema
 * field has to appear here — a new field is a legitimate shape change, not a
 * test to loosen. The values mirror `PLUGIN_SETTINGS_DEFAULTS`; keeping them as
 * literals (rather than importing the schema's defaults) is what makes this
 * test fail when a default moves.
 */
const compactionDefaults = {
  enabled: false,
  thresholdRatio: 0.6,
  retainRatio: 0.16,
  models: {},
}

const subagentModelDefaults = { provider: '', model: '' }

const legacyMigrationDefaults = {
  pending: false,
  candidates: [],
  signature: '',
  dismissedSignature: '',
  decision: '',
  lastResult: '',
  scannedAt: '',
  decidedAt: '',
}

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
        autoFillDefaults: true,
        subagentModel: subagentModelDefaults,
        compaction: compactionDefaults,
        legacyMigration: legacyMigrationDefaults,
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
        autoFillDefaults: true,
        subagentModel: subagentModelDefaults,
        compaction: compactionDefaults,
        legacyMigration: legacyMigrationDefaults,
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

/**
 * Settle the fill the plugin started from its own timer.
 *
 * `installSettingsWatcher` schedules the first fill and calls `void tryOnce()`
 * from the timer callback, so the retry it may schedule lands several awaits
 * later — after the section read, the fill, and the outcome branch. A fixed
 * number of microtask turns does not cover that chain, and `globalThis.setTimeout`
 * would be captured by the harness's injected `ctx.timeout` and pollute the very
 * queue these tests assert on. Racing the recorded timers against a real
 * macrotask lets the chain finish while leaving the harness's queue intact.
 */
async function flushFill(): Promise<void> {
  await new Promise((resolve) => globalThis.setImmediate(resolve))
  await new Promise((resolve) => globalThis.setImmediate(resolve))
}

/** The index of the first queued timer with this delay, or -1. */
function timerIndex(harness: ReturnType<typeof createHarness>, delay: number): number {
  return harness.scheduled.findIndex((task) => task.delay === delay)
}

/**
 * The delays of the fill's own timers, in queue order.
 *
 * Other installs queue timers too — the legacy-migration watcher kicks itself
 * with a 0ms timeout — so a bare `scheduled.map(delay)` mixes unrelated work
 * into an assertion about the fill's retry chain.
 */
function fillTimers(harness: ReturnType<typeof createHarness>): number[] {
  return harness.scheduled.map((task) => task.delay).filter((delay) => delay === 500 || delay === 2000)
}

/**
 * Run the queued timer with this delay.
 *
 * Addressing timers by delay rather than by queue position keeps these tests
 * independent of install order: the legacy-migration watcher queues a 0ms kick
 * of its own, so position 0 is not reliably the startup fill.
 */
async function runTimer(harness: ReturnType<typeof createHarness>, delay: number): Promise<void> {
  const index = timerIndex(harness, delay)
  if (index < 0) throw new Error(`no queued timer at ${delay}ms`)
  await harness.runScheduled(index)
}

async function runInitial(harness: ReturnType<typeof createHarness>) {
  // The fill timer is not necessarily the first queued one: the legacy-migration
  // watcher also schedules a 0ms kick from its own install. Addressing the timer
  // by delay keeps this independent of install order.
  const index = timerIndex(harness, 500)
  expect(index, 'the startup fill timer must be queued at 500ms').toBeGreaterThanOrEqual(0)
  await harness.runScheduled(index)
  await flushFill()
}

describe('Host composition', () => {
  it('registers the agent request hook as a global listener', () => {
    const harness = createHarness({ writable: false })

    expect(harness.listener('agent/request')?.options).toEqual({ global: true })
  })

  it('registers model-selection initialization for hosts that expose agent.model', () => {
    const harness = createHarness({ writable: false })

    expect(harness.listener('agent/created')?.options).toEqual({ global: true })
  })

  it('selects the configured subagent effort before a new-host agent starts', () => {
    const harness = createHarness({
      writable: false,
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'high' }, value: { subagentEffort: 'high' } }],
    })
    const select = vi.fn()
    const agent = {
      session: { header: { origin: 'subagent' } },
      model: {
        current: () => ({ provider: 'provider', model: 'model', reasoningEffort: 'max' }),
        select,
      },
    }

    harness.listener('agent/created')?.callback({ agent })

    expect(select).toHaveBeenCalledWith({ provider: 'provider', model: 'model', reasoningEffort: 'high' })
  })

  it('does not rewrite agent/request effort when the host exposes agent.model', async () => {
    const harness = createHarness({
      writable: false,
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'high' }, value: { subagentEffort: 'high' } }],
    })
    const config = { provider: 'provider', model: 'model', reasoningEffort: 'max' }
    const next = vi.fn(async () => config)
    const agent = {
      session: { header: { origin: 'subagent' } },
      model: {
        current: () => config,
        select: vi.fn(),
      },
    }

    const result = await harness.listener('agent/request')?.callback({ agent }, next)

    expect(result).toBe(config)
    expect(next).toHaveBeenCalledOnce()
  })

  it('reads subagent effort after the settings namespace registers', async () => {
    const harness = createHarness({
      writable: false,
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'max' }, value: { subagentEffort: 'max' } }],
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
    await runTimer(harness, 500)

    expect(harness.writes).toHaveLength(1)
  })

  it('ignores unrelated settings updates', async () => {
    const harness = createHarness({
      section: { providers: { route: { models: [{ id: 'model' }] } } },
    })
    const listener = harness.listener('settings/document-updated')

    await listener?.callback('other-namespace')
    expect(harness.writes).toEqual([])

    await listener?.callback('llm-pi-ai')
    await Promise.resolve()
    await Promise.resolve()
    expect(harness.writes).toHaveLength(1)
  })

  it('disables automatic fills and resumes when the own-section switch is re-enabled', async () => {
    const providers = {
      providers: {
        route: {
          models: [
            { id: 'missing' },
            { id: 'existing', reasoningEfforts: { low: 'low' } },
          ],
        },
      },
    }
    const own = (enabled: boolean) => ({
      ns: 'thinking-effort',
      user: { autoFillDefaults: enabled },
      // Deliberately disagree with the user layer: the explicit user value
      // must win over both schema defaults and composed values.
      value: { autoFillDefaults: !enabled },
    })
    const harness = createHarness({
      entryId: 'thinking-effort',
      section: providers,
      descriptors: [{ ns: 'llm-pi-ai', user: providers, value: providers }, own(false)],
    })

    await runInitial(harness)

    expect(harness.writes).toEqual([])
    expect(harness.document()).toEqual(providers)
    expect(harness.scheduled.some((task) => task.delay === 2000)).toBe(false)

    harness.setDescriptors([{ ns: 'llm-pi-ai', user: providers, value: providers }, own(true)])
    await harness.listener('settings/document-updated')?.callback('thinking-effort')
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.writes).toHaveLength(1)
    expect(harness.writes[0]).toEqual({
      kind: 'mutate',
      ns: 'llm-pi-ai',
      ops: [{
        op: 'set',
        path: ['providers', 'route', 'models'],
        value: [
          { id: 'missing', reasoningEfforts: defaults },
          { id: 'existing', reasoningEfforts: { low: 'low' } },
        ],
      }],
    })
  })

  it('reads the switch from the entry section, never from a leftover namespace', async () => {
    // A profile migrated forward keeps the namespace section it wrote before
    // `0.1.7`, so an entry-config host can carry both sections at once. The
    // switch the running host shows is the entry one; the leftover must not
    // override it, or turning the fill back on would read as off.
    const providers = {
      providers: { route: { models: [{ id: 'missing' }] } },
    }
    const current = { autoFillDefaults: true }
    const leftover = { autoFillDefaults: false }
    const harness = createHarness({
      entryId: 'thinking-effort',
      section: providers,
      descriptors: [
        { ns: 'llm-pi-ai', user: providers, value: providers },
        { ns: 'thinking-effort', user: current, value: current },
        { ns: 'dsh-thinking-effort', user: leftover, value: leftover },
      ],
    })

    await runInitial(harness)

    // The entry section says enabled, so the fill runs despite the leftover.
    expect(harness.writes).toHaveLength(1)
  })

  it('retries after a late namespace becomes available', async () => {
    const harness = createHarness()

    await runInitial(harness)
    expect(timerIndex(harness, 2000), 'an unreadable section must schedule a retry').toBeGreaterThanOrEqual(0)

    harness.setSection({ providers: { route: { models: [{ id: 'late-model' }] } } })
    await runTimer(harness, 2000)

    expect(harness.writes).toHaveLength(1)
  })

  it('does not retry or surface a rejected update after disposal', async () => {
    const harness = createHarness({
      pendingUpdate: true,
      section: { providers: { route: { models: [{ id: 'model' }] } } },
    })

    await runTimer(harness, 500)
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
    const initial = runTimer(harness, 500)
    const event = harness.listener('settings/document-updated')?.callback('llm-pi-ai')
    harness.resolvePendingUpdate()
    await initial
    await event
    await Promise.resolve()
    await Promise.resolve()

    expect(harness.writes).toHaveLength(1)
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

      // The bound is on WRITES: that is what would grow without limit if the
      // pass budget were missing. `reads` counts every service read, and one
      // fill now reads the descriptor more than once (the switch, the resolved
      // section, the user layer), so it is asserted as a multiple of the pass
      // count rather than an absolute number.
      expect(harness.writes).toHaveLength(5)
      expect(reads).toBeLessThanOrEqual(harness.writes.length * 4)
      // The fill's own verdict is `filled`, so no retry is scheduled either.
      expect(fillTimers(harness)).toEqual([500])
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
      expect(fillTimers(harness)).toEqual([500])
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
      expect(timerIndex(harness, 2000)).toBeGreaterThanOrEqual(0)
      await runTimer(harness, 2000)
      expect(harness.writes).toHaveLength(2)
      expect(log).toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })
})

describe('subagent effort section read order', () => {
  // A descriptor carries both layers: `value` is the resolved section the
  // reads project, `user` marks which fields the user actually wrote. These
  // fixtures keep them equal unless a case needs them to disagree.
  const own = (user: unknown) => ({ ns: 'thinking-effort', user, value: user })
  const legacy = (user: unknown) => ({ ns: 'llm-pi-ai', user, value: user })

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
      describe: () => [
        own({ subagentEffort: 'ultra' }),
        { ns: 'llm-pi-ai', value: { providers: { route: { models: [{ id: 'model', reasoningEfforts: { high: 'ultra' } }] } } } },
      ],
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
      describe: () => [
        own({ subagentEffort: 'ultra' }),
        { ns: 'llm-pi-ai', value: { providers: { route: { models: [{ id: 'model', reasoningEfforts: { high: 'high' } }] } } } },
      ],
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
      descriptors: [{ ns: 'renamed-entry', user: { subagentEffort: 'low' }, value: { subagentEffort: 'low' } }, legacy({ subagentEffort: 'max' })],
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
      // The descriptor must report the SAME inherited-prototype providers the
      // section does, so the case proves the lookup ignores prototype-inherited
      // configuration rather than simply never seeing it.
      descriptors: [{
        ns: 'llm-pi-ai',
        user: { subagentEffort: 'ultra' },
        value: { subagentEffort: 'ultra', providers: inheritedProviders },
      }],
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
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'ultra' }, value: { subagentEffort: 'ultra' } }],
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
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'from-models' }, value: { subagentEffort: 'from-models' } }],
    })
    const config = { provider: 'route', model: 'model' }

    const result = await harness.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => config,
    )

    expect(result).toBe(config)
  })

  it('keeps normal model lookup when modelOverrides is empty', async () => {
    const providers = { route: { models: [{ id: 'model', reasoningEfforts: { high: 'ultra' } }], modelOverrides: {} } }
    const harness = createHarness({
      writable: false,
      section: { providers },
      // `describe()` is the only read path, so the descriptor must carry the
      // providers the model lookup resolves the wire value against.
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'ultra' }, value: { subagentEffort: 'ultra', providers } }],
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
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'from-models' }, value: { subagentEffort: 'from-models' } }],
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
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'xhigh' }, value: { subagentEffort: 'xhigh' } }],
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
      descriptors: [{
        ns: 'llm-pi-ai',
        user: { subagentEffort: 'ultra' },
        value: {
          subagentEffort: 'ultra',
          providers: { route: { models: [{ id: 'model', reasoningEfforts: { high: 'ultra' } }] } },
        },
      }],
    })
    const customResult = await custom.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => ({ provider: 'route', model: 'model' }),
    )
    expect((customResult as Record<string, unknown>)?.reasoningEffort).toBe('high')
  })

  it('overrides the effort a child inherited from its parent session', async () => {
    // When the parent session has a selected effort, the host seeds the child
    // request with it, so the configured default is dead unless it wins over
    // that inherited value.
    const harness = createHarness({
      writable: false,
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'high' }, value: { subagentEffort: 'high' } }],
    })
    const config = { provider: 'oc', model: 'deepseek-v4.1-flash', reasoningEffort: 'max', maxTokens: 393216 }

    const result = await harness.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => config,
    )

    expect(result).toEqual({
      provider: 'oc',
      model: 'deepseek-v4.1-flash',
      reasoningEffort: 'high',
      maxTokens: 393216,
    })
  })

  it('leaves the inherited effort untouched when no default is configured', async () => {
    // No configured default means no opinion: inheritance stays the only
    // source of the child's effort, so the request must not be rebuilt.
    const harness = createHarness({ writable: false })
    const config = { provider: 'route', model: 'model', reasoningEffort: 'max' }

    const result = await harness.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => config,
    )

    expect(result).toBe(config)
  })

  it('leaves an inherited effort untouched when the configured value cannot be mapped', async () => {
    // A custom wire value this model does not declare cannot become a level, so
    // the plugin has nothing to apply and must not rewrite the request.
    const harness = createHarness({
      writable: false,
      section: { providers: { route: { models: [{ id: 'model', reasoningEfforts: { high: 'high' } }] } } },
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'ultra' }, value: { subagentEffort: 'ultra' } }],
    })
    const config = { provider: 'route', model: 'model', reasoningEffort: 'max' }

    const result = await harness.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => config,
    )

    expect(result).toBe(config)
  })

  it('applies the default to a route-changed child that inherited no effort', async () => {
    // A child on another route loses the inherited effort, so the default is
    // the only value left to apply.
    const harness = createHarness({
      writable: false,
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'high' }, value: { subagentEffort: 'high' } }],
    })
    const config = { provider: 'route', model: 'model' }

    const result = await harness.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => config,
    )

    expect(result).toEqual({ ...config, reasoningEffort: 'high' })
  })

  it('leaves the config unchanged for main agents and missing session headers', async () => {
    const harness = createHarness({
      writable: false,
      descriptors: [{ ns: 'llm-pi-ai', user: { subagentEffort: 'max' }, value: { subagentEffort: 'max' } }],
    })
    const mainConfig = { provider: 'route', model: 'model' }
    const missingHeaderConfig = { provider: 'route', model: 'model' }
    const listener = harness.listener('agent/request')

    await expect(listener?.callback(
      { agent: { session: { header: { origin: 'main' } } } },
      async () => mainConfig,
    )).resolves.toBe(mainConfig)
    await expect(listener?.callback({ agent: { session: {} } }, async () => missingHeaderConfig))
      .resolves.toBe(missingHeaderConfig)
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

/** The plugin's own section as the `entry-config` model addresses it. */
const pluginSection = (user: unknown) => ({ ns: 'thinking-effort', user, value: user })
/**
 * The `llm-pi-ai` section, carrying the providers a model lookup resolves wire
 * values against. `describe()` is the only read path, so a fixture that needs
 * the lookup to see models has to put them here.
 */
const llmPiAiSection = (user: unknown, providers?: unknown) => ({
  ns: 'llm-pi-ai',
  user,
  value: providers === undefined ? user : { ...(user as object), providers },
})

/**
 * A model double whose `current()` reports the last `select()`, the way the real
 * `AgentModel` folds a recorded selection. A plain `vi.fn()` could not show that
 * the effort pass reads the route the first pass just wrote.
 */
function recordingModel(initial: Record<string, unknown>) {
  let selection: Record<string, unknown> | undefined = { ...initial }
  const select = vi.fn((next: Record<string, unknown>) => {
    selection = next
  })
  return {
    model: { current: () => selection, select },
    select,
  }
}

const subagentCreated = (model: Record<string, unknown>) => ({
  agent: { session: { header: { origin: 'subagent' } }, model },
})

describe('subagent default model read', () => {
  it('accepts a route only when both halves are non-empty', () => {
    const settings = (user: Record<string, unknown>) => ({ describe: () => [pluginSection(user)] })

    expect(readSubagentModel(settings({ subagentModel: { provider: 'route', model: 'model' } }) as never, 'thinking-effort'))
      .toEqual({ provider: 'route', model: 'model' })
    // A provider without a model names no route, so there is no choice to apply.
    expect(readSubagentModel(settings({ subagentModel: { provider: 'route', model: '' } }) as never, 'thinking-effort'))
      .toBeUndefined()
    expect(readSubagentModel(settings({ subagentModel: { provider: '', model: 'model' } }) as never, 'thinking-effort'))
      .toBeUndefined()
    expect(readSubagentModel(settings({ subagentModel: { provider: '', model: '' } }) as never, 'thinking-effort'))
      .toBeUndefined()
    expect(readSubagentModel(settings({}) as never, 'thinking-effort')).toBeUndefined()
    expect(readSubagentModel(undefined)).toBeUndefined()
  })

  it('reads the plugin section only, following a renamed Loader entry id', () => {
    // `subagentModel` never existed under `llm-pi-ai`, so unlike `subagentEffort`
    // there is no legacy location to fall back to: a value there is not a route
    // this feature wrote.
    const renamed = {
      describe: () => [
        llmPiAiSection({ subagentModel: { provider: 'legacy', model: 'legacy-model' } }),
        { ns: 'renamed-entry', user: { subagentModel: { provider: 'route', model: 'model' } } },
      ],
    }

    expect(readSubagentModel(renamed as never, 'renamed-entry')).toEqual({ provider: 'route', model: 'model' })
  })
})

describe('subagent default model selection', () => {
  it('selects the configured route for a subagent without pinning an effort', () => {
    const harness = createHarness({
      writable: false,
      entryId: 'thinking-effort',
      descriptors: [pluginSection({ subagentModel: { provider: 'route-b', model: 'model-b' } })],
    })
    const { model, select } = recordingModel({ provider: 'parent', model: 'inherited', reasoningEffort: 'max' })

    harness.listener('agent/created')?.callback(subagentCreated(model))

    expect(select).toHaveBeenCalledOnce()
    // No `reasoningEffort` key at all: the model's own default must decide, and
    // an explicit `undefined` would still name the effort as chosen.
    expect(select.mock.calls[0]?.[0]).toEqual({ provider: 'route-b', model: 'model-b' })
    expect(Object.keys(select.mock.calls[0]?.[0] ?? {})).toEqual(['provider', 'model'])
  })

  it('leaves the selection alone when no default route is configured', () => {
    const harness = createHarness({
      writable: false,
      entryId: 'thinking-effort',
      descriptors: [pluginSection({})],
    })
    const { model, select } = recordingModel({ provider: 'parent', model: 'inherited' })

    harness.listener('agent/created')?.callback(subagentCreated(model))

    // Neither a route nor an effort is configured, so the child inherits the
    // parent route untouched — the shipped behavior, byte for byte.
    expect(select).not.toHaveBeenCalled()
  })

  it('applies only the effort when a default route is configured but no effort is', () => {
    const harness = createHarness({
      writable: false,
      entryId: 'thinking-effort',
      descriptors: [pluginSection({ subagentEffort: 'high' })],
    })
    const { model, select } = recordingModel({ provider: 'parent', model: 'inherited', reasoningEffort: 'max' })

    harness.listener('agent/created')?.callback(subagentCreated(model))

    // The effort pass still runs, but it stays on the inherited route: an unset
    // default model must not move the child's route by itself.
    expect(select).toHaveBeenCalledOnce()
    expect(select.mock.calls[0]?.[0]).toEqual({
      provider: 'parent',
      model: 'inherited',
      reasoningEffort: 'high',
    })
  })

  it('treats a half-configured route as unset', () => {
    const harness = createHarness({
      writable: false,
      entryId: 'thinking-effort',
      descriptors: [pluginSection({ subagentModel: { provider: 'route-b', model: '' } })],
    })
    const { model, select } = recordingModel({ provider: 'parent', model: 'inherited' })

    harness.listener('agent/created')?.callback(subagentCreated(model))

    expect(select).not.toHaveBeenCalled()
  })

  it('does not touch main agents', () => {
    const harness = createHarness({
      writable: false,
      entryId: 'thinking-effort',
      descriptors: [pluginSection({ subagentModel: { provider: 'route-b', model: 'model-b' } })],
    })
    const { model, select } = recordingModel({ provider: 'parent', model: 'inherited' })

    harness.listener('agent/created')?.callback({
      agent: { session: { header: { origin: 'main' } }, model },
    })

    expect(select).not.toHaveBeenCalled()
  })

  it('applies the route before the effort, so a custom effort resolves against the new model', () => {
    // The custom wire value is declared only by `route-b/model-b`. Resolving it
    // before the route moves would look it up under the parent's route, find no
    // mapping, and silently leave the inherited effort in place.
    const harness = createHarness({
      writable: false,
      entryId: 'thinking-effort',
      section: { providers: { 'route-b': { models: [{ id: 'model-b', reasoningEfforts: { high: 'ultra' } }] } } },
      descriptors: [
        pluginSection({
          subagentModel: { provider: 'route-b', model: 'model-b' },
          subagentEffort: 'ultra',
        }),
        llmPiAiSection({}, { 'route-b': { models: [{ id: 'model-b', reasoningEfforts: { high: 'ultra' } }] } }),
      ],
    })
    const { model, select } = recordingModel({ provider: 'parent', model: 'inherited', reasoningEffort: 'max' })

    harness.listener('agent/created')?.callback(subagentCreated(model))

    expect(select).toHaveBeenCalledTimes(2)
    expect(select.mock.calls[0]?.[0]).toEqual({ provider: 'route-b', model: 'model-b' })
    expect(select.mock.calls[1]?.[0]).toEqual({
      provider: 'route-b',
      model: 'model-b',
      reasoningEffort: 'high',
    })
  })

  it('keeps a standard effort level when a route is also configured', () => {
    const harness = createHarness({
      writable: false,
      entryId: 'thinking-effort',
      descriptors: [pluginSection({
        subagentModel: { provider: 'route-b', model: 'model-b' },
        subagentEffort: 'xhigh',
      })],
    })
    const { model, select } = recordingModel({ provider: 'parent', model: 'inherited', reasoningEffort: 'max' })

    harness.listener('agent/created')?.callback(subagentCreated(model))

    expect(select).toHaveBeenCalledTimes(2)
    expect(select.mock.calls[1]?.[0]).toEqual({
      provider: 'route-b',
      model: 'model-b',
      reasoningEffort: 'xhigh',
    })
  })

  it('skips route selection on a host whose model lacks the selection methods', () => {
    const harness = createHarness({
      writable: false,
      entryId: 'thinking-effort',
      descriptors: [pluginSection({ subagentModel: { provider: 'route-b', model: 'model-b' } })],
    })
    const listener = harness.listener('agent/created')

    expect(() => listener?.callback(subagentCreated({}))).not.toThrow()
    expect(() => listener?.callback(subagentCreated({ current: () => ({}) }))).not.toThrow()
  })
})

describe('subagent request phase route handling', () => {
  it('never rewrites provider or model, only the effort', async () => {
    // The agent loop rejects a request whose route differs from the selection
    // fixed during step preparation, so this hook must pass the route through
    // exactly as the caller produced it.
    const harness = createHarness({
      writable: false,
      entryId: 'thinking-effort',
      descriptors: [pluginSection({
        subagentModel: { provider: 'route-b', model: 'model-b' },
        subagentEffort: 'high',
      })],
    })
    const config = { provider: 'parent', model: 'inherited', reasoningEffort: 'max', maxTokens: 4096 }

    const result = await harness.listener('agent/request')?.callback(
      { agent: { session: { header: { origin: 'subagent' } } } },
      async () => config,
    )

    expect(result).toEqual({ provider: 'parent', model: 'inherited', reasoningEffort: 'high', maxTokens: 4096 })
  })

  it('logs a route the request phase could not apply, once per agent', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const harness = createHarness({
      writable: false,
      entryId: 'thinking-effort',
      descriptors: [pluginSection({ subagentModel: { provider: 'route-b', model: 'model-b' } })],
    })
    const agent = { session: { header: { origin: 'subagent' } } }
    const listener = harness.listener('agent/request')

    try {
      await listener?.callback({ agent }, async () => ({ provider: 'parent', model: 'inherited' }))
      await listener?.callback({ agent }, async () => ({ provider: 'parent', model: 'inherited' }))

      const lines = log.mock.calls.map((call) => call.join(' '))
      const warnings = lines.filter((line) => line.includes('configured subagent model was not applied'))
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('route-b/model-b')
      expect(warnings[0]).toContain('parent/inherited')
    } finally {
      log.mockRestore()
    }
  })

  it('does not warn when the request already uses the configured route', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const harness = createHarness({
      writable: false,
      entryId: 'thinking-effort',
      descriptors: [pluginSection({ subagentModel: { provider: 'route-b', model: 'model-b' } })],
    })

    try {
      await harness.listener('agent/request')?.callback(
        { agent: { session: { header: { origin: 'subagent' } } } },
        async () => ({ provider: 'route-b', model: 'model-b' }),
      )

      const lines = log.mock.calls.map((call) => call.join(' '))
      expect(lines.some((line) => line.includes('configured subagent model was not applied'))).toBe(false)
    } finally {
      log.mockRestore()
    }
  })
})
