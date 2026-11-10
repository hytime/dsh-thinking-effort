import { describe, expect, it } from 'vitest'
import {
  COMPONENT_ROWS,
  allComponentsOn,
  componentEnabled,
  componentSwitchesFrom,
} from '@hytime/dsh-plugin-kit'

/**
 * The bundle's seven rows share one browser artifact, so the client cannot tell
 * a disabled component from an enabled one by looking at what mounted. These
 * tests pin the mapping it uses instead, including the two cases that decide
 * whether a user sees their controls at all: a row the profile never mounts, and
 * a Host that cannot answer.
 */
describe('component switches', () => {
  const entry = (moduleName: string, enabled: boolean) => ({ moduleName, enabled })

  it('names the same rows cordis.patch.yml declares', () => {
    // A row id that drifts from the composition would make its switch read the
    // wrong row, and the card would never hide.
    expect(Object.values(COMPONENT_ROWS).map((row) => row.rowId)).toEqual([
      'thinking-effort',
      'thinking-effort-settings',
      'thinking-effort-opencode',
      'thinking-effort-compaction',
      'thinking-effort-subagent',
      'thinking-effort-migration',
      'thinking-effort-composer',
    ])
  })

  it('reports each row from the inventory by module name', () => {
    const switches = componentSwitchesFrom({
      entries: [
        entry('@hytime/dsh-thinking-effort', true),
        entry('@hytime/dsh-thinking-effort/opencode', false),
        entry('@hytime/dsh-thinking-effort/composer', true),
      ],
    })
    expect(switches.levels).toBe('on')
    expect(switches.opencode).toBe('off')
    expect(switches.composer).toBe('on')
    // A row the profile does not mount is indistinguishable from disabled.
    expect(switches.subagent).toBe('off')
  })

  it('matches on the module name, not the Loader entry id', () => {
    // Entry ids are Loader-internal and can change across a reload; the module
    // specifier is what the composition declares. The root and panel rows are
    // included because compaction depends on them: without them this would be
    // 'off' through the cascade, which is the behaviour the next describe covers.
    const switches = componentSwitchesFrom({
      entries: [
        { entryId: 'root', moduleName: '@hytime/dsh-thinking-effort', enabled: true },
        { entryId: 'panel', moduleName: '@hytime/dsh-thinking-effort/settings', enabled: true },
        { entryId: 'anything-at-all', moduleName: '@hytime/dsh-thinking-effort/compaction', enabled: true },
      ],
    })
    expect(switches.compaction).toBe('on')
  })

  it('treats an unreadable inventory as unknown, which still renders', () => {
    const switches = componentSwitchesFrom(undefined)
    expect(switches.opencode).toBe('unknown')
    // Hiding a working surface because the Host could not answer would be worse
    // than showing one whose switch may be stale.
    expect(componentEnabled(switches.opencode)).toBe(true)
    expect(allComponentsOn(switches)).toBe(true)
  })

  it('counts only an explicit off as hidden', () => {
    expect(componentEnabled('on')).toBe(true)
    expect(componentEnabled('unknown')).toBe(true)
    expect(componentEnabled('off')).toBe(false)
  })

  it('reports whether anything is switched off', () => {
    const all = componentSwitchesFrom({
      entries: Object.values(COMPONENT_ROWS).map((row) => entry(row.moduleName, true)),
    })
    expect(allComponentsOn(all)).toBe(true)
    expect(allComponentsOn({ ...all, migration: 'off' })).toBe(false)
  })
})

/**
 * The seven rows are not peers: every feature reads the settings section the
 * root row publishes, and every card is rendered by the panel the `settings` row
 * owns. A profile can leave a child row on while its parent is off, so the
 * cascade has to be resolved here rather than left to each surface.
 */
describe('component dependency cascade', () => {
  const entry = (moduleName: string, enabled: boolean) => ({ moduleName, enabled })
  const all = (overrides: Record<string, boolean> = {}) => componentSwitchesFrom({
    entries: Object.values(COMPONENT_ROWS).map((row) => entry(row.moduleName, overrides[row.moduleName] ?? true)),
  })

  it('takes every dependant down when the root row is off', () => {
    const switches = all({ '@hytime/dsh-thinking-effort': false })
    expect(switches.levels).toBe('off')
    for (const key of ['settings', 'opencode', 'compaction', 'subagent', 'migration'] as const) {
      expect(switches[key], `${key} depends on the root row`).toBe('off')
    }
    // The Composer seat renders the OFFICIAL directory's tiers, so it keeps
    // working with this plugin's host half switched off.
    expect(switches.composer).toBe('on')
  })

  it('takes the configured features down when the panel row is off', () => {
    const switches = all({ '@hytime/dsh-thinking-effort/settings': false })
    expect(switches.settings).toBe('off')
    for (const key of ['opencode', 'compaction', 'subagent', 'migration'] as const) {
      expect(switches[key], `${key} has no surface without the panel`).toBe('off')
    }
    // The root row still fills default levels on the host plane.
    expect(switches.levels).toBe('on')
    expect(switches.composer).toBe('on')
  })

  it('settles a chain regardless of table order', () => {
    // root → settings → opencode is two hops; one pass over the table would
    // miss the tail if the root were visited last.
    const switches = all({ '@hytime/dsh-thinking-effort': false })
    expect(switches.opencode).toBe('off')
  })

  it('leaves siblings alone', () => {
    const switches = all({ '@hytime/dsh-thinking-effort/opencode': false })
    expect(switches.opencode).toBe('off')
    expect(switches.compaction).toBe('on')
    expect(switches.subagent).toBe('on')
    expect(switches.levels).toBe('on')
    expect(switches.settings).toBe('on')
  })

  it('does not cascade from a host that could not answer', () => {
    // `unknown` was not reported as disabled, so hiding dependants on it would
    // blank the panel on a host that merely lacks the inventory remote.
    const switches = componentSwitchesFrom(undefined)
    expect(switches.levels).toBe('unknown')
    expect(switches.opencode).toBe('unknown')
    expect(componentEnabled(switches.opencode)).toBe(true)
  })
})

/**
 * The client cannot learn about a row toggle from the Host's own announcement:
 * `plugin-manager/changed` fires for install, remove and update only, while
 * `setPluginEnabled` reloads the row and emits nothing. The Host therefore bumps
 * `switchesStamp` itself and lets `settings/document-updated` carry the signal.
 */
describe('component switch announcement channel', () => {
  const readerWith = (subscribed: string[], stopped: string[] = []) => {
    const scope = {
      get: () => ({
        pluginInventory: { list: async () => ({ ok: true, value: { entries: [] } }) },
        $on: (event: string) => {
          subscribed.push(event)
          return () => { stopped.push(event) }
        },
      }),
    }
    return {
      inject: (_names: string[], callback: (s: unknown) => void) => { callback(scope) },
      get: () => undefined,
    }
  }

  it('subscribes to both the plugin-manager and settings events', async () => {
    const { readComponentSwitches } = await import('../packages/kit/src/shared/read-component-switches.js')
    const subscribed: string[] = []
    readComponentSwitches(readerWith(subscribed) as never, () => undefined)
    // Both, because either can move the inventory on its own: an install changes
    // it without touching this plugin's section, and a row toggle changes it
    // through that section only.
    expect(subscribed).toContain('plugin-manager/changed')
    expect(subscribed).toContain('settings/document-updated')
  })

  it('stops both subscriptions when the caller disposes', async () => {
    const { readComponentSwitches } = await import('../packages/kit/src/shared/read-component-switches.js')
    const subscribed: string[] = []
    const stopped: string[] = []
    const dispose = readComponentSwitches(readerWith(subscribed, stopped) as never, () => undefined)
    dispose?.()
    expect(stopped).toEqual(['plugin-manager/changed', 'settings/document-updated'])
  })
})
