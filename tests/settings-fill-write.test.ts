import { describe, expect, it, vi } from 'vitest'

import { SETTINGS_NAMESPACE, installSettingsWatcher } from '../src/host/settings.ts'
import type { SettingsPathOp } from '../src/host/types.ts'

type Json = Record<string, unknown>

const NS = SETTINGS_NAMESPACE

/** The level set a fill applies, spelled out so the assertion is independent. */
const LEVELS = { off: null, high: 'high', max: 'max' }

/** The pi-ai per-model defaults a resolved section carries and the user never wrote. */
const MODEL_DEFAULTS: Json = { input: [], compat: { chatTemplateKwargs: {}, chatTemplateArgs: {} } }

/** The pi-ai per-provider defaults, from the same resolution. */
const PROVIDER_DEFAULTS: Json = {
  modelOverrides: {},
  defaultContextWindow: 262144,
  defaultMaxTokens: 32768,
  headers: {},
  thinkingBudgets: {},
}

/**
 * The keys a real 0.1.7-alpha.1 host pinned into the user's document beside
 * `reasoningEfforts`. None of them may reach a fill's write: they are schema
 * defaults, so pinning one freezes a value a later release may need to change.
 */
const RESOLVED_ONLY_KEYS = ['input', 'compat', 'headers', 'thinkingBudgets', 'defaultContextWindow', 'defaultMaxTokens']

function asRecord(value: unknown): Json | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Json : undefined
}

/**
 * The user's own section, exactly as they wrote it. The two routes are shaped
 * the way pi-ai's own validator requires: it refuses a `models` list standing
 * beside a `modelOverrides` entry on one route ("models already replaces the
 * served catalog"), so a single route carrying both could not exist in a live
 * profile, and a fixture that did would prove nothing about one.
 *
 * `sub2api` is the user's declared route; `catalog` is one whose override list
 * merges over the installed catalog.
 */
function userSection(): Json {
  return {
    providers: {
      sub2api: {
        apiKeyEnv: 'SUB2API_API_KEY',
        api: 'openai-responses',
        baseURL: 'http://localhost:8179',
        models: [
          { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6' },
          { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', contextWindow: 1000000 },
        ],
      },
      catalog: {
        modelOverrides: { 'glm-5.2': { contextWindow: 200000 } },
      },
    },
  }
}

/** The section every fill must leave behind: the user's keys plus `reasoningEfforts`. */
function filledSection(): Json {
  return {
    providers: {
      sub2api: {
        apiKeyEnv: 'SUB2API_API_KEY',
        api: 'openai-responses',
        baseURL: 'http://localhost:8179',
        models: [
          { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6', reasoningEfforts: LEVELS },
          { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', contextWindow: 1000000, reasoningEfforts: LEVELS },
        ],
      },
      catalog: {
        modelOverrides: { 'glm-5.2': { contextWindow: 200000, reasoningEfforts: LEVELS } },
      },
    },
  }
}

/** Every key path in `value`, deduplicated, with each array entry collapsed onto `[]`. */
function keyPaths(value: unknown, prefix = ''): string[] {
  return [...new Set(rawKeyPaths(value, prefix))]
}

function rawKeyPaths(value: unknown, prefix: string): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => rawKeyPaths(entry, `${prefix}[]`))
  const record = asRecord(value)
  if (record === undefined) return []
  return Object.entries(record).flatMap(([key, entry]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    return [path, ...rawKeyPaths(entry, path)]
  })
}

/** Resolve a stored section the way pi-ai's schema does: defaults under the user's own keys. */
function resolveSection(section: Json): Json {
  const providers = asRecord(section.providers) ?? {}
  return {
    ...section,
    providers: Object.fromEntries(Object.entries(providers).map(([route, rawProfile]) => {
      const profile = asRecord(rawProfile) ?? {}
      const models = Array.isArray(profile.models) ? profile.models : []
      const overrides = asRecord(profile.modelOverrides) ?? {}
      return [route, {
        ...PROVIDER_DEFAULTS,
        ...profile,
        models: models.map((entry) => ({ ...MODEL_DEFAULTS, ...(asRecord(entry) ?? {}) })),
        modelOverrides: Object.fromEntries(
          Object.entries(overrides).map(([id, entry]) => [id, { ...MODEL_DEFAULTS, ...(asRecord(entry) ?? {}) }]),
        ),
      }]
    })),
  }
}

/** The service's layer merge: plain objects merge recursively, every other value replaces. */
function mergeLayers(under: unknown, over: unknown): unknown {
  const base = asRecord(under)
  const top = asRecord(over)
  if (base === undefined || top === undefined) return over
  const merged: Json = { ...base }
  for (const [key, value] of Object.entries(top)) {
    merged[key] = Object.hasOwn(base, key) ? mergeLayers(base[key], value) : value
  }
  return merged
}

/**
 * The rc.7 … 0.1.6 path walk, copied from the shipped service. It descends
 * plain objects only, so a path that reaches an array replaces the array
 * rather than indexing into it. Running the golden test through this walk is
 * deliberate: a fill that addressed `models.<index>` would corrupt the model
 * list here, which is the regression this file exists to catch.
 */
function applyPathOpLegacy(section: Json, op: SettingsPathOp): Json {
  const [head, ...rest] = op.path
  if (head === undefined) return { ...(asRecord(op.value) ?? {}) }
  if (rest.length === 0) return { ...section, [head]: op.value }
  const child = section[head]
  if (asRecord(child) === undefined) {
    return { ...section, [head]: applyPathOpLegacy({}, { ...op, path: rest } as SettingsPathOp) }
  }
  return { ...section, [head]: applyPathOpLegacy(child as Json, { ...op, path: rest } as SettingsPathOp) }
}

/**
 * The 0.1.7 path walk, copied from the shipped service minus its schema node.
 * Without the node an absent intermediate becomes `{}` rather than the schema
 * default, and an out-of-range index is rejected by the length check below.
 * It is array-aware: a numeric step descends an existing array.
 */
function applyPathOp017(section: unknown, op: SettingsPathOp, path: readonly string[] = op.path): unknown {
  const [head, ...rest] = path
  if (head === undefined) return op.value
  if (Array.isArray(section)) {
    const index = Number(head)
    if (!/^(0|[1-9][0-9]*)$/.test(head) || index >= section.length) {
      throw new TypeError(`Config array index "${head}" is out of range`)
    }
    const result = [...section]
    result[index] = applyPathOp017(section[index], op, rest)
    return result
  }
  const result: Json = { ...(asRecord(section) ?? {}) }
  const child = applyPathOp017(Object.hasOwn(result, head) ? result[head] : undefined, op, rest)
  if (child === undefined) Reflect.deleteProperty(result, head)
  else Object.defineProperty(result, head, { value: child, enumerable: true, writable: true, configurable: true })
  return result
}

type SettingsModel = 'entry-config' | 'namespace'

interface ServiceOptions {
  /**
   * Extra `providers` entries the resolved layer carries. They stand for the
   * composition base and schema defaults a live section takes on: visible to
   * the fill, absent from the user's own layer, and never a source of written
   * values.
   */
  readonly resolved?: Json
  /**
   * The `models` array the resolved section carries for the route the user
   * declares, when it should differ from the user's own — a later model
   * appearing only in a lower layer, say.
   */
  readonly resolvedModels?: unknown
}

/**
 * A settings service that stores one section and writes to it the way the live
 * service does: `update` merges a whole subtree in (which is how a resolved
 * read pins its defaults), `mutate` walks path ops (which is how a minimal
 * write stays minimal). The two models differ only in the read method and the
 * path walk, so both are exercised against the same fixture.
 */
function createService(model: SettingsModel, options: ServiceOptions = {}) {
  let document: Json = userSection()
  const mutations: Array<{ ns: string; ops: readonly SettingsPathOp[] }> = []
  const updates: Array<{ ns: string; value: Json }> = []
  const scheduled: Array<() => void> = []

  /** The resolved section: the user's own keys under the schema's defaults and the composition base. */
  const resolve = (): Json => {
    const resolved = resolveSection(document) as Json
    const providers = asRecord(resolved.providers) ?? {}
    const routes: Json = { ...providers }
    for (const [route, profile] of Object.entries(options.resolved ?? {})) {
      routes[route] = { ...(asRecord(routes[route]) ?? {}), ...(asRecord(profile) ?? {}) }
    }
    if (options.resolvedModels !== undefined) {
      const [route, profile] = Object.entries(routes)[0] ?? []
      if (route !== undefined) routes[route] = { ...(asRecord(profile) ?? {}), models: options.resolvedModels }
    }
    return { ...resolved, providers: routes }
  }

  const settings: Record<string, unknown> = {
    writable: true,
    describe: () => [{ ns: NS, value: resolve(), user: structuredClone(document) }],
    update: async (ns: string, value: Json) => {
      updates.push({ ns, value })
      document = mergeLayers(document, value) as Json
    },
    mutate: async (ns: string, ops: readonly SettingsPathOp[]) => {
      mutations.push({ ns, ops })
      document = ops.reduce(
        (next, op) => (model === 'entry-config' ? applyPathOp017(next, op) : applyPathOpLegacy(next, op)) as Json,
        document,
      )
    },
  }
  if (model === 'namespace') {
    // The registered-namespace model exposes `get` and registers its own section.
    settings.get = () => resolve()
    settings.register = () => ({ get: () => ({}), watch: () => () => {} })
  }

  return {
    settings,
    mutations,
    updates,
    document: () => document,
    scheduled,
  }
}

/**
 * Run every fill the watcher schedules, including the ones a later trigger
 * queues behind a running fill, and let each settle. A run already in flight
 * queues its successor rather than starting it, so a test that awaits only the
 * first scheduled callback would observe an intermediate document.
 */
async function runFill(service: ReturnType<typeof createService>): Promise<void> {
  const context = {
    settings: service.settings,
    timeout: (callback: () => void) => {
      service.scheduled.push(callback)
      return () => {}
    },
    on: () => () => {},
    effect: (callback: () => void | (() => void)) => callback(),
  }

  installSettingsWatcher(context as never)
  for (let index = 0; index < service.scheduled.length; index += 1) {
    await service.scheduled[index]?.()
    await Promise.resolve()
    await Promise.resolve()
  }
  await Promise.resolve()
}

const EXPECTED_KEY_PATHS = [
  'providers',
  'providers.catalog',
  'providers.catalog.modelOverrides',
  'providers.catalog.modelOverrides.glm-5.2',
  'providers.catalog.modelOverrides.glm-5.2.contextWindow',
  'providers.catalog.modelOverrides.glm-5.2.reasoningEfforts',
  'providers.catalog.modelOverrides.glm-5.2.reasoningEfforts.high',
  'providers.catalog.modelOverrides.glm-5.2.reasoningEfforts.max',
  'providers.catalog.modelOverrides.glm-5.2.reasoningEfforts.off',
  'providers.sub2api',
  'providers.sub2api.api',
  'providers.sub2api.apiKeyEnv',
  'providers.sub2api.baseURL',
  'providers.sub2api.models',
  'providers.sub2api.models[].contextWindow',
  'providers.sub2api.models[].id',
  'providers.sub2api.models[].name',
  'providers.sub2api.models[].reasoningEfforts',
  'providers.sub2api.models[].reasoningEfforts.high',
  'providers.sub2api.models[].reasoningEfforts.max',
  'providers.sub2api.models[].reasoningEfforts.off',
]

/** The minimal write: one path per model array and one per missing override. */
const EXPECTED_OPS: readonly SettingsPathOp[] = [
  {
    op: 'set',
    path: ['providers', 'sub2api', 'models'],
    value: [
      { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6', reasoningEfforts: LEVELS },
      { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', contextWindow: 1000000, reasoningEfforts: LEVELS },
    ],
  },
  {
    op: 'set',
    path: ['providers', 'catalog', 'modelOverrides', 'glm-5.2', 'reasoningEfforts'],
    value: LEVELS,
  },
]

describe.each(['entry-config', 'namespace'] as const)('a provider-defaults fill on the %s service', (model) => {
  it('writes a key set exactly equal to the user keys plus reasoningEfforts', async () => {
    const service = createService(model)

    await runFill(service)

    const document = service.document()
    // The sentinel: any key a resolved section supplied on its own shows up here.
    expect(keyPaths(document).sort()).toEqual([...EXPECTED_KEY_PATHS].sort())
    expect(document).toEqual(filledSection())
    expect(RESOLVED_ONLY_KEYS.filter((key) => keyPaths(document).some((path) => path.split('.').pop() === key)))
      .toEqual([])
  })

  it('addresses every change by path instead of merging a resolved subtree', async () => {
    const service = createService(model)

    await runFill(service)

    expect(service.updates).toEqual([])
    expect(service.mutations).toEqual([{ ns: NS, ops: EXPECTED_OPS }])
  })

  it('leaves a section the user already completed untouched', async () => {
    const service = createService(model)
    await runFill(service)
    const afterFirst = structuredClone(service.document())

    await runFill(service)

    expect(service.mutations).toHaveLength(1)
    expect(service.document()).toEqual(afterFirst)
  })
})

describe('a settings service with no path-addressed write', () => {
  it('declines the fill rather than merging a resolved subtree', async () => {
    const service = createService('namespace')
    delete service.settings.mutate

    await runFill(service)

    expect(service.updates).toEqual([])
    expect(service.mutations).toEqual([])
    expect(service.document()).toEqual(userSection())
  })
})

/**
 * The written payload is derived from the user's own layer and from nothing
 * else. This is the load-bearing invariant behind the whole fill: a path write
 * merges into that layer, so quoting the *resolved* section would pin every
 * schema default and composition value the entry took on, and a later DSH
 * release changing one of those defaults could never reach the user.
 *
 * The assertions below hold an adversarial split: the resolved layer carries
 * fields and models the user never wrote, and `update` throws if the fill ever
 * reaches for a merge instead of a path.
 */
describe('the provider-defaults fill derives its payload from the raw user layer', () => {
  it('writes only fields the user wrote, never a resolved value the user did not', async () => {
    const service = createService('entry-config', {
      resolved: {
        baseOnly: {
          baseURL: 'https://base.invalid',
          headers: { 'x-base': 'from-composition' },
          defaultContextWindow: 262144,
          models: [{ id: 'base-model', name: 'base-model', input: [] }],
        },
      },
    })

    await runFill(service)

    const written = service.mutations.flatMap((mutation) => mutation.ops.map((op) => op.value))
    expect(written).toEqual([
      [
        { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6', reasoningEfforts: LEVELS },
        { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', contextWindow: 1000000, reasoningEfforts: LEVELS },
      ],
      LEVELS,
    ])
    for (const value of written) {
      expect(JSON.stringify(value)).not.toContain('base.invalid')
      expect(JSON.stringify(value)).not.toContain('from-composition')
      expect(JSON.stringify(value)).not.toContain('base-model')
    }
    // The base-only route stays out of the user's document entirely, and the
    // user's own routes gain nothing but the level set.
    expect(service.document()).toEqual(filledSection())
    expect(Object.keys((service.document().providers as Json))).toEqual(['sub2api', 'catalog'])
  })
})

/**
 * The shapes in which the fill deliberately does nothing. Stating them keeps a
 * later change from quietly re-widening the contract: an array has no
 * per-element layer, so materializing an entry the user's layer does not carry
 * would replace the lower layer's copy of it, and the inflation this file
 * exists to catch is what restoring that copy costs; a numeric array index is
 * also unsafe on the older settings walk.
 */
describe('the provider-defaults fill leaves entries a lower layer supplies alone', () => {
  it('does not materialize models the user layer does not declare', async () => {
    const service = createService('entry-config', {
      resolvedModels: [
        { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6' },
        { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', contextWindow: 1000000 },
        { id: 'base-only', name: 'base-only', input: ['text'], defaultContextWindow: 262144 },
      ],
    })

    await runFill(service)

    expect(service.mutations).toEqual([{
      ns: NS,
      ops: [
        { op: 'set', path: ['providers', 'sub2api', 'models'], value: EXPECTED_OPS[0]?.value },
        { op: 'set', path: ['providers', 'catalog', 'modelOverrides', 'glm-5.2', 'reasoningEfforts'], value: LEVELS },
      ],
    }])
    // The third entry never reaches the document, and neither do its resolved fields.
    const models = (service.document().providers as Json).sub2api as Json
    expect((models.models as unknown[]).map((entry) => (entry as Json).id))
      .toEqual(['claude-sonnet-4-6', 'deepseek-v4-flash'])
    expect(JSON.stringify(service.document())).not.toContain('base-only')
  })

  it('never writes an array index, which the older walk would read as replacing the array', async () => {
    const service = createService('entry-config', {
      resolvedModels: [
        { id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6' },
        { id: 'deepseek-v4-flash', name: 'deepseek-v4-flash', contextWindow: 1000000 },
      ],
    })

    await runFill(service)

    const paths = service.mutations.flatMap((mutation) => mutation.ops.map((op) => op.path))
    expect(paths.every((path) => path.every((step) => !/^(0|[1-9][0-9]*)$/.test(step)))).toBe(true)
    // The model list survives intact rather than becoming an index-keyed object.
    const providers = service.document().providers as Json
    expect(Array.isArray((providers.sub2api as Json).models)).toBe(true)
    expect((providers.sub2api as Json).models).toEqual(EXPECTED_OPS[0]?.value)
  })

  it('fills an override on a route the user layer never declares, and nothing beside it', async () => {
    const service = createService('entry-config', {
      resolved: {
        catalog: {
          baseURL: 'https://catalog.invalid',
          headers: { 'x-catalog': 'from-composition' },
          modelOverrides: { 'glm-5.2': { contextWindow: 200000, name: 'GLM' } },
        },
        other: {
          modelOverrides: { 'pre-filled': { name: 'P', reasoningEfforts: { high: 'ultra' } } },
        },
      },
    })

    await runFill(service)

    // The dict path can address one field, so the lower layer's fields are not restated.
    expect(service.mutations).toEqual([{
      ns: NS,
      ops: [
        { op: 'set', path: ['providers', 'sub2api', 'models'], value: EXPECTED_OPS[0]?.value },
        { op: 'set', path: ['providers', 'catalog', 'modelOverrides', 'glm-5.2', 'reasoningEfforts'], value: LEVELS },
      ],
    }])
    const providers = service.document().providers as Json
    // The override merges under the lower layer's own fields rather than restating them.
    expect(providers.catalog).toEqual({
      modelOverrides: { 'glm-5.2': { contextWindow: 200000, reasoningEfforts: LEVELS } },
    })
    // A route whose only override already carries a level set is not written at all.
    expect(Object.hasOwn(providers, 'other')).toBe(false)
    expect(JSON.stringify(service.document())).not.toContain('catalog.invalid')
    expect(JSON.stringify(service.document())).not.toContain('from-composition')
  })

  it('reports how many entries it could not reach instead of doing nothing silently', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const service = createService('entry-config', {
      resolved: {
        // A route whose models exist only in a lower settings layer, so no
        // user-layer entry can carry their `reasoningEfforts`.
        baseOnly: { baseURL: 'https://base.invalid', models: [{ id: 'base-only', name: 'base-only', input: [] }] },
      },
    })

    try {
      await runFill(service)

      const lines = spy.mock.calls.map((call) => call.join(' '))
      // The fill still covers what it can reach …
      expect(lines.some((line) => line.includes('filled default thinking levels for 3 model(s)'))).toBe(true)
      // … and names what it could not reach, which an operator would otherwise
      // have to infer from a selector that never appears in Composer.
      expect(lines.some((line) => line.includes('left 1 model(s) unfilled'))).toBe(true)
      expect(lines.some((line) => line.includes('lower settings layer'))).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })
})
