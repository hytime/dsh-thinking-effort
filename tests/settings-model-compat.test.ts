import { describe, expect, it } from 'vitest'

import { installOpenCodeSession } from '../src/host/opencode-session.ts'
import { installSettingsWatcher } from '../src/host/settings.ts'
import { resolveSubagentEffort } from '../src/host/subagent.ts'
import { capabilitiesForVersion, settingsModelForRuntime, settingsModelForVersion } from '../src/compat/version-map.ts'
import { readSettingsSection, settingsChangeEvents, settingsEntryId, settingsModelOf } from '../src/compat/settings-model.ts'
import type { SettingsPathOp } from '../src/host/types.ts'

/**
 * The 0.1.7-alpha.1 settings service: forms are derived from each Loader
 * entry's own Config schema, so a plugin neither registers a namespace nor
 * reads one back by id. `register`, `installSection` and `get` are all gone.
 */
function createEntryConfigSettings(options: { readonly value?: unknown } = {}) {
  const updates: Array<{ ns: string; patch: object }> = []
  const settings = {
    writable: true,
    describe: () => (options.value === undefined ? [] : [{ ns: 'thinking-effort', value: options.value }]),
    update: async (ns: string, patch: object) => {
      updates.push({ ns, patch })
    },
    replace: async () => {},
    mutate: async () => {},
    configure: () => () => {},
  }
  return { settings, updates }
}

/**
 * A service that still carries the removed namespace APIs. No supported release
 * exposes these, so it is only useful for proving the plugin does not depend on
 * them: a live `describe` is what the plugin reads and watches.
 */
function createLegacyShapedSettings() {
  const watched: Array<() => void> = []
  const settings = {
    writable: true,
    describe: () => [],
    get: () => ({ providers: {} }),
    update: async () => {},
    register: () => ({ get: () => ({}), watch: (callback: () => void) => {
      watched.push(callback)
      return () => {}
    } }),
  }
  return { settings, watched }
}

function createContext(settings: unknown, options: { readonly config?: unknown; readonly entryId?: string } = {}) {
  const listeners: string[] = []
  const scheduled: Array<() => void> = []
  const context = {
    config: options.config ?? {},
    settings,
    fiber: options.entryId === undefined ? undefined : { entry: { options: { id: options.entryId } } },
    inject: (_dependencies: readonly string[], callback: (scope: unknown) => void) => {
      callback({ settings, effect: () => {} })
    },
    timeout: (callback: () => void) => {
      scheduled.push(callback)
      return () => {}
    },
    on: (event: string) => {
      listeners.push(event)
      return () => {}
    },
    effect: (callback: () => void | (() => void)) => callback(),
  }
  return { context, listeners, scheduled }
}

describe('settings model detection', () => {
  it('reads the model from the live service rather than the version', () => {
    expect(settingsModelOf(createEntryConfigSettings().settings)).toBe('entry-config')
    expect(settingsModelOf(createLegacyShapedSettings().settings)).toBe('entry-config')
    // A service exposing neither a recognizable shape nor a `describe` has no
    // model to report; the plugin keeps its most conservative behaviour.
    expect(settingsModelOf({ writable: true, register: () => undefined })).toBeUndefined()
    expect(settingsModelOf({ writable: true })).toBeUndefined()
    expect(settingsModelOf(undefined)).toBeUndefined()
  })

  it('prefers the live service and falls back to the version map', () => {
    // The live service wins over the version string in both directions: it
    // names entry-config even for a version the map does not cover.
    expect(settingsModelForRuntime({ settings: createEntryConfigSettings().settings, version: '0.1.6-alpha.1' }))
      .toBe('entry-config')
    expect(settingsModelForRuntime({ settings: createEntryConfigSettings().settings, version: '0.2.3-0' }))
      .toBe('entry-config')
    expect(settingsModelForRuntime({ settings: createLegacyShapedSettings().settings, version: '0.2.3-0' }))
      .toBe('entry-config')
    // With no recognizable service the version map answers.
    expect(settingsModelForRuntime({ settings: { writable: true }, version: '0.1.7-alpha.1' }))
      .toBe('entry-config')
    expect(settingsModelForRuntime({ settings: { writable: true } })).toBeUndefined()
  })

  it('subscribes to the event the model actually emits', () => {
    expect(settingsChangeEvents('entry-config')).toEqual(['settings/document-updated'])
    // The namespace model's event is not part of the returned set.
    expect(settingsChangeEvents('entry-config')).not.toContain('settings/updated')
  })
})

describe('settings section reads', () => {
  it('reads the resolved value out of describe', () => {
    const settings = { describe: () => [{ ns: 'llm-pi-ai', value: { providers: { route: {} } } }] }
    expect(readSettingsSection(settings, 'llm-pi-ai')).toEqual({ providers: { route: {} } })
  })

  it('never reads through get, and stays undefined when describe cannot answer', () => {
    let getCalls = 0
    const withGet = {
      get: (ns: string) => { getCalls += 1; return { read: ns } },
      describe: () => [],
    }
    // The removed `get` is not a fallback: a service that still carries one is
    // read through `describe`, and an empty `describe` means no value.
    expect(readSettingsSection(withGet, 'llm-pi-ai')).toBeUndefined()
    expect(getCalls).toBe(0)

    expect(readSettingsSection({ describe: () => { throw new Error('boom') } }, 'llm-pi-ai')).toBeUndefined()
    expect(readSettingsSection({}, 'llm-pi-ai')).toBeUndefined()
  })

  it('addresses the plugin section by its live entry id', () => {
    expect(settingsEntryId({ fiber: { entry: { options: { id: 'thinking-effort' } } } }, 'fallback'))
      .toBe('thinking-effort')
    expect(settingsEntryId({}, 'fallback')).toBe('fallback')
    expect(settingsEntryId({ fiber: { entry: { options: { id: '' } } } }, 'fallback')).toBe('fallback')
  })
})

describe('0.1.7-alpha.1 entry-config settings model', () => {
  it('is mapped as its own capability window', () => {
    expect(capabilitiesForVersion('0.1.7-alpha.1')?.settingsModel).toBe('entry-config')
    expect(settingsModelForVersion('0.1.7-alpha.1')).toBe('entry-config')
  })

  it('maps no release below the 0.1.7-alpha.1 floor', () => {
    // The rc.7 … 0.1.6 lines used the registered-namespace model and are no
    // longer supported, so the map answers nothing for them.
    expect(settingsModelForVersion('0.1.6-alpha.1')).toBeUndefined()
    expect(settingsModelForVersion('0.1.6-alpha.2')).toBeUndefined()
    expect(settingsModelForVersion('0.1.7-0')).toBeUndefined()
  })

  it('installs the session namespace without the removed register API', () => {
    const { settings } = createEntryConfigSettings()
    const { context } = createContext(settings)
    expect(() => installOpenCodeSession(context as never)).not.toThrow()
  })

  it('subscribes to the replacement change event instead of settings/updated', () => {
    const { settings } = createEntryConfigSettings()
    const { context, listeners } = createContext(settings)
    installOpenCodeSession(context as never)
    expect(listeners).toContain('settings/document-updated')
    expect(listeners).not.toContain('settings/updated')
  })

  it('still installs a section when a legacy register API is present', () => {
    const { settings, watched } = createLegacyShapedSettings()
    const { context, listeners } = createContext(settings)
    installOpenCodeSession(context as never)
    // The registered scope owns change delivery, so neither change event is used.
    expect(watched).toHaveLength(1)
    expect(listeners).not.toContain('settings/document-updated')
  })

  it('follows the model when subscribing the provider-default filler', () => {
    const entry = createContext(createEntryConfigSettings().settings)
    installSettingsWatcher(entry.context as never)
    expect(entry.listeners).toContain('settings/document-updated')
    expect(entry.listeners).not.toContain('settings/updated')

    // A service that still carries `register` is watched through the
    // document-scoped event as well: the namespace branch no longer selects an
    // event for the filler.
    const legacyShaped = createContext(createLegacyShapedSettings().settings)
    installSettingsWatcher(legacyShaped.context as never)
    expect(legacyShaped.listeners).toContain('settings/document-updated')
    expect(legacyShaped.listeners).not.toContain('settings/updated')
  })

  it('reads its own section from describe and follows the live entry id', () => {
    const { settings } = createEntryConfigSettings({ value: { opencodeSession: { format: { mode: 'template' } } } })
    const { context, listeners } = createContext(settings, { entryId: 'thinking-effort' })
    installOpenCodeSession(context as never)
    expect(listeners).toContain('settings/document-updated')
  })

  it('keeps filling provider defaults without the removed get call', async () => {
    const mutations: Array<{ ns: string; ops: readonly SettingsPathOp[] }> = []
    const settings = {
      writable: true,
      describe: () => [{
        ns: 'llm-pi-ai',
        // The resolved value and the user's own layer differ by nothing here,
        // which is what a section the user wrote in full looks like.
        value: { providers: { route: { models: [{ id: 'm' }] } } },
        user: { providers: { route: { models: [{ id: 'm' }] } } },
      }],
      // A merge would restate the resolved subtree and pin its defaults, so the
      // fill must never reach for it.
      update: async () => { throw new Error('the fill must address paths, not merge a subtree') },
      mutate: async (ns: string, ops: readonly SettingsPathOp[]) => {
        mutations.push({ ns, ops })
      },
    }
    const { context, scheduled } = createContext(settings)
    installSettingsWatcher(context as never)
    expect(scheduled.length).toBeGreaterThan(0)
    for (const callback of scheduled) await callback()
    expect(mutations).toEqual([{
      ns: 'llm-pi-ai',
      ops: [{
        op: 'set',
        path: ['providers', 'route', 'models'],
        value: [{ id: 'm', reasoningEfforts: { off: null, high: 'high', max: 'max' } }],
      }],
    }])
  })

  it('declines to run the filler when the section is unreadable', async () => {
    const settings = { writable: true, describe: () => [], update: async () => {} }
    const { context, scheduled } = createContext(settings)
    installSettingsWatcher(context as never)
    for (const callback of scheduled) await callback()
    // Only the retry chain remains; no write is attempted for a missing section.
    expect(scheduled.length).toBeGreaterThan(0)
  })

  it('resolves a subagent level through describe when get is absent', () => {
    const settings = {
      writable: true,
      describe: () => [{
        ns: 'llm-pi-ai',
        // A non-standard wire spelling forces the provider-model lookup, and
        // `subagentEffort` stores that spelling rather than a level key.
        user: { subagentEffort: 'xhigh-custom' },
        value: { providers: { route: { models: [{ id: 'm', reasoningEfforts: { off: null, deep: 'xhigh-custom' } }] } } },
      }],
      update: async () => {},
    }
    expect(resolveSubagentEffort(settings as never, { provider: 'route', model: 'm' })).toBe('deep')
    expect(resolveSubagentEffort(settings as never, { provider: 'route', model: 'other' })).toBeUndefined()
  })

  it('resolves a standard subagent level without reading the section at all', () => {
    const settings = { writable: true, describe: () => [{ ns: 'llm-pi-ai', user: { subagentEffort: 'high' } }] }
    expect(resolveSubagentEffort(settings as never, undefined)).toBe('high')
  })
})
