import { describe, expect, it } from 'vitest'
import { PLUGIN_SETTINGS_SCHEMA } from '../src/host/plugin-settings.ts'

const section = {
  opencodeSession: { providers: { p: { models: { m: true } } } },
  profiles: {
    work: {
      kind: 'dsh-thinking-effort/config-snapshot',
      version: 1,
      createdAt: '2026-09-16T00:00:00.000Z',
      pluginVersion: '0.2.4',
      sourceProfile: 'modern',
      sections: {
        'llm-pi-ai': { providers: { p: { baseURL: 'http://p', models: [{ id: 'a', compat: { supportsStore: true } }] } }, subagentEffort: 'off' },
        'dsh-thinking-effort': { opencodeSession: { providers: {} } },
      },
    },
  },
  autoBackup: {
    kind: 'dsh-thinking-effort/config-snapshot',
    version: 1,
    createdAt: '2026-09-15T00:00:00.000Z',
    pluginVersion: '0.2.4',
    sourceProfile: 'legacy',
    sections: { 'llm-pi-ai': { subagentEffort: 'high' } },
  },
}

describe('PLUGIN_SETTINGS_SCHEMA', () => {
  it('resolves a full section without altering it', () => {
    const resolved = PLUGIN_SETTINGS_SCHEMA(section) as unknown
    expect(resolved).toEqual(section)
  })

  it('materializes every owned field for an empty section so editors see a stable shape', () => {
    const resolved = PLUGIN_SETTINGS_SCHEMA({ opencodeSession: { providers: {} } }) as unknown as Record<string, unknown>
    expect(Object.keys(resolved)).toEqual(['opencodeSession', 'profiles', 'autoBackup'])
    expect(resolved.profiles).toEqual({})
  })

  it('publishes the new fields on its serialized JSON so configuration surfaces can render them', () => {
    const json = JSON.stringify(PLUGIN_SETTINGS_SCHEMA.toJSON())
    expect(json).toContain('profiles')
    expect(json).toContain('autoBackup')
  })
})
