import { describe, expect, it } from 'vitest'

import { installOpenCodeSession } from '../src/host/opencode-session.ts'
import { installSettingsWatcher } from '../src/host/settings.ts'
import { resolveSubagentEffort } from '../src/host/subagent.ts'
import { capabilitiesForVersion, settingsModelForRuntime, settingsModelForVersion } from '../src/compat/version-map.ts'
import { readSettingsSection, settingsChangeEvents, settingsEntryId, settingsModelOf } from '../src/compat/settings-model.ts'

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

/** The rc.7 … 0.1.6 service, which registers namespaces and reads them by id. */
function createNamespaceSettings() {
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
    expect(settingsModelOf(createNamespaceSettings().settings)).toBe('namespace')
    expect(settingsModelOf(createEntryConfigSettings().settings)).toBe('entry-config')
    expect(settingsModelOf({ writable: true })).toBeUndefined()
    expect(settingsModelOf(undefined)).toBeUndefined()
  })

  it('prefers the live service and falls back to the version map', () => {
    expect(settingsModelForRuntime({ settings: createEntryConfigSettings().settings, version: '0.1.6-alpha.1' }))
      .toBe('entry-config')
    expect(settingsModelForRuntime({ settings: createNamespaceSettings().settings, version: '0.1.7-alpha.1' }))
      .toBe('namespace')
    expect(settingsModelForRuntime({ settings: { writable: true }, version: '0.1.7-alpha.1' }))
      .toBe('entry-config')
    expect(settingsModelForRuntime({ settings: { writable: true } })).toBeUndefined()
  })

  it('subscribes to the event the model actually emits', () => {
    expect(settingsChangeEvents('namespace')).toEqual(['settings/updated'])
    expect(settingsChangeEvents('entry-config')).toEqual(['settings/document-updated'])
  })
})

describe('settings section reads', () => {
  it('reads through get when the service has one', () => {
    const settings = { get: (ns: string) => ({ read: ns }), describe: () => [] }
    expect(readSettingsSection(settings, 'llm-pi-ai')).toEqual({ read: 'llm-pi-ai' })
  })

  it('falls back to describe when get is absent', () => {
    const settings = { describe: () => [{ ns: 'llm-pi-ai', value: { providers: { route: {} } } }] }
    expect(readSettingsSection(settings, 'llm-pi-ai')).toEqual({ providers: { route: {} } })
  })

  it('falls back to describe when get throws, and stays undefined when both fail', () => {
    const throwing = { get: () => { throw new Error('boom') }, describe: () => [{ ns: 'other', value: 1 }] }
    expect(readSettingsSection(throwing, 'llm-pi-ai')).toBeUndefined()
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

  it('keeps the 0.1.6 line on the registered-namespace model', () => {
    expect(settingsModelForVersion('0.1.6-alpha.1')).toBe('namespace')
    expect(settingsModelForVersion('0.1.6-alpha.2')).toBe('namespace')
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

  it('still registers a namespace on the registered-namespace model', () => {
    const { settings, watched } = createNamespaceSettings()
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

    const registered = createContext(createNamespaceSettings().settings)
    installSettingsWatcher(registered.context as never)
    expect(registered.listeners).toContain('settings/updated')
    expect(registered.listeners).not.toContain('settings/document-updated')
  })

  it('reads its own section from describe and follows the live entry id', () => {
    const { settings } = createEntryConfigSettings({ value: { opencodeSession: { format: { mode: 'template' } } } })
    const { context, listeners } = createContext(settings, { entryId: 'thinking-effort' })
    installOpenCodeSession(context as never)
    expect(listeners).toContain('settings/document-updated')
  })

  it('keeps filling provider defaults without the removed get call', async () => {
    const settings = {
      writable: true,
      describe: () => [{ ns: 'llm-pi-ai', value: { providers: { route: { models: [{ id: 'm' }] } } } }],
      update: async (ns: string, patch: { providers: Record<string, { models: Array<{ id: string }> }> }) => {
        settings.updated = { ns, patch }
      },
      updated: undefined as unknown,
    }
    const { context, scheduled } = createContext(settings)
    installSettingsWatcher(context as never)
    expect(scheduled.length).toBeGreaterThan(0)
    for (const callback of scheduled) await callback()
    expect(settings.updated).toMatchObject({
      ns: 'llm-pi-ai',
      patch: { providers: { route: { models: [{ id: 'm', reasoningEfforts: { off: null, high: 'high', max: 'max' } }] } } },
    })
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
