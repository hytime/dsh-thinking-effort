import { describe, expect, it, vi } from 'vitest'
import { LEGACY_RESULT_APPLIED, LEGACY_FAILED_PREFIX } from '../src/compat/legacy-migration.ts'
import type { LegacyCandidate } from '../src/compat/legacy-migration.ts'
import { applyLegacyMigration, opsForCandidates, rollbackSnapshot } from '../src/host/legacy-apply.ts'
import type { SettingsPathOp } from '../src/host/types.ts'

// Typed, not `as const`: `as const` would make each `path` a readonly tuple, and
// `LegacyCandidate.path` is deliberately mutable (task 1's `z<PluginSettings>`
// constraint), so the readonly form does not typecheck.
const CANDIDATES: LegacyCandidate[] = [
  { path: ['subagentEffort'], value: 'off', source: 'settings.yaml.imported' },
  { path: ['opencodeSession', 'providers', 'sub2api', 'models', 'deepseek-flash'], value: true, source: 'settings.yaml.imported' },
]

const SNAPSHOT = {
  kind: 'dsh-thinking-effort/config-snapshot',
  version: 1,
  createdAt: '2026-09-23T00:00:00.000Z',
  pluginVersion: '',
  sourceProfile: 'migration',
  sections: {},
}

function service(options: { fail?: boolean } = {}) {
  const calls: Array<{ ns: string; ops: readonly SettingsPathOp[] }> = []
  return {
    calls,
    settings: {
      writable: true,
      update: async () => {},
      mutate: async (ns: string, ops: readonly SettingsPathOp[]) => {
        calls.push({ ns, ops })
        if (options.fail === true) throw new Error('HMR transactions cannot be nested')
      },
      describe: () => [],
    },
  }
}

/** The input every case shares, so only the field under test differs. */
const input = (overrides: Record<string, unknown> = {}) => ({
  ns: 'thinking-effort',
  candidates: CANDIDATES,
  snapshot: () => SNAPSHOT,
  clear: async () => {},
  ...overrides,
})

describe('opsForCandidates', () => {
  it('turns every candidate into one path set', () => {
    expect(opsForCandidates(CANDIDATES)).toEqual([
      { op: 'set', path: ['subagentEffort'], value: 'off' },
      { op: 'set', path: ['opencodeSession', 'providers', 'sub2api', 'models', 'deepseek-flash'], value: true },
    ])
  })

  it('answers nothing for no candidates, so a no-op migration writes nothing', () => {
    expect(opsForCandidates([])).toEqual([])
  })
})

describe('rollbackSnapshot', () => {
  it('captures both sections and drops the library and control keys from the plugin section', () => {
    const snapshot = rollbackSnapshot({
      pluginNs: 'thinking-effort',
      createdAt: '2026-09-23T00:00:00.000Z',
      sections: {
        'thinking-effort': {
          subagentEffort: '',
          profiles: { work: { createdAt: 'old' } },
          autoBackup: { createdAt: 'older' },
          legacyMigration: { pending: true, candidates: [] },
          opencodeSession: { format: { mode: 'template' } },
        },
        'llm-pi-ai': { providers: { p: { baseURL: 'http://p' } } },
      },
    })
    expect(snapshot).toEqual({
      kind: 'dsh-thinking-effort/config-snapshot',
      version: 1,
      createdAt: '2026-09-23T00:00:00.000Z',
      pluginVersion: '',
      sourceProfile: 'migration',
      sections: {
        'thinking-effort': {
          subagentEffort: '',
          opencodeSession: { format: { mode: 'template' } },
        },
        'llm-pi-ai': { providers: { p: { baseURL: 'http://p' } } },
      },
    })
  })

  it('keeps a same-named key on the other section', () => {
    const snapshot = rollbackSnapshot({
      pluginNs: 'thinking-effort',
      createdAt: 'T',
      sections: { 'llm-pi-ai': { profiles: { keep: true }, subagentEffort: 'off' } },
    })
    expect((snapshot.sections as Record<string, unknown>)['llm-pi-ai']).toEqual({
      profiles: { keep: true },
      subagentEffort: 'off',
    })
  })

  it('does not mutate the layers it captured', () => {
    const plugin = { profiles: { work: {} }, subagentEffort: 'off' }
    rollbackSnapshot({ pluginNs: 'thinking-effort', createdAt: 'T', sections: { 'thinking-effort': plugin } })
    expect(plugin).toEqual({ profiles: { work: {} }, subagentEffort: 'off' })
  })

  it('never copies a reserved key into the snapshot', () => {
    // `JSON.parse` keeps `__proto__` as an own enumerable property, so a parsed
    // document really can carry one. Without the guard, `copy['__proto__'] = …`
    // does NOT create an own key: it invokes the setter and rewrites the
    // accumulator's PROTOTYPE, which `toEqual` cannot observe and which never
    // touches `Object.prototype`. So this case asserts the prototype and an
    // inherited-name lookup — asserting own keys or global pollution alone would
    // pass with or without the guard.
    const plugin = JSON.parse('{"__proto__":{"polluted":true},"subagentEffort":"off"}') as Record<string, unknown>
    const snapshot = rollbackSnapshot({
      pluginNs: 'thinking-effort',
      createdAt: 'T',
      sections: { 'thinking-effort': plugin },
    })
    const captured = (snapshot.sections as Record<string, unknown>)['thinking-effort'] as Record<string, unknown>
    expect(Object.keys(captured)).toEqual(['subagentEffort'])
    expect(Object.getPrototypeOf(captured)).toBe(Object.prototype)
    expect('polluted' in captured).toBe(false)
  })
})

describe('applyLegacyMigration', () => {
  it('rides the rollback snapshot in the same batch, before the values', async () => {
    const { settings, calls } = service()
    const outcome = await applyLegacyMigration({ settings, ...input() })
    expect(calls).toEqual([{
      ns: 'thinking-effort',
      ops: [
        { op: 'set', path: ['autoBackup'], value: SNAPSHOT },
        ...opsForCandidates(CANDIDATES),
      ],
    }])
    expect(outcome).toBe(LEGACY_RESULT_APPLIED)
  })

  it('builds the snapshot before the write and sends it as the batch first element', async () => {
    const { settings, calls } = service()
    const snapshot = vi.fn(() => SNAPSHOT)
    await applyLegacyMigration({ settings, ...input({ snapshot }) })
    expect(snapshot).toHaveBeenCalledOnce()
    // The order is the property: a batch where the values came first could land
    // them without the copy the user asked for.
    expect(calls[0]?.ops[0]).toEqual({ op: 'set', path: ['autoBackup'], value: SNAPSHOT })
  })

  it('writes neither values nor a snapshot when there is nothing to migrate', async () => {
    const { settings, calls } = service()
    const snapshot = vi.fn(() => SNAPSHOT)
    const clear = vi.fn(async () => { throw new Error('must not clear') })
    const outcome = await applyLegacyMigration({ settings, ...input({ candidates: [], snapshot, clear }) })
    expect(calls).toEqual([])
    expect(snapshot).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
    expect(outcome).toBe(LEGACY_RESULT_APPLIED)
  })

  it('cannot leave a snapshot behind a refused batch: both ride one mutate', async () => {
    const { settings, calls } = service({ fail: true })
    const outcome = await applyLegacyMigration({ settings, ...input() })
    // One attempt, holding both the snapshot and the values, and it threw — so
    // no state exists in which the rollback copy landed without the migration.
    expect(calls.length).toBe(1)
    expect(calls[0]?.ops[0]?.path).toEqual(['autoBackup'])
    expect(outcome.startsWith(LEGACY_FAILED_PREFIX)).toBe(true)
    expect(outcome).toContain('HMR transactions cannot be nested')
  })

  it('refuses to write when the settings service exposes no path-addressed edit', async () => {
    const settings = { writable: true, update: async () => {} }
    const outcome = await applyLegacyMigration({ settings, ...input() })
    expect(outcome.startsWith(LEGACY_FAILED_PREFIX)).toBe(true)
    expect(outcome).toContain('mutate')
  })

  it('clears the control object after a successful write', async () => {
    const { settings } = service()
    const clear = vi.fn(async () => {})
    await applyLegacyMigration({ settings, ...input({ clear }) })
    expect(clear).toHaveBeenCalledOnce()
  })

  it('does not clear the control object after a refused write', async () => {
    const { settings } = service({ fail: true })
    const clear = vi.fn(async () => {})
    await applyLegacyMigration({ settings, ...input({ clear }) })
    expect(clear).not.toHaveBeenCalled()
  })

  it('reports applied when only clearing the prompt fails, so no retry can rebuild the snapshot', async () => {
    const { settings, calls } = service()
    const clear = vi.fn(async () => { throw new Error('bookkeeping refused') })
    const outcome = await applyLegacyMigration({ settings, ...input({ clear }) })
    expect(outcome).toBe(LEGACY_RESULT_APPLIED)
    expect(calls[0]?.ops[0]?.path).toEqual(['autoBackup'])
  })

  it('reports a snapshot that cannot be built instead of throwing it out of the executor', async () => {
    const { settings, calls } = service()
    const outcome = await applyLegacyMigration({
      settings,
      ...input({
        snapshot: () => { throw new Error('snapshot unavailable') },
      }),
    })
    expect(outcome.startsWith(LEGACY_FAILED_PREFIX)).toBe(true)
    expect(outcome).toContain('snapshot unavailable')
    expect(calls).toEqual([])
  })
})
