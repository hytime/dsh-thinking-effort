import { describe, expect, it } from 'vitest'
import { parseSnapshot, serializeSnapshot } from '../src/client/config-snapshot/parse.js'
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

const validSnapshot = {
  kind: SNAPSHOT_KIND,
  version: SNAPSHOT_VERSION,
  createdAt: '2026-09-16T12:00:00.000Z',
  pluginVersion: '0.2.4',
  sourceProfile: 'modern',
  sections: {
    'llm-pi-ai': { providers: { p: { baseURL: 'http://p' } } },
    'dsh-thinking-effort': { opencodeSession: { providers: {} } },
  },
}

describe('parseSnapshot', () => {
  it('accepts a well-formed snapshot and normalizes both config namespaces', () => {
    const result = parseSnapshot(JSON.stringify(validSnapshot))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.snapshot.sections['llm-pi-ai']).toEqual({ providers: { p: { baseURL: 'http://p' } } })
    expect(result.value.ignoredNamespaces).toEqual([])
  })

  it('fills an absent namespace with an empty object so replace can express a reset', () => {
    const result = parseSnapshot(JSON.stringify({ ...validSnapshot, sections: { 'llm-pi-ai': { a: 1 } } }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.snapshot.sections['dsh-thinking-effort']).toEqual({})
  })

  it('reports unknown namespaces as ignored instead of failing', () => {
    const result = parseSnapshot(JSON.stringify({ ...validSnapshot, sections: { ...validSnapshot.sections, 'llm-deepseek': { a: 1 } } }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.ignoredNamespaces).toEqual(['llm-deepseek'])
    expect(result.value.snapshot.sections['llm-deepseek']).toBeUndefined()
  })

  it('rejects malformed input with a specific code', () => {
    const codes = (text: string): string | undefined => {
      const result = parseSnapshot(text)
      return result.ok ? undefined : result.error.code
    }

    expect(codes('{ not json')).toBe('invalidJson')
    expect(codes('[]')).toBe('notObject')
    expect(codes('null')).toBe('notObject')
    expect(codes(JSON.stringify({ ...validSnapshot, kind: 'other' }))).toBe('kindMismatch')
    expect(codes(JSON.stringify({ ...validSnapshot, version: 99 }))).toBe('unsupportedVersion')
    expect(codes(JSON.stringify({ ...validSnapshot, sections: undefined }))).toBe('missingSections')
    expect(codes(JSON.stringify({ ...validSnapshot, sections: { 'llm-pi-ai': 'nope' } }))).toBe('invalidSection')
  })

  it('rejects reserved path keys anywhere in the sections', () => {
    // Built as raw JSON: a JS object literal `__proto__: 1` sets the prototype
    // instead of creating an own key, so it would not survive stringify.
    const text = `{
      "kind": "${SNAPSHOT_KIND}",
      "version": ${SNAPSHOT_VERSION},
      "sections": { "llm-pi-ai": { "providers": { "p": { "models": [{ "id": "a", "__proto__": 1 }] } } } }
    }`
    const result = parseSnapshot(text)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('reservedKey')
    expect(result.error.params?.key).toBe('__proto__')
  })

  it('rejects a payload whose UTF-8 bytes exceed the budget while its UTF-16 units fit', () => {
    // Each U+4E2D is one UTF-16 unit but three UTF-8 bytes, so 700k of them are
    // under the budget counted in units and over it counted in bytes. A guard
    // measuring String.length accepts this document; only a byte guard rejects it.
    const padding = '中'.repeat(700_000)
    const text = JSON.stringify({ ...validSnapshot, sections: { 'llm-pi-ai': { padding } } })
    expect(text.length).toBeLessThan(2 * 1024 * 1024)
    expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(2 * 1024 * 1024)
    const result = parseSnapshot(text)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('tooLarge')
    expect(result.error.params?.maxBytes).toBe(2 * 1024 * 1024)
  })

  it('refuses a section nested past the walk depth instead of overflowing the stack', () => {
    // Raw JSON: JSON.parse descends iteratively, while a JS object graph this
    // deep would overflow inside JSON.stringify before the parser ever saw it.
    const nested = `${'{"a":'.repeat(10_000)}1${'}'.repeat(10_000)}`
    const text = `{"kind":"${SNAPSHOT_KIND}","version":${SNAPSHOT_VERSION},"sections":{"llm-pi-ai":${nested}}}`
    expect(() => parseSnapshot(text)).not.toThrow()
    const result = parseSnapshot(text)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('invalidSection')
    expect(result.error.params?.ns).toBe('llm-pi-ai')
  })

  it('still accepts a section nested within the walk depth', () => {
    // Guards the depth bound against refusing ordinary sections: 40 levels is far
    // past any real snapshot but well inside the walk.
    let nested: Record<string, unknown> = { leaf: 1 }
    for (let level = 0; level < 40; level += 1) nested = { a: nested }
    const result = parseSnapshot(JSON.stringify({ ...validSnapshot, sections: { 'llm-pi-ai': nested } }))
    expect(result.ok).toBe(true)
  })
})

describe('serializeSnapshot', () => {
  it('round-trips through parseSnapshot', () => {
    const text = serializeSnapshot(validSnapshot as never)
    const result = parseSnapshot(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.snapshot.createdAt).toBe('2026-09-16T12:00:00.000Z')
    expect(result.value.snapshot.sections).toEqual(validSnapshot.sections)
  })

  it('ends with a trailing newline and is pretty printed', () => {
    const text = serializeSnapshot(validSnapshot as never)
    expect(text.endsWith('\n')).toBe(true)
    expect(text).toContain('\n  "kind"')
  })
})
