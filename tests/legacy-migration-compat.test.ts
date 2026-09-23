import { describe, expect, it } from 'vitest'
import {
  LEGACY_DECISIONS,
  legacyCandidatesOf,
  legacyDecisionOf,
  legacyMigrationOf,
  isLegacyMigrationPending,
} from '../src/compat/legacy-migration.ts'
import { Config, PLUGIN_SETTINGS_SCHEMA } from '../src/host/plugin-settings.ts'

const candidate = {
  path: ['opencodeSession', 'providers', 'sub2api', 'models', 'deepseek-flash'],
  value: true,
  source: 'settings.yaml.imported',
}

describe('legacy migration control object', () => {
  it('reads the control object out of a published user layer', () => {
    const user = { legacyMigration: { pending: true, candidates: [candidate], decision: 'migrate' } }
    expect(legacyMigrationOf(user)?.pending).toBe(true)
    expect(legacyCandidatesOf(user)).toEqual([candidate])
    expect(isLegacyMigrationPending(user)).toBe(true)
    expect(legacyDecisionOf(user)).toBe('migrate')
  })

  it('answers absent for a section that never carried the object', () => {
    expect(legacyMigrationOf({})).toBeUndefined()
    expect(legacyCandidatesOf({})).toEqual([])
    expect(isLegacyMigrationPending({})).toBe(false)
    expect(legacyDecisionOf({})).toBeUndefined()
  })

  it('does not treat pending without candidates as a prompt', () => {
    expect(isLegacyMigrationPending({ legacyMigration: { pending: true, candidates: [] } })).toBe(false)
  })

  it('ignores a decision the host does not act on', () => {
    expect(legacyDecisionOf({ legacyMigration: { decision: 'whatever' } })).toBeUndefined()
    expect(legacyDecisionOf({ legacyMigration: { decision: '' } })).toBeUndefined()
  })

  it('lists exactly the decisions the host acts on', () => {
    expect([...LEGACY_DECISIONS]).toEqual(['migrate', 'dismiss', 'scan'])
  })
})

describe('legacyMigration in the plugin settings schema', () => {
  it('resolves to an inert default when a section omits it', () => {
    const resolved = PLUGIN_SETTINGS_SCHEMA({}) as { legacyMigration?: Record<string, unknown> }
    expect(resolved.legacyMigration).toEqual({
      pending: false, candidates: [], signature: '', dismissedSignature: '',
      decision: '', lastResult: '', scannedAt: '', decidedAt: '',
    })
  })

  it('keeps the same defaults through the entry-config root', () => {
    // `.volatile()` returns a wrapper whose own keys are not the form fields, so
    // the root is read through `.get()` — the repo idiom at
    // tests/plugin-settings.test.ts:141-143. A bare `Config({})` resolves
    // nothing and would assert `undefined` against a default object.
    const resolved = Config({}).get() as unknown as { legacyMigration?: Record<string, unknown> }
    expect(resolved.legacyMigration).toEqual({
      pending: false, candidates: [], signature: '', dismissedSignature: '',
      decision: '', lastResult: '', scannedAt: '', decidedAt: '',
    })
  })

  it('round-trips a candidate without altering its scalars', () => {
    const section = {
      legacyMigration: {
        pending: true,
        candidates: [
          { path: ['subagentEffort'], value: 'off', source: 'settings.yaml.imported' },
          { path: ['opencodeSession', 'providers', 'p', 'models', 'm'], value: true, source: 'settings.yaml' },
        ],
      },
    }
    const resolved = PLUGIN_SETTINGS_SCHEMA(section) as { legacyMigration: { candidates: unknown[] } }
    expect(resolved.legacyMigration.candidates).toEqual(section.legacyMigration.candidates)
    // `"off"` must stay a string: a boolean false here would be silently dropped by the host schema.
    expect((resolved.legacyMigration.candidates[0] as { value: unknown }).value).toBe('off')
  })
})
