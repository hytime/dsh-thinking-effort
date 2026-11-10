import { describe, expect, it } from 'vitest'
import { installSwitchesStampWatcher } from '../packages/levels/src/switches-stamp.js'

/**
 * The Host half of the component-switch announcement.
 *
 * A row toggled in the plugin page calls `setPluginEnabled`, which reloads the
 * row and emits no forwardable event, so the client has no way to know the
 * inventory moved. The Host writes a counter into its own settings section on
 * every Loader update instead; that write raises `settings/document-updated`,
 * which the client already subscribes to. These tests pin the write, not the
 * transport.
 */
describe('installSwitchesStampWatcher', () => {
  /** A context whose settings service records writes and whose Loader event is drivable. */
  const harness = (options: { held?: number; model?: 'entry-config' | 'namespace' } = {}) => {
    const events = new Map<string, () => void>()
    const writes: Array<{ ns: string; ops: unknown; revision?: number }> = []
    const settings = {
      describe: () => [{
        ns: 'thinking-effort',
        revision: 7,
        value: {},
        user: options.held === undefined ? {} : { switchesStamp: options.held },
      }],
      mutate: (ns: string, ops: unknown, revision?: number) => {
        writes.push({ ns, ops, revision })
        return Promise.resolve()
      },
    }
    const context = {
      get: (name: string) => (name === 'settings' ? settings : undefined),
      on: (event: string, callback: () => void) => {
        events.set(event, callback)
        return () => { events.delete(event) }
      },
      effect: (callback: () => unknown) => { callback(); return () => undefined },
      // The runtime settings model. The watcher installs only under
      // `entry-config`, because the namespace model has no update event to carry
      // the counter.
      ...options.model === 'namespace' ? {} : {},
      fiber: undefined,
    }
    return { context, events, writes }
  }

  it('bumps the counter when the Loader reports a row change', async () => {
    const { context, events, writes } = harness({ held: 4 })
    installSwitchesStampWatcher(context as never)
    const bump = events.get('loader/volatile-update')
    expect(bump).toBeTypeOf('function')

    bump?.()
    await Promise.resolve()

    expect(writes).toHaveLength(1)
    expect(writes[0]?.ns).toBe('thinking-effort')
    expect(writes[0]?.ops).toEqual([{ op: 'set', path: ['switchesStamp'], value: 5 }])
    // Fenced against the revision the read reported, so a concurrent edit is not
    // silently overwritten.
    expect(writes[0]?.revision).toBe(7)
  })

  it('starts from zero when the section never carried the field', async () => {
    const { context, events, writes } = harness()
    installSwitchesStampWatcher(context as never)
    events.get('loader/volatile-update')?.()
    await Promise.resolve()
    expect(writes[0]?.ops).toEqual([{ op: 'set', path: ['switchesStamp'], value: 1 }])
  })

  it('counts up rather than stamping a clock', async () => {
    // Two toggles inside one clock tick are ordinary; a timestamp would render
    // them indistinguishable and the client would refresh once instead of twice.
    const { context, events, writes } = harness({ held: 41 })
    installSwitchesStampWatcher(context as never)
    const bump = events.get('loader/volatile-update')
    bump?.()
    await Promise.resolve()
    expect(writes[0]?.ops).toEqual([{ op: 'set', path: ['switchesStamp'], value: 42 }])
  })

  it('writes nothing when the profile exposes no settings service', async () => {
    const events = new Map<string, () => void>()
    const context = {
      get: () => undefined,
      on: (event: string, callback: () => void) => { events.set(event, callback); return () => undefined },
      effect: (callback: () => unknown) => { callback(); return () => undefined },
    }
    installSwitchesStampWatcher(context as never)
    // The client already renders every part on a host without the inventory
    // remote, so there is nothing to announce and no section to write into.
    expect(events.has('loader/volatile-update')).toBe(false)
  })
})
