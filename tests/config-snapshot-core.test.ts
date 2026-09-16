import { describe, expect, it } from 'vitest'
import { pluginSectionOf, snapshotFileName, snapshotFromNamespaces, userSectionOf } from '../src/client/config-snapshot/snapshot.js'
import { SNAPSHOT_KIND, SNAPSHOT_VERSION } from '../src/client/config-snapshot/types.js'
import type { SettingsNamespace } from '../src/client/types.js'

const llm = (user?: Record<string, unknown>): SettingsNamespace => ({
  ns: 'llm-pi-ai',
  revision: 3,
  value: { providers: { resolved: { baseURL: 'http://derived' } } },
  user,
})

const plugin = (user?: Record<string, unknown>): SettingsNamespace => ({
  ns: 'dsh-thinking-effort',
  revision: 7,
  value: { opencodeSession: { providers: {} } },
  user,
})

describe('userSectionOf', () => {
  it('returns the raw user layer, never the resolved value', () => {
    expect(userSectionOf([llm({ providers: { mine: { baseURL: 'http://mine' } } })], 'llm-pi-ai'))
      .toEqual({ providers: { mine: { baseURL: 'http://mine' } } })
  })

  it('records {} when the namespace has no user layer', () => {
    expect(userSectionOf([llm()], 'llm-pi-ai')).toEqual({})
  })

  it('records {} when the namespace is absent', () => {
    expect(userSectionOf([], 'llm-pi-ai')).toEqual({})
  })
})

describe('pluginSectionOf', () => {
  it('excludes the profile library and the auto backup', () => {
    expect(pluginSectionOf({ opencodeSession: { providers: {} }, profiles: { work: {} }, autoBackup: {} }))
      .toEqual({ opencodeSession: { providers: {} } })
  })

  it('keeps unknown plugin keys so a future field still rides the snapshot', () => {
    expect(pluginSectionOf({ future: 1 })).toEqual({ future: 1 })
  })
})

describe('snapshotFromNamespaces', () => {
  it('always carries both config namespaces and the header fields', () => {
    const snapshot = snapshotFromNamespaces([llm({ subagentEffort: 'off' }), plugin({ opencodeSession: { providers: { p: { models: { m: true } } } } })], {
      createdAt: '2026-09-16T12:00:00.000Z',
      pluginVersion: '0.2.4',
      sourceProfile: 'modern',
    })

    expect(snapshot.kind).toBe(SNAPSHOT_KIND)
    expect(snapshot.version).toBe(SNAPSHOT_VERSION)
    expect(snapshot.createdAt).toBe('2026-09-16T12:00:00.000Z')
    expect(snapshot.sourceProfile).toBe('modern')
    expect(Object.keys(snapshot.sections)).toEqual(['dsh-thinking-effort', 'llm-pi-ai'])
    expect(snapshot.sections['llm-pi-ai']).toEqual({ subagentEffort: 'off' })
    expect(snapshot.sections['dsh-thinking-effort']).toEqual({ opencodeSession: { providers: { p: { models: { m: true } } } } })
  })

  it('records an empty object for a namespace the user never edited', () => {
    const snapshot = snapshotFromNamespaces([llm()], { createdAt: 'x', pluginVersion: '0.2.4', sourceProfile: 'unknown' })
    expect(snapshot.sections['llm-pi-ai']).toEqual({})
    expect(snapshot.sections['dsh-thinking-effort']).toEqual({})
  })
})

describe('snapshotFileName', () => {
  it('formats a local-time stamp with zero padding', () => {
    expect(snapshotFileName(new Date(2026, 8, 6, 9, 5))).toBe('dsh-config-20260906-0905.json')
  })
})
