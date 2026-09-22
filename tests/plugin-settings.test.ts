import { describe, expect, it } from 'vitest'
import { Config, PLUGIN_SETTINGS_SCHEMA } from '../src/host/plugin-settings.ts'

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
    expect(rest).toEqual({ ...section, opencodeSession: undefined, subagentEffort: '' })
    expect(opencodeSession).toEqual({
      providers: { p: { models: { m: true } } },
      format: formatDefaults,
      userAgent: userAgentDefaults,
    })
  })

  it('materializes every owned field for an empty section so editors see a stable shape', () => {
    const resolved = PLUGIN_SETTINGS_SCHEMA({ opencodeSession: { providers: {} } }) as unknown as Record<string, unknown>
    expect(Object.keys(resolved)).toEqual(['opencodeSession', 'subagentEffort', 'profiles', 'autoBackup'])
    expect(resolved.subagentEffort).toBe('')
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

  /**
   * Only `Config` may be volatile. If this root gained `.volatile()` — or the
   * field definitions were hoisted so the two roots swapped — the pre-0.1.7
   * `register`/`installSection` path would start handing those hosts a
   * `Volatile` ref instead of a plain section value. Its default parity with
   * `Config` cannot catch that, because volatility is meta, not a field.
   */
  it('keeps its root non-volatile so the legacy path still hands over a plain value', () => {
    const serialized = PLUGIN_SETTINGS_SCHEMA.toJSON() as unknown as {
      uid: number
      refs: Readonly<Record<string, { meta?: { volatile?: boolean } }>>
    }
    expect(serialized.refs[String(serialized.uid)]?.meta?.volatile).toBeUndefined()

    const resolved = PLUGIN_SETTINGS_SCHEMA(undefined) as unknown as Record<PropertyKey, unknown>
    expect(Symbol.for('cosmokit.volatile.write') in resolved).toBe(false)
  })
})

/** One node of the uid-keyed reference table `toJSON()` returns. */
interface SerializedNode {
  readonly dict?: Readonly<Record<string, number>>
}

/**
 * The fixed object paths a schema publishes, sorted. Node ids are handed out
 * per process, so the walk follows the `dict` links instead of comparing the
 * reference tables, and it stops on a cycle rather than recursing forever.
 */
function fieldPaths(schema: { toJSON(): unknown }): readonly string[] {
  const root = schema.toJSON() as { uid: number; refs: Readonly<Record<string, SerializedNode>> }
  const paths: string[] = []
  const visit = (uid: number, prefix: string, chain: ReadonlySet<number>): void => {
    if (chain.has(uid)) return
    const next = new Set(chain).add(uid)
    for (const [key, child] of Object.entries(root.refs[String(uid)]?.dict ?? {})) {
      const path = prefix.length === 0 ? key : `${prefix}.${key}`
      paths.push(path)
      visit(child, path, next)
    }
  }
  visit(root.uid, '', new Set())
  return paths.sort()
}

const pluginSettingsDefaults = {
  opencodeSession: { providers: {}, format: formatDefaults, userAgent: userAgentDefaults },
  subagentEffort: '',
  profiles: {},
  autoBackup: {
    kind: 'dsh-thinking-effort/config-snapshot',
    version: 1,
    createdAt: '',
    pluginVersion: '',
    sourceProfile: 'unknown',
    sections: {},
  },
}

describe('Config', () => {
  /**
   * The drift guard. Both roots are built from one set of field definitions,
   * so this fails the moment an edit gives one of them a field the other
   * lacks — the failure mode it exists to catch.
   */
  it('publishes exactly the fields of the legacy namespace schema', () => {
    expect(fieldPaths(Config)).toEqual(fieldPaths(PLUGIN_SETTINGS_SCHEMA))
  })

  it('resolves the legacy defaults for an absent and for an empty entry config', () => {
    expect(Config(undefined).get()).toEqual(PLUGIN_SETTINGS_SCHEMA(undefined))
    expect(Config({}).get()).toEqual(PLUGIN_SETTINGS_SCHEMA({}))
    expect(Config(undefined).get()).toEqual(pluginSettingsDefaults)
  })

  it('marks the root volatile so a whole-section write is accepted', () => {
    const serialized = Config.toJSON() as unknown as {
      uid: number
      refs: Readonly<Record<string, { meta?: { volatile?: boolean } }>>
    }
    expect(serialized.refs[String(serialized.uid)]?.meta?.volatile).toBe(true)

    const resolved = Config(undefined) as unknown as Record<PropertyKey, unknown>
    expect(Symbol.for('cosmokit.volatile.write') in resolved).toBe(true)
    expect(typeof resolved.get).toBe('function')
  })
})
