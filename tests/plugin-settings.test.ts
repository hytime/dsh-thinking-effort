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

const formatDefaults = {
  mode: 'ses-derive',
  time: 'firstUse',
  template: '',
  expression: '',
  script: '',
  validate: '',
  onInvalid: 'warn',
}

const userAgentDefaults = { value: '', providers: {} }

describe('PLUGIN_SETTINGS_SCHEMA', () => {
  it('resolves a full section without altering it apart from owned field defaults', () => {
    const resolved = PLUGIN_SETTINGS_SCHEMA(section) as { opencodeSession?: Record<string, unknown> }
    const { opencodeSession, ...rest } = resolved
    expect(rest).toEqual({ ...section, opencodeSession: undefined })
    expect(opencodeSession).toEqual({
      providers: { p: { models: { m: true } } },
      format: formatDefaults,
      userAgent: userAgentDefaults,
    })
  })

  it('materializes every owned field for an empty section so editors see a stable shape', () => {
    const resolved = PLUGIN_SETTINGS_SCHEMA({ opencodeSession: { providers: {} } }) as unknown as Record<string, unknown>
    expect(Object.keys(resolved)).toEqual(['opencodeSession', 'profiles', 'autoBackup'])
    expect(resolved.profiles).toEqual({})
    expect((resolved.opencodeSession as Record<string, unknown>).format).toEqual(formatDefaults)
    expect((resolved.opencodeSession as Record<string, unknown>).userAgent).toEqual(userAgentDefaults)
  })

  it('publishes the new fields on its serialized JSON so configuration surfaces can render them', () => {
    const json = JSON.stringify(PLUGIN_SETTINGS_SCHEMA.toJSON())
    expect(json).toContain('profiles')
    expect(json).toContain('autoBackup')
    expect(json).toContain('ses-derive')
    expect(json).toContain('onInvalid')
  })
})
