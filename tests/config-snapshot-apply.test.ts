import { describe, expect, it, vi } from 'vitest'
import { applySnapshot, isConflictError } from '../src/client/config-snapshot/apply.js'
import { AUTO_BACKUP_PATH } from '../src/client/config-snapshot/library.js'
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

interface DescribeRead { ns: string; revision: number }

interface HarnessOptions {
  user?: Record<string, Record<string, unknown>>
  /** Rejects the namespace write; a predicate also matches later writes. */
  failOn?: string | ((call: { ns: string; ops: readonly SettingsOp[] }) => boolean)
  conflictOn?: string
  /**
   * `applies` flags the host reports per namespace, so a write can require a
   * restart. A bare string is the model namespace, which is all the cases
   * written before the plugin namespace could report one needed; a record names
   * each namespace explicitly.
   */
  applies?: string | Readonly<Record<string, string>>
}

/** The op list `autoBackupOps` builds — what separates the backup write from a namespace write. */
function isAutoBackup(ops: readonly SettingsOp[]): boolean {
  return ops.some((op) => op.op === 'set' && op.path.length === 1 && op.path[0] === AUTO_BACKUP_PATH[0])
}

function rejects(options: HarnessOptions, ns: string, ops: readonly SettingsOp[]): boolean {
  if (typeof options.failOn === 'function') return options.failOn({ ns, ops })
  return ns === options.failOn
}

/** The snapshot a backup call carries, or `undefined` when the call is not one. */
function backupValueOf(call: Call | undefined): unknown {
  const op = call?.ops.find((entry) => entry.op === 'set' && entry.path.length === 1 && entry.path[0] === AUTO_BACKUP_PATH[0])
  return op?.value
}

/**
 * Apply one path op to a section. `set` creates the intermediate objects it
 * needs; `unset` drops the leaf key. Only the shapes these tests produce are
 * supported — the real planner builds the ops under test.
 */
function applyOpToSection(section: Record<string, unknown>, op: SettingsOp): void {
  const path = [...op.path]
  const leaf = path.pop()
  if (leaf === undefined) return
  let host = section
  for (const segment of path) {
    const next = host[segment]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      const created: Record<string, unknown> = {}
      host[segment] = created
      host = created
      continue
    }
    host = next as Record<string, unknown>
  }
  if (op.op === 'unset') {
    delete host[leaf]
    return
  }
  host[leaf] = op.value
}

/**
 * A settings transport whose user layer is real mutable state: a successful
 * write mutates it and advances that namespace's revision, so a later
 * `describe()` observes the applied values rather than the values from before
 * the apply. Revisions are per namespace and enforced, exactly as the host
 * does, so a write fenced with a revision another write already moved is
 * refused as a conflict.
 */
function harness(options: HarnessOptions = {}) {
  const calls: Call[] = []
  const described: DescribeRead[] = []
  const userState: Record<string, Record<string, unknown>> = structuredClone(options.user ?? {})
  const revisions: Record<string, number> = { 'llm-pi-ai': 1, 'dsh-thinking-effort': 1 }
  const appliesOf = (ns: string): string | undefined => typeof options.applies === 'string'
    ? (ns === 'llm-pi-ai' ? options.applies : undefined)
    : options.applies?.[ns]
  const namespaces = (): SettingsNamespace[] => {
    const entries: SettingsNamespace[] = [
      { ns: 'llm-pi-ai', revision: revisions['llm-pi-ai'], value: {}, user: { ...userState['llm-pi-ai'] }, applies: appliesOf('llm-pi-ai') },
      { ns: 'dsh-thinking-effort', revision: revisions['dsh-thinking-effort'], value: {}, user: { ...userState['dsh-thinking-effort'] }, applies: appliesOf('dsh-thinking-effort') },
    ]
    for (const entry of entries) described.push({ ns: entry.ns, revision: entry.revision })
    return entries
  }
  const settings = {
    describe: vi.fn(async () => ({ ok: true as const, value: { namespaces: namespaces(), writable: true } })),
    mutate: vi.fn(async (ns: string, ops: readonly SettingsOp[], expected: number) => {
      calls.push({ ns, ops, revision: expected })
      if (ns === options.conflictOn) return { ok: false as const, error: { message: 'settings conflict', code: 'settings/conflict' } }
      if (rejects(options, ns, ops)) return { ok: false as const, error: { message: 'invalid provider profile' } }
      const current = revisions[ns] ?? 0
      if (expected !== current) {
        return { ok: false as const, error: { message: `settings namespace "${ns}" changed since it was read (expected revision ${expected}, now ${current})`, code: 'settings/conflict' } }
      }
      revisions[ns] = current + 1
      const section = userState[ns] ?? {}
      for (const op of ops) applyOpToSection(section, op)
      userState[ns] = section
      return { ok: true as const, value: { ns, revision: current + 1, value: {} } }
    }),
  }
  return { settings, calls, described, userState }
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
    // Every revision comes from the fresh describe() taken before the plan ran.
    expect(calls.map((call) => call.revision)).toEqual([1, 1])
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

  it('writes the pre-apply snapshot into the auto backup field before the namespace writes', async () => {
    const { settings, calls, described, userState } = harness({ user: { 'llm-pi-ai': { subagentEffort: 'off' } } })
    const outcome = await applySnapshot({
      snapshot: snapshotOf({ 'llm-pi-ai': { subagentEffort: 'high' } }),
      mode: 'merge',
      settings,
      autoBackup: true,
    })

    // The rollback copy is the first write of the apply: taken afterwards it
    // would not exist while the writes below are still failing.
    expect(calls.map((call) => isAutoBackup(call.ops))).toEqual([true, false])
    const backupCall = calls[0]
    expect(backupCall?.ns).toBe('dsh-thinking-effort')
    expect(backupCall?.ops).toEqual([
      { op: 'set', path: ['autoBackup'], value: expect.objectContaining({ sections: expect.objectContaining({ 'llm-pi-ai': { subagentEffort: 'off' } }) }) },
    ])
    // The backup carries what the user layer held before the apply...
    expect(backupValueOf(backupCall)).toMatchObject({ sections: { 'llm-pi-ai': { subagentEffort: 'off' } } })
    // ...while the live configuration now holds the imported value, so the
    // post-apply state cannot be what produced the backup above.
    expect(userState['llm-pi-ai']).toEqual({ subagentEffort: 'high' })
    expect(outcome.autoBackupError).toBeUndefined()
    // One read fences the whole apply: the backup needs no `describe()` of its
    // own because nothing has written the plugin namespace yet.
    expect(described.map((read) => read.revision)).toEqual([1, 1])
    expect(backupCall?.revision).toBe(1)
  })

  it('keeps the fresh rollback copy when the imported file carries a library of its own', async () => {
    const library = { work: { kind: 'dsh-thinking-effort/config-snapshot', version: 1, createdAt: '2026-09-10T00:00:00.000Z', pluginVersion: '0.2.4', sourceProfile: 'modern', sections: {} } }
    const { settings, calls, userState } = harness({
      user: {
        'llm-pi-ai': { subagentEffort: 'off' },
        'dsh-thinking-effort': { opencodeSession: { providers: {} }, profiles: library },
      },
    })

    const outcome = await applySnapshot({
      snapshot: snapshotOf({
        'llm-pi-ai': { subagentEffort: 'high' },
        'dsh-thinking-effort': {
          profiles: { stolen: { kind: 'dsh-thinking-effort/config-snapshot', version: 1, createdAt: 'x', pluginVersion: '0.2.4', sourceProfile: 'modern', sections: {} } },
          autoBackup: { kind: 'dsh-thinking-effort/config-snapshot', version: 1, createdAt: '2020-01-01T00:00:00.000Z', pluginVersion: '0.2.4', sourceProfile: 'modern', sections: {} },
        },
      }),
      mode: 'merge',
      settings,
      autoBackup: true,
      now: () => new Date('2026-09-16T12:00:00.000Z'),
    })

    // The file's plugin section holds nothing but library keys, so it plans no
    // write of its own: the only plugin write is the copy taken before the apply.
    expect(calls.map((call) => call.ns)).toEqual(['dsh-thinking-effort', 'llm-pi-ai'])
    expect(isAutoBackup(calls[0]?.ops ?? [])).toBe(true)
    expect(isAutoBackup(calls[1]?.ops ?? [])).toBe(false)
    expect(outcome.ok).toBe(true)
    expect(outcome.skipped).toBe(false)
    // The import landed its model configuration...
    expect(userState['llm-pi-ai']).toEqual({ subagentEffort: 'high' })
    // ...while the copy written first still describes what the configuration
    // held before it. The file's own `autoBackup` never overwrote the rollback
    // point this import exists to be recoverable from.
    expect(userState['dsh-thinking-effort']?.autoBackup).toEqual({
      kind: 'dsh-thinking-effort/config-snapshot',
      version: 1,
      createdAt: '2026-09-16T12:00:00.000Z',
      pluginVersion: '',
      sourceProfile: 'unknown',
      sections: {
        'dsh-thinking-effort': { opencodeSession: { providers: {} } },
        'llm-pi-ai': { subagentEffort: 'off' },
      },
    })
    // The library the file tried to hand over never reaches the live section.
    expect(userState['dsh-thinking-effort']?.profiles).toEqual(library)
  })

  it('reports a backup failure without turning the applied write into a failed apply', async () => {
    // The plugin namespace needs no write, so the plan holds only `llm-pi-ai`:
    // the refused copy is reported separately and that write still lands.
    const { settings, calls } = harness({ failOn: (call) => isAutoBackup(call.ops) })
    const outcome = await applySnapshot({
      snapshot: snapshotOf({ 'llm-pi-ai': { subagentEffort: 'high' } }),
      mode: 'merge',
      settings,
      autoBackup: true,
    })

    expect(calls).toHaveLength(2)
    expect(calls.map((call) => call.ns)).toEqual(['dsh-thinking-effort', 'llm-pi-ai'])
    expect(isAutoBackup(calls[0]?.ops ?? [])).toBe(true)
    expect(outcome.outcomes).toEqual([{ ns: 'llm-pi-ai', ok: true, revision: 2 }])
    // The write landed; only the rollback copy failed, and it says so separately.
    expect(outcome.ok).toBe(true)
    expect(outcome.autoBackupError).toBe('invalid provider profile')
  })

  it('continues to the next namespace after the first one fails', async () => {
    const { settings, calls } = harness({ failOn: 'dsh-thinking-effort' })
    const outcome = await applySnapshot({
      snapshot: snapshotOf({
        'llm-pi-ai': { subagentEffort: 'high' },
        'dsh-thinking-effort': { opencodeSession: { providers: { p: { models: { m: true } } } } },
      }),
      mode: 'merge',
      settings,
      autoBackup: false,
    })

    // The first namespace fails; the second is still attempted and still succeeds.
    expect(calls.map((call) => call.ns)).toEqual(['dsh-thinking-effort', 'llm-pi-ai'])
    expect(outcome.ok).toBe(false)
    expect(outcome.outcomes).toEqual([
      { ns: 'dsh-thinking-effort', ok: false, error: 'invalid provider profile', conflict: false },
      { ns: 'llm-pi-ai', ok: true, revision: 2 },
    ])
  })

  it('keeps the copy it wrote before a half-failed plan and fences the plugin write with it', async () => {
    const { settings, calls } = harness({ failOn: 'llm-pi-ai' })
    const outcome = await applySnapshot({
      snapshot: snapshotOf({
        'llm-pi-ai': { subagentEffort: 'high' },
        'dsh-thinking-effort': { opencodeSession: { providers: { p: { models: { m: true } } } } },
      }),
      mode: 'merge',
      settings,
      autoBackup: true,
    })

    expect(calls).toHaveLength(3)
    expect(calls.map((call) => isAutoBackup(call.ops))).toEqual([true, false, false])
    expect(calls[0]?.ns).toBe('dsh-thinking-effort')
    // The copy is of what the user layer held before the failed apply started.
    expect(backupValueOf(calls[0])).toMatchObject({ sections: { 'llm-pi-ai': {} } })
    expect(calls[0]?.revision).toBe(1)
    // The copy moved the plugin namespace's revision, so the plan's own write to
    // it is fenced with what the copy left behind rather than with 1.
    expect(calls[1]?.ns).toBe('dsh-thinking-effort')
    expect(calls[1]?.revision).toBe(2)
    expect(calls[2]?.ns).toBe('llm-pi-ai')
    expect(calls[2]?.revision).toBe(1)
    expect(outcome.ok).toBe(false)
    expect(outcome.outcomes).toEqual([
      { ns: 'dsh-thinking-effort', ok: true, revision: 3 },
      { ns: 'llm-pi-ai', ok: false, error: 'invalid provider profile', conflict: false },
    ])
    expect(outcome.autoBackupError).toBeUndefined()
  })

  it('does not back up when the plan is empty', async () => {
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

  // Restart requirements follow the writes that landed, not the plan they came
  // from: a namespace whose new configuration was refused still runs the old one,
  // so telling the user to restart for it would describe a change that never
  // happened.
  it('omits a namespace whose restart-only write failed', async () => {
    const { settings } = harness({ applies: { 'llm-pi-ai': 'restart' }, failOn: 'llm-pi-ai' })
    const outcome = await applySnapshot({
      snapshot: snapshotOf({ 'llm-pi-ai': { subagentEffort: 'high' } }),
      mode: 'merge',
      settings,
      autoBackup: false,
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.outcomes).toEqual([{ ns: 'llm-pi-ai', ok: false, error: 'invalid provider profile', conflict: false }])
    expect(outcome.restartRequired).toEqual([])
  })

  it('reports the restart-only namespace that did apply while its sibling failed', async () => {
    const { settings } = harness({ applies: { 'dsh-thinking-effort': 'restart' }, failOn: 'llm-pi-ai' })
    const outcome = await applySnapshot({
      snapshot: snapshotOf({
        'dsh-thinking-effort': { opencodeSession: { providers: { p: { models: { m: true } } } } },
        'llm-pi-ai': { subagentEffort: 'high' },
      }),
      mode: 'merge',
      settings,
      autoBackup: false,
    })

    expect(outcome.ok).toBe(false)
    expect(outcome.restartRequired).toEqual(['dsh-thinking-effort'])
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
