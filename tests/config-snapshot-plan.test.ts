import { describe, expect, it } from 'vitest'
import {
  autoBackupFromNamespaces,
  autoBackupOps,
  deleteProfileOps,
  profilesFromNamespaces,
  saveProfileOps,
  validateProfileName,
} from '../src/client/config-snapshot/library.js'
import { deepEqualJson, planImport } from '../src/client/config-snapshot/plan.js'
import type { ConfigSnapshot } from '../src/client/config-snapshot/types.js'
import type { SettingsNamespace } from '../src/client/types.js'

const snapshotOf = (sections: Record<string, Record<string, unknown>>): ConfigSnapshot => ({
  kind: 'dsh-thinking-effort/config-snapshot',
  version: 1,
  createdAt: '2026-09-16T12:00:00.000Z',
  pluginVersion: '0.2.4',
  sourceProfile: 'modern',
  sections: { 'dsh-thinking-effort': {}, 'llm-pi-ai': {}, ...sections },
})

const current = (sections: Record<string, Record<string, unknown>>): SettingsNamespace[] => [
  { ns: 'llm-pi-ai', revision: 5, value: {}, user: sections['llm-pi-ai'] ?? {} },
  { ns: 'dsh-thinking-effort', revision: 9, value: {}, user: sections['dsh-thinking-effort'] ?? {} },
]

const opsFor = (plan: ReturnType<typeof planImport>, ns: string): readonly unknown[] =>
  plan.namespaces.find((entry) => entry.ns === ns)?.ops ?? []

describe('deepEqualJson', () => {
  it('compares nested structures regardless of key order', () => {
    expect(deepEqualJson({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true)
    expect(deepEqualJson({ a: 1 }, { a: 2 })).toBe(false)
    expect(deepEqualJson([1, 2], [2, 1])).toBe(false)
    expect(deepEqualJson({ a: 1 }, { a: 1, b: undefined })).toBe(false)
  })
})

describe('planImport merge mode', () => {
  it('overwrites a matching provider wholesale and keeps the others', () => {
    const plan = planImport(
      snapshotOf({ 'llm-pi-ai': { providers: { keep: { baseURL: 'http://file-keep' }, added: { baseURL: 'http://added' } } } }),
      current({ 'llm-pi-ai': { providers: { keep: { baseURL: 'http://mine', api: 'x' }, untouched: { baseURL: 'http://untouched' } } } }),
      'merge',
    )

    expect(opsFor(plan, 'llm-pi-ai')).toEqual([
      { op: 'set', path: ['providers'], value: { keep: { baseURL: 'http://file-keep' }, untouched: { baseURL: 'http://untouched' }, added: { baseURL: 'http://added' } } },
    ])
    expect(plan.summary).toEqual({ added: 1, overwritten: 1, removed: 0 })
    expect(plan.empty).toBe(false)
  })

  it('never unsets a provider the file omits', () => {
    const plan = planImport(
      snapshotOf({ 'llm-pi-ai': { providers: { a: { baseURL: 'http://a' } } } }),
      current({ 'llm-pi-ai': { providers: { a: { baseURL: 'http://a' }, mine: { baseURL: 'http://mine' } } } }),
      'merge',
    )

    expect(JSON.stringify(opsFor(plan, 'llm-pi-ai'))).not.toContain('"unset"')
    expect(plan.summary.removed).toBe(0)
  })

  it('merges scalar top-level keys and leaves the rest alone', () => {
    const plan = planImport(
      snapshotOf({ 'llm-pi-ai': { subagentEffort: 'high' } }),
      current({ 'llm-pi-ai': { subagentEffort: 'off', untouched: 1 } }),
      'merge',
    )

    expect(opsFor(plan, 'llm-pi-ai')).toEqual([{ op: 'set', path: ['subagentEffort'], value: 'high' }])
    expect(plan.summary).toEqual({ added: 0, overwritten: 1, removed: 0 })
  })

  it('replaces a scalar with an object rather than merging them', () => {
    const plan = planImport(
      snapshotOf({ 'llm-pi-ai': { providers: { a: 1 } } }),
      current({ 'llm-pi-ai': { providers: 'scalar' } }),
      'merge',
    )

    expect(opsFor(plan, 'llm-pi-ai')).toEqual([{ op: 'set', path: ['providers'], value: { a: 1 } }])
  })
})

describe('planImport replace mode', () => {
  it('unsets top-level entries the file omits and counts them', () => {
    const plan = planImport(
      snapshotOf({ 'llm-pi-ai': { providers: { keep: { baseURL: 'http://file' } } } }),
      current({ 'llm-pi-ai': { providers: { keep: { baseURL: 'http://mine' }, gone: { baseURL: 'http://gone' } }, extra: 1 } }),
      'replace',
    )

    expect(opsFor(plan, 'llm-pi-ai')).toEqual([
      { op: 'unset', path: ['extra'] },
      { op: 'set', path: ['providers'], value: { keep: { baseURL: 'http://file' } } },
    ])
    expect(plan.summary).toEqual({ added: 0, overwritten: 1, removed: 2 })
  })

  it('counts a removed empty dict as one removal', () => {
    const plan = planImport(
      snapshotOf({ 'llm-pi-ai': { providers: { keep: { baseURL: 'http://file' } } } }),
      current({ 'llm-pi-ai': { providers: { keep: { baseURL: 'http://mine' } }, emptyProviders: {} } }),
      'replace',
    )

    expect(opsFor(plan, 'llm-pi-ai')).toEqual([
      { op: 'unset', path: ['emptyProviders'] },
      { op: 'set', path: ['providers'], value: { keep: { baseURL: 'http://file' } } },
    ])
    expect(plan.summary).toEqual({ added: 0, overwritten: 1, removed: 1 })
  })

  it('produces no ops when both sides are empty', () => {
    const plan = planImport(snapshotOf({}), current({}), 'replace')

    expect(plan.empty).toBe(true)
    expect(plan.namespaces).toEqual([])
  })

  it('counts a dict the file introduces where none existed as an addition', () => {
    const plan = planImport(snapshotOf({ 'llm-pi-ai': { providers: {} } }), current({}), 'replace')

    expect(opsFor(plan, 'llm-pi-ai')).toEqual([{ op: 'set', path: ['providers'], value: {} }])
    expect(plan.summary).toEqual({ added: 1, overwritten: 0, removed: 0 })
  })
})

describe('planImport summary and emptiness', () => {
  it('produces no ops when the file matches the current configuration', () => {
    const sections = { 'llm-pi-ai': { providers: { a: { baseURL: 'http://a' } } } }
    const plan = planImport(snapshotOf(sections), current(sections), 'merge')

    expect(plan.empty).toBe(true)
    expect(plan.summary).toEqual({ added: 0, overwritten: 0, removed: 0 })
  })

  it('always plans the plugin namespace before the model namespace', () => {
    const plan = planImport(
      snapshotOf({
        'dsh-thinking-effort': { opencodeSession: { providers: { p: { models: { m: true } } } } },
        'llm-pi-ai': { subagentEffort: 'off' },
      }),
      current({}),
      'merge',
    )

    expect(plan.namespaces.map((entry) => entry.ns)).toEqual(['dsh-thinking-effort', 'llm-pi-ai'])
  })

  it('keeps that order when the file itself lists the model namespace first', () => {
    // A literal, not `snapshotOf`: this test only has teeth while the sections
    // object genuinely carries the file's key order, the way `parse.ts` keeps it.
    const snapshot: ConfigSnapshot = {
      kind: 'dsh-thinking-effort/config-snapshot',
      version: 1,
      createdAt: '2026-09-16T12:00:00.000Z',
      pluginVersion: '0.2.4',
      sourceProfile: 'modern',
      sections: {
        'llm-pi-ai': { subagentEffort: 'off' },
        'dsh-thinking-effort': { opencodeSession: { providers: { p: { models: { m: true } } } } },
      },
    }

    expect(Object.keys(snapshot.sections)).toEqual(['llm-pi-ai', 'dsh-thinking-effort'])

    const plan = planImport(snapshot, current({}), 'merge')

    expect(plan.namespaces.map((entry) => entry.ns)).toEqual(['dsh-thinking-effort', 'llm-pi-ai'])
  })

  it('reports only the namespaces that actually change', () => {
    const plan = planImport(
      snapshotOf({ 'llm-pi-ai': { subagentEffort: 'high' } }),
      current({ 'llm-pi-ai': { subagentEffort: 'high' } }),
      'merge',
    )

    expect(plan.namespaces).toEqual([])
    expect(plan.empty).toBe(true)
  })
})

describe('profilesFromNamespaces', () => {
  it('reads the library out of the plugin namespace user layer', () => {
    const profiles = profilesFromNamespaces(current({
      'dsh-thinking-effort': { profiles: { work: { kind: 'dsh-thinking-effort/config-snapshot', version: 1, createdAt: 'x', pluginVersion: '0.2.4', sourceProfile: 'modern', sections: { 'llm-pi-ai': { a: 1 } } } } },
    }))

    expect(Object.keys(profiles)).toEqual(['work'])
    expect(profiles.work?.sections['llm-pi-ai']).toEqual({ a: 1 })
  })

  it('drops malformed entries instead of throwing on a hand-edited settings file', () => {
    const profiles = profilesFromNamespaces(current({
      'dsh-thinking-effort': { profiles: { bad: { nope: true }, good: { kind: 'dsh-thinking-effort/config-snapshot', version: 1, createdAt: 'x', pluginVersion: '0.2.4', sourceProfile: 'modern', sections: {} }, worse: 7 } },
    }))

    expect(Object.keys(profiles)).toEqual(['good'])
  })

  it('returns an empty library when the namespace is unconfigured', () => {
    expect(profilesFromNamespaces(current({}))).toEqual({})
  })
})

describe('validateProfileName', () => {
  it('trims and accepts a fresh name', () => {
    expect(validateProfileName('  work  ', [])).toEqual({ ok: true, value: 'work' })
  })

  it('rejects empty, overlong, reserved, duplicate and control-character names', () => {
    expect(validateProfileName('   ', [])).toEqual({ ok: false, error: 'required' })
    expect(validateProfileName('x'.repeat(41), [])).toEqual({ ok: false, error: 'tooLong' })
    expect(validateProfileName('__proto__', [])).toEqual({ ok: false, error: 'reserved' })
    expect(validateProfileName('constructor', [])).toEqual({ ok: false, error: 'reserved' })
    expect(validateProfileName('work', ['work'])).toEqual({ ok: false, error: 'taken' })
    expect(validateProfileName('wo\u0000rk', [])).toEqual({ ok: false, error: 'invalid' })
  })
})

describe('profile ops', () => {
  it('writes the whole snapshot under the profile name', () => {
    const snapshot = snapshotOf({ 'llm-pi-ai': { a: 1 } })
    expect(saveProfileOps('work', snapshot)).toEqual([{ op: 'set', path: ['profiles', 'work'], value: snapshot }])
  })

  it('deletes by name', () => {
    expect(deleteProfileOps('work')).toEqual([{ op: 'unset', path: ['profiles', 'work'] }])
  })

  it('writes the auto backup to its own field so it never consumes a library slot', () => {
    const snapshot = snapshotOf({ 'llm-pi-ai': { a: 1 } })
    expect(autoBackupOps(snapshot)).toEqual([{ op: 'set', path: ['autoBackup'], value: snapshot }])
  })
})

describe('autoBackupFromNamespaces', () => {
  it('treats an empty createdAt as never written', () => {
    expect(autoBackupFromNamespaces(current({ 'dsh-thinking-effort': { autoBackup: { kind: 'dsh-thinking-effort/config-snapshot', version: 1, createdAt: '', pluginVersion: '', sourceProfile: 'unknown', sections: {} } } }))).toBeUndefined()
  })

  it('returns the stored snapshot once written', () => {
    const backup = autoBackupFromNamespaces(current({ 'dsh-thinking-effort': { autoBackup: { kind: 'dsh-thinking-effort/config-snapshot', version: 1, createdAt: '2026-09-15T00:00:00.000Z', pluginVersion: '0.2.4', sourceProfile: 'modern', sections: { 'llm-pi-ai': { a: 1 } } } } }))
    expect(backup?.createdAt).toBe('2026-09-15T00:00:00.000Z')
  })
})
