import { describe, expect, it } from 'vitest'

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

/** The user's own section, exactly as they wrote it. */
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
  if (head === undefined) {
    if (op.op === 'unset') return {}
    return { ...(asRecord(op.value) ?? {}) }
  }
  if (rest.length === 0) {
    if (op.op === 'set') return { ...section, [head]: op.value }
    const { [head]: _removed, ...kept } = section
    return kept
  }
  const child = section[head]
  if (asRecord(child) === undefined) {
    if (op.op === 'unset') return section
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
  if (head === undefined) return op.op === 'set' ? op.value : undefined
  if (Array.isArray(section)) {
    const index = Number(head)
    if (!/^(0|[1-9][0-9]*)$/.test(head) || index >= section.length) {
      throw new TypeError(`Config array index "${head}" is out of range`)
    }
    const result = [...section]
    if (rest.length === 0 && op.op === 'unset') result.splice(index, 1)
    else result[index] = applyPathOp017(section[index], op, rest)
    return result
  }
  const result: Json = { ...(asRecord(section) ?? {}) }
  const child = applyPathOp017(Object.hasOwn(result, head) ? result[head] : undefined, op, rest)
  if (child === undefined) Reflect.deleteProperty(result, head)
  else Object.defineProperty(result, head, { value: child, enumerable: true, writable: true, configurable: true })
  return result
}

type SettingsModel = 'entry-config' | 'namespace'

/**
 * A settings service that stores one section and writes to it the way the live
 * service does: `update` merges a whole subtree in (which is how a resolved
 * read pins its defaults), `mutate` walks path ops (which is how a minimal
 * write stays minimal). The two models differ only in the read method and the
 * path walk, so both are exercised against the same fixture.
 */
function createService(model: SettingsModel) {
  let document: Json = userSection()
  const mutations: Array<{ ns: string; ops: readonly SettingsPathOp[] }> = []
  const updates: Array<{ ns: string; value: Json }> = []
  const scheduled: Array<() => void> = []

  const settings: Record<string, unknown> = {
    writable: true,
    describe: () => [{ ns: NS, value: resolveSection(document), user: structuredClone(document) }],
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
    settings.get = () => resolveSection(document)
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
  for (const callback of [...service.scheduled]) await callback()
  await Promise.resolve()
  await Promise.resolve()
}

const EXPECTED_KEY_PATHS = [
  'providers',
  'providers.sub2api',
  'providers.sub2api.api',
  'providers.sub2api.apiKeyEnv',
  'providers.sub2api.baseURL',
  'providers.sub2api.modelOverrides',
  'providers.sub2api.modelOverrides.glm-5.2',
  'providers.sub2api.modelOverrides.glm-5.2.contextWindow',
  'providers.sub2api.modelOverrides.glm-5.2.reasoningEfforts',
  'providers.sub2api.modelOverrides.glm-5.2.reasoningEfforts.high',
  'providers.sub2api.modelOverrides.glm-5.2.reasoningEfforts.max',
  'providers.sub2api.modelOverrides.glm-5.2.reasoningEfforts.off',
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
    path: ['providers', 'sub2api', 'modelOverrides', 'glm-5.2', 'reasoningEfforts'],
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
