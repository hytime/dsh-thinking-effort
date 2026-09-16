import { describe, expect, it, vi } from 'vitest'
import { applySnapshot, isConflictError } from '../src/client/config-snapshot/apply.js'
import type { ConfigSnapshot } from '../src/client/config-snapshot/types.js'
import type { SettingsNamespace, SettingsOp } from '../src/client/types.js'

const snapshotOf = (sections: Record<string, Record<string, unknown>>): ConfigSnapshot => ({
  kind: 'dsh-thinking-effort/config-snapshot',
  version: 1,
  createdAt: '2026-09-16T12:00:00.000Z',
  pluginVersion: '0.2.4',
  sourceProfile: 'modern',
  sections: { 'dsh-thinking-effort': {}, 'llm-pi-ai': {}, ...sections },
})

interface Call { ns: string; ops: readonly SettingsOp[]; revision: number }

function harness(options: {
  user?: Record<string, Record<string, unknown>>
  failOn?: string
  conflictOn?: string
  applies?: string
} = {}) {
  const calls: Call[] = []
  let revision = 1
  const namespaces = (): SettingsNamespace[] => [
    { ns: 'llm-pi-ai', revision, value: {}, user: options.user?.['llm-pi-ai'] ?? {}, applies: options.applies },
    { ns: 'dsh-thinking-effort', revision, value: {}, user: options.user?.['dsh-thinking-effort'] ?? {} },
  ]
  const settings = {
    describe: vi.fn(async () => ({ ok: true as const, value: { namespaces: namespaces(), writable: true } })),
    mutate: vi.fn(async (ns: string, ops: readonly SettingsOp[], expected: number) => {
      calls.push({ ns, ops, revision: expected })
      if (ns === options.conflictOn) return { ok: false as const, error: { message: 'settings conflict', code: 'settings/conflict' } }
      if (ns === options.failOn) return { ok: false as const, error: { message: 'invalid provider profile' } }
      revision += 1
      return { ok: true as const, value: { ns, revision, value: {} } }
    }),
  }
  return { settings, calls }
}

describe('isConflictError', () => {
  it('recognizes the remote conflict classification and a conflict message', () => {
    expect(isConflictError({ message: 'x', code: 'settings/conflict' })).toBe(true)
    expect(isConflictError({ message: 'Settings conflict for "llm-pi-ai"' })).toBe(true)
    expect(isConflictError({ message: 'invalid provider profile' })).toBe(false)
  })
})

describe('applySnapshot', () => {
  it('writes the plugin namespace before the model namespace', async () => {
    const { settings, calls } = harness()
    const outcome = await applySnapshot({
      snapshot: snapshotOf({
        'llm-pi-ai': { subagentEffort: 'high' },
        'dsh-thinking-effort': { opencodeSession: { providers: { p: { models: { m: true } } } } },
      }),
      mode: 'merge',
      settings,
      autoBackup: false,
    })

    expect(calls.map((call) => call.ns)).toEqual(['dsh-thinking-effort', 'llm-pi-ai'])
    expect(outcome.ok).toBe(true)
    expect(outcome.skipped).toBe(false)
  })

  it('reports no changes and writes nothing when the configuration already matches', async () => {
    const { settings, calls } = harness({ user: { 'llm-pi-ai': { subagentEffort: 'high' } } })
    const outcome = await applySnapshot({
      snapshot: snapshotOf({ 'llm-pi-ai': { subagentEffort: 'high' } }),
      mode: 'merge',
      settings,
      autoBackup: false,
    })

    expect(outcome.skipped).toBe(true)
    expect(outcome.ok).toBe(true)
    expect(calls).toEqual([])
  })

  it('keeps going after one namespace fails and reports which half applied', async () => {
    const { settings, calls } = harness({ failOn: 'llm-pi-ai' })
    const outcome = await applySnapshot({
      snapshot: snapshotOf({
        'llm-pi-ai': { subagentEffort: 'high' },
        'dsh-thinking-effort': { opencodeSession: { providers: { p: { models: { m: true } } } } },
      }),
      mode: 'merge',
      settings,
      autoBackup: false,
    })

    expect(calls.map((call) => call.ns)).toEqual(['dsh-thinking-effort', 'llm-pi-ai'])
    expect(outcome.ok).toBe(false)
    expect(outcome.outcomes).toEqual([
      { ns: 'dsh-thinking-effort', ok: true, revision: 2 },
      { ns: 'llm-pi-ai', ok: false, error: 'invalid provider profile', conflict: false },
    ])
  })

  it('flags a conflict and leaves the configuration untouched for a retry', async () => {
    const { settings } = harness({ conflictOn: 'llm-pi-ai' })
    const outcome = await applySnapshot({
      snapshot: snapshotOf({ 'llm-pi-ai': { subagentEffort: 'high' } }),
      mode: 'merge',
      settings,
      autoBackup: false,
    })

    expect(outcome.outcomes).toEqual([{ ns: 'llm-pi-ai', ok: false, error: 'settings conflict', conflict: true }])
  })

  it('writes the pre-apply snapshot into the auto backup field when asked', async () => {
    const { settings, calls } = harness({ user: { 'llm-pi-ai': { subagentEffort: 'off' } } })
    const outcome = await applySnapshot({
      snapshot: snapshotOf({ 'llm-pi-ai': { subagentEffort: 'high' } }),
      mode: 'merge',
      settings,
      autoBackup: true,
    })

    const backupCall = calls.at(-1)
    expect(backupCall?.ns).toBe('dsh-thinking-effort')
    expect(backupCall?.ops).toEqual([
      { op: 'set', path: ['autoBackup'], value: expect.objectContaining({ sections: expect.objectContaining({ 'llm-pi-ai': { subagentEffort: 'off' } }) }) },
    ])
    expect(outcome.autoBackupError).toBeUndefined()
  })

  it('does not back up when nothing was written', async () => {
    const { settings, calls } = harness({ user: { 'llm-pi-ai': { subagentEffort: 'high' } } })
    await applySnapshot({
      snapshot: snapshotOf({ 'llm-pi-ai': { subagentEffort: 'high' } }),
      mode: 'merge',
      settings,
      autoBackup: true,
    })

    expect(calls).toEqual([])
  })

  it('reports the namespaces that need a restart', async () => {
    const { settings } = harness({ applies: 'restart' })
    const outcome = await applySnapshot({
      snapshot: snapshotOf({ 'llm-pi-ai': { subagentEffort: 'high' } }),
      mode: 'merge',
      settings,
      autoBackup: false,
    })

    expect(outcome.restartRequired).toEqual(['llm-pi-ai'])
  })

  it('surfaces a describe failure without writing', async () => {
    const settings = {
      describe: vi.fn(async () => ({ ok: false as const, error: { message: 'no provider' } })),
      mutate: vi.fn(),
    }
    const outcome = await applySnapshot({
      snapshot: snapshotOf({ 'llm-pi-ai': { a: 1 } }),
      mode: 'merge',
      settings,
      autoBackup: false,
    })

    expect(outcome.ok).toBe(false)
    expect(settings.mutate).not.toHaveBeenCalled()
  })
})
