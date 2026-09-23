import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it } from 'vitest'
import { LEGACY_RESULT_APPLIED, LEGACY_RESULT_DISMISSED } from '../src/compat/legacy-migration.ts'
import { installLegacyMigration } from '../src/host/legacy-watcher.ts'
import type { SettingsPathOp } from '../src/host/types.ts'

const NS = 'thinking-effort'
const IMPORTED = '/home/u/.dsh/settings.yaml.imported'

const DOCUMENT = 'dsh-thinking-effort:\n  subagentEffort: off\n'

type Listeners = Record<string, Array<(...args: unknown[]) => unknown>>

/** One in-memory settings document plus the events a write raises. */
function harness(options: { entryConfig?: boolean; failMutate?: boolean; modelTransaction?: boolean } = {}) {
  const listeners: Listeners = {}
  const mutations: Array<{ ns: string; ops: readonly SettingsPathOp[] }> = []
  /**
   * The host's write transaction. 0.1.7 raises the settings-change event from
   * inside the write that caused it and tracks that transaction with
   * `AsyncLocalStorage`, so a listener that writes back is refused with "HMR
   * transactions cannot be nested" — and so is anything it defers, because the
   * context travels with the store. Modelling it here is the only way a case in
   * this file can exercise the escape the watcher must use; without it the
   * nesting bug is invisible to every case.
   */
  const transaction = new AsyncLocalStorage<true>()
  let document: Record<string, unknown> = {}

  const resolve = (value: Record<string, unknown>, path: readonly string[]): unknown =>
    path.reduce<unknown>((node, key) => (
      typeof node === 'object' && node !== null && !Array.isArray(node)
        ? (node as Record<string, unknown>)[key]
        : undefined
    ), value)

  /** One host write: refuse inside a transaction, apply the ops, then raise the event. */
  const hostWrite = async (ns: string, ops: readonly SettingsPathOp[]): Promise<void> => {
    if (options.modelTransaction === true && transaction.getStore() === true) {
      throw new Error('HMR transactions cannot be nested')
    }
    // `failMutate` refuses the MIGRATION batch only — a batch that writes the
    // plugin's own settings rather than the migration control object. The
    // control object must stay writable even then, because recording "the write
    // was refused" is exactly how the prompt learns it can offer a retry;
    // failing every write would leave that record unwritable.
    if (options.failMutate === true && ops.some((op) => op.path[0] !== 'legacyMigration')) {
      throw new Error('refused')
    }
    mutations.push({ ns, ops })
    const next = structuredClone(document)
    for (const op of ops) {
      const parents = op.path.slice(0, -1)
      let node = next as Record<string, unknown>
      for (const key of parents) {
        if (typeof node[key] !== 'object' || node[key] === null) node[key] = {}
        node = node[key] as Record<string, unknown>
      }
      node[op.path[op.path.length - 1] as string] = op.value
    }
    document = next
    const raise = (): void => {
      for (const listener of listeners['settings/document-updated'] ?? []) listener(NS, 1)
    }
    if (options.modelTransaction === true) {
      await transaction.run(true, async () => {
        raise()
        await Promise.resolve()
      })
      return
    }
    raise()
  }

  const settings: Record<string, unknown> = {
    writable: true,
    update: async () => {},
    describe: () => [{ ns: NS, revision: 0, value: document, user: document }],
    mutate: hostWrite,
  }
  if (options.entryConfig !== true) {
    settings.get = () => document
    settings.register = () => ({ get: () => ({}), watch: () => () => {} })
  }

  const scheduled: Array<() => void> = []
  const context = {
    settings,
    fiber: { entry: { options: { id: NS } } },
    timeout: (callback: () => void) => { scheduled.push(callback); return () => {} },
    on: (event: string, callback: (...args: unknown[]) => unknown) => {
      listeners[event] = [...(listeners[event] ?? []), callback]
      return () => {}
    },
    effect: (callback: () => void | (() => void)) => callback(),
  }

  return {
    context,
    mutations,
    scheduled,
    document: () => document,
    user: () => resolve(document, ['legacyMigration']) as Record<string, unknown> | undefined,
    /**
     * Make a decision the way the Client does — through a write, so the event
     * that carries it is raised inside the host transaction.
     */
    decide: (patch: Record<string, unknown>) => {
      const current = (resolve(document, ['legacyMigration']) as Record<string, unknown> | undefined) ?? {}
      return hostWrite(NS, [{ op: 'set', path: ['legacyMigration'], value: { ...current, ...patch } }])
    },
    fire: (event: string, ...args: unknown[]) => {
      for (const listener of listeners[event] ?? []) listener(...args)
    },
    settle: async () => {
      for (let index = 0; index < scheduled.length; index += 1) {
        await scheduled[index]?.()
        await Promise.resolve()
        await Promise.resolve()
      }
    },
  }
}

const home = { home: '/home/u/.dsh', read: async (path: string) => {
  if (path !== IMPORTED) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  return DOCUMENT
} }

describe('installLegacyMigration', () => {
  it('arms the prompt on an entry-config host with legacy data', async () => {
    const test = harness({ entryConfig: true })
    installLegacyMigration(test.context as never, home)
    await test.settle()
    expect(test.user()?.pending).toBe(true)
    expect((test.user()?.candidates as unknown[]).length).toBe(1)
  })

  it('writes nothing on a namespace host, where the legacy section is still live', async () => {
    const test = harness()
    installLegacyMigration(test.context as never, home)
    await test.settle()
    expect(test.mutations).toEqual([])
  })

  it('writes nothing when there is no legacy data', async () => {
    const test = harness({ entryConfig: true })
    installLegacyMigration(test.context as never, { home: '/home/u/.dsh', read: async () => { throw new Error('ENOENT') } })
    await test.settle()
    expect(test.mutations).toEqual([])
  })

  it('migrates on decision=migrate and clears the prompt', async () => {
    const test = harness({ entryConfig: true })
    installLegacyMigration(test.context as never, home)
    await test.settle()
    test.document().legacyMigration = { ...(test.user() ?? {}), decision: 'migrate' }
    test.fire('settings/document-updated', NS, 2)
    await test.settle()
    expect(test.document().subagentEffort).toBe('off')
    expect(test.user()?.pending).toBe(false)
    expect(test.user()?.lastResult).toBe('applied')
  })

  it('migrates from inside the write transaction 0.1.7 raises the change event in', async () => {
    // The decision is made the way the Client makes it — through a write whose
    // event fires INSIDE the host transaction — so the pass that acts on it
    // inherits that transaction. The migration batch must still be accepted,
    // which is what the apply-time `AsyncResource` is for. Without it the batch
    // is refused and this case reports `failed:` instead.
    const test = harness({ entryConfig: true, modelTransaction: true })
    installLegacyMigration(test.context as never, home)
    await test.settle()
    expect(test.user()?.pending).toBe(true)

    await test.decide({ decision: 'migrate' })
    await test.settle()

    expect(test.document().subagentEffort).toBe('off')
    expect(test.user()?.pending).toBe(false)
    expect(test.user()?.lastResult).toBe(LEGACY_RESULT_APPLIED)
  })

  it('leaves a rollback snapshot of the settings the migration extended', async () => {
    const test = harness({ entryConfig: true })
    installLegacyMigration(test.context as never, home)
    await test.settle()
    // A setting the migration does NOT offer, so the snapshot has something it
    // must copy. Asserting only on the excluded keys would hold for an
    // implementation that copied nothing at all, because they are absent either
    // way — the copy has to be shown positively.
    test.document().opencodeSession = { format: { mode: 'template' } }
    test.document().legacyMigration = { ...(test.user() ?? {}), decision: 'migrate' }
    test.fire('settings/document-updated', NS, 2)
    await test.settle()
    const backup = test.document().autoBackup as Record<string, unknown>
    expect(backup?.kind).toBe('dsh-thinking-effort/config-snapshot')
    expect(backup?.sourceProfile).toBe('migration')
    const captured = (backup?.sections as Record<string, Record<string, unknown>>)[NS] ?? {}
    // The user's own setting is in the copy ...
    expect(captured.opencodeSession).toEqual({ format: { mode: 'template' } })
    // ... and the state the migration extended had no effort set yet.
    expect(captured).not.toHaveProperty('subagentEffort')
    // and the copy must not nest the library, the slot it lives in, or the prompt state.
    expect(captured).not.toHaveProperty('autoBackup')
    expect(captured).not.toHaveProperty('profiles')
    expect(captured).not.toHaveProperty('legacyMigration')
  })

  it('clears decision=scan when the rescan finds nothing left to migrate', async () => {
    const test = harness({ entryConfig: true })
    installLegacyMigration(test.context as never, home)
    await test.settle()
    // The user moved the value in by hand: nothing is left to offer.
    test.document().subagentEffort = 'off'
    test.document().legacyMigration = { ...(test.user() ?? {}), decision: 'scan' }
    test.fire('settings/document-updated', NS, 2)
    await test.settle()
    expect(test.user()?.decision).toBe('')
    expect(test.user()?.pending).toBe(false)
    expect(test.user()?.candidates).toEqual([])
  })

  it('retires a stale offer when the values were set by hand', async () => {
    const test = harness({ entryConfig: true })
    installLegacyMigration(test.context as never, home)
    await test.settle()
    expect(test.user()?.pending).toBe(true)
    test.document().subagentEffort = 'max'
    test.fire('settings/document-updated', NS, 2)
    await test.settle()
    expect(test.user()?.pending).toBe(false)
    expect(test.user()?.candidates).toEqual([])
  })

  it('ignores client-supplied candidates and writes only what it scanned itself', async () => {
    const test = harness({ entryConfig: true })
    installLegacyMigration(test.context as never, home)
    await test.settle()
    // The section is user-writable and volatile, so a tampered control object can
    // offer anything. Only the host's own scan may become a path write.
    test.document().legacyMigration = {
      ...(test.user() ?? {}),
      decision: 'migrate',
      candidates: [{ path: ['opencodeSession', 'format', 'script'], value: '/tmp/hostile.js', source: 'tampered' }],
    }
    test.fire('settings/document-updated', NS, 2)
    await test.settle()
    expect(test.document().opencodeSession).toBeUndefined()
    expect(test.document().subagentEffort).toBe('off')
  })

  it('records a dismissal and never asks again for the same offer', async () => {
    const test = harness({ entryConfig: true })
    installLegacyMigration(test.context as never, home)
    await test.settle()
    const signature = test.user()?.signature
    test.document().legacyMigration = { ...(test.user() ?? {}), decision: 'dismiss' }
    test.fire('settings/document-updated', NS, 2)
    await test.settle()
    expect(test.user()?.dismissedSignature).toBe(signature)
    expect(test.user()?.lastResult).toBe(LEGACY_RESULT_DISMISSED)
    expect(test.user()?.pending).toBe(false)

    // A later rescan of the same data must not re-arm.
    const before = test.mutations.length
    test.fire('settings/document-updated', NS, 3)
    await test.settle()
    expect(test.mutations.length).toBe(before)
    expect(test.user()?.pending).toBe(false)
  })

  it('re-arms when the legacy data changed after a dismissal', async () => {
    const test = harness({ entryConfig: true })
    let text = DOCUMENT
    installLegacyMigration(test.context as never, {
      home: '/home/u/.dsh',
      read: async () => text,
    })
    await test.settle()
    test.document().legacyMigration = { ...(test.user() ?? {}), decision: 'dismiss' }
    test.fire('settings/document-updated', NS, 2)
    await test.settle()
    expect(test.user()?.pending).toBe(false)

    text = 'dsh-thinking-effort:\n  subagentEffort: off\n  opencodeSession:\n    format:\n      mode: template\n'
    test.fire('settings/document-updated', NS, 3)
    await test.settle()
    expect(test.user()?.pending).toBe(true)
    expect((test.user()?.candidates as unknown[]).length).toBe(2)
  })

  it('reports a refused write and keeps the prompt for a retry', async () => {
    const test = harness({ entryConfig: true, failMutate: true })
    installLegacyMigration(test.context as never, home)
    await test.settle()
    test.document().legacyMigration = { ...(test.user() ?? {}), decision: 'migrate' }
    test.fire('settings/document-updated', NS, 2)
    await test.settle()
    expect(String(test.user()?.lastResult)).toMatch(/^failed:/)
    expect(test.user()?.pending).toBe(true)
  })

  it('honours a forced scan without a dismissal', async () => {
    const test = harness({ entryConfig: true })
    installLegacyMigration(test.context as never, home)
    await test.settle()
    test.document().legacyMigration = { ...(test.user() ?? {}), decision: 'dismiss' }
    test.fire('settings/document-updated', NS, 2)
    await test.settle()
    expect(test.user()?.pending).toBe(false)

    test.document().legacyMigration = { ...(test.user() ?? {}), decision: 'scan' }
    test.fire('settings/document-updated', NS, 3)
    await test.settle()
    expect(test.user()?.pending).toBe(true)
  })
})
