import { describe, expect, it } from 'vitest'
import { adjustIncoming, PROVIDER_WIRING_KEYS, wiringReport } from '../src/client/config-snapshot/wiring.js'
import { planImport } from '../src/client/config-snapshot/plan.js'
import { LLM_NAMESPACE, PLUGIN_NAMESPACE } from '../src/client/config-snapshot/types.js'
import type { ConfigSnapshot } from '../src/client/config-snapshot/types.js'
import type { SettingsNamespace } from '../src/client/types.js'

const snapshotOf = (sections: Record<string, Record<string, unknown>>): ConfigSnapshot => ({
  kind: 'dsh-thinking-effort/config-snapshot',
  version: 1,
  createdAt: '2026-09-16T12:00:00.000Z',
  pluginVersion: '0.3.0',
  sourceProfile: 'modern',
  sections: { 'dsh-thinking-effort': {}, 'llm-pi-ai': {}, ...sections },
})

const namespacesOf = (sections: Record<string, Record<string, unknown>>): SettingsNamespace[] => [
  { ns: 'llm-pi-ai', revision: 5, value: {}, user: sections['llm-pi-ai'] ?? {} },
  { ns: 'dsh-thinking-effort', revision: 9, value: {}, user: sections['dsh-thinking-effort'] ?? {} },
]

describe('PROVIDER_WIRING_KEYS', () => {
  it('lists exactly the transport and credential fields', () => {
    expect([...PROVIDER_WIRING_KEYS]).toEqual(['baseURL', 'apiKeyEnv', 'headers'])
  })
})

describe('adjustIncoming provider wiring', () => {
  const current = { providers: { route: { baseURL: 'https://mine.example/v1', apiKeyEnv: 'MINE', models: [{ id: 'a' }] } } }
  const file = { providers: { route: { baseURL: 'https://attacker.example/v1', apiKeyEnv: 'THEIRS', headers: { authorization: 'Bearer x' }, models: [{ id: 'b' }] } } }

  it('discards the file wiring values and keeps the local ones', () => {
    const { value, report } = adjustIncoming(LLM_NAMESPACE, file, current, false)
    const profile = (value.providers as Record<string, Record<string, unknown>>).route
    expect(profile.baseURL).toBe('https://mine.example/v1')
    expect(profile.apiKeyEnv).toBe('MINE')
    expect(profile.headers).toBeUndefined()
    expect(profile.models).toEqual([{ id: 'b' }])
    expect(report.count).toBeGreaterThan(0)
  })

  it('backfills the local value when the file omits the key, so replace cannot delete it', () => {
    const fileWithoutBaseUrl = { providers: { route: { models: [{ id: 'b' }] } } }
    const { value } = adjustIncoming(LLM_NAMESPACE, fileWithoutBaseUrl, current, false)
    const profile = (value.providers as Record<string, Record<string, unknown>>).route
    expect(profile.baseURL).toBe('https://mine.example/v1')
    expect(profile.apiKeyEnv).toBe('MINE')
    expect(profile.models).toEqual([{ id: 'b' }])
  })

  it('does not report an omission, only an actively provided difference', () => {
    const fileWithoutBaseUrl = { providers: { route: { models: [{ id: 'b' }] } } }
    expect(adjustIncoming(LLM_NAMESPACE, fileWithoutBaseUrl, current, false).report.count).toBe(0)
  })

  it('drops a route the file adds whose only content was wiring', () => {
    const { value } = adjustIncoming(LLM_NAMESPACE, { providers: { fresh: { baseURL: 'https://attacker.example/v1' } } }, {}, false)
    expect(Object.keys(value.providers as Record<string, unknown>)).toEqual([])
  })

  it('keeps a route the file adds when it still carries capability fields', () => {
    const { value } = adjustIncoming(LLM_NAMESPACE, { providers: { fresh: { baseURL: 'https://x.example', models: [{ id: 'c' }] } } }, {}, false)
    const profile = (value.providers as Record<string, Record<string, unknown>>).fresh
    expect(profile.baseURL).toBeUndefined()
    expect(profile.models).toEqual([{ id: 'c' }])
  })

  it('applies the file wiring verbatim when importWiring is on', () => {
    const { value, report } = adjustIncoming(LLM_NAMESPACE, file, current, true)
    const profile = (value.providers as Record<string, Record<string, unknown>>).route
    expect(profile.baseURL).toBe('https://attacker.example/v1')
    expect(profile.apiKeyEnv).toBe('THEIRS')
    expect(report.count).toBeGreaterThan(0)
  })

  it('leaves a non-record providers value untouched for the host schema to reject', () => {
    const { value } = adjustIncoming(LLM_NAMESPACE, { providers: 'nope' }, current, false)
    expect(value.providers).toBe('nope')
  })

  it('never reports header or apiKeyEnv values', () => {
    const { report } = adjustIncoming(LLM_NAMESPACE, file, current, false)
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('Bearer x')
    expect(serialized).not.toContain('THEIRS')
    expect(serialized).toContain('attacker.example')
    expect(report.providers).toEqual(['route'])
    expect(report.endpoints).toEqual([{ provider: 'route', baseURL: 'https://attacker.example/v1' }])
  })
})

describe('wiringReport', () => {
  it('is empty when the file carries no wiring difference', () => {
    const snapshot = snapshotOf({ 'llm-pi-ai': { providers: { route: { baseURL: 'https://mine.example/v1' } } } })
    const namespaces = namespacesOf({ 'llm-pi-ai': { providers: { route: { baseURL: 'https://mine.example/v1' } } } })
    expect(wiringReport(snapshot, namespaces).count).toBe(0)
  })

  it('reports a file that redirects a route', () => {
    const snapshot = snapshotOf({ 'llm-pi-ai': { providers: { route: { baseURL: 'https://attacker.example/v1' } } } })
    const namespaces = namespacesOf({ 'llm-pi-ai': { providers: { route: { baseURL: 'https://mine.example/v1' } } } })
    const report = wiringReport(snapshot, namespaces)
    expect(report.count).toBe(1)
    expect(report.endpoints).toEqual([{ provider: 'route', baseURL: 'https://attacker.example/v1' }])
  })

  it('reports a route this machine does not have yet', () => {
    const snapshot = snapshotOf({ 'llm-pi-ai': { providers: { fresh: { baseURL: 'https://attacker.example/v1' } } } })
    expect(wiringReport(snapshot, namespacesOf({})).count).toBe(1)
  })
})

describe('adjustIncoming script wiring', () => {
  const current = { opencodeSession: { format: { mode: 'script', script: '/mine/session.mjs' }, providers: { route: { models: { m: true } } } } }
  const file = { opencodeSession: { format: { mode: 'script', script: '/attacker/session.mjs' }, providers: { route: { models: { m: true } } } } }

  it('keeps the local script path and reports the file one', () => {
    const { value, report } = adjustIncoming(PLUGIN_NAMESPACE, file, current, false)
    const format = ((value.opencodeSession as Record<string, unknown>).format) as Record<string, unknown>
    expect(format.script).toBe('/mine/session.mjs')
    expect(report.script).toBe('/attacker/session.mjs')
    expect(report.count).toBe(1)
  })

  it('backfills the local script when the file omits it', () => {
    const fileWithoutScript = { opencodeSession: { format: { mode: 'ses-derive' } } }
    const { value, report } = adjustIncoming(PLUGIN_NAMESPACE, fileWithoutScript, current, false)
    const format = ((value.opencodeSession as Record<string, unknown>).format) as Record<string, unknown>
    expect(format.script).toBe('/mine/session.mjs')
    expect(report.count).toBe(0)
  })

  it('drops the script key when neither side has one', () => {
    const { value } = adjustIncoming(PLUGIN_NAMESPACE, { opencodeSession: { format: { mode: 'ses-derive' } } }, {}, false)
    const format = ((value.opencodeSession as Record<string, unknown>).format) as Record<string, unknown>
    expect('script' in format).toBe(false)
    expect(format.mode).toBe('ses-derive')
  })

  it('applies the file script when importWiring is on', () => {
    const { value } = adjustIncoming(PLUGIN_NAMESPACE, file, current, true)
    const format = ((value.opencodeSession as Record<string, unknown>).format) as Record<string, unknown>
    expect(format.script).toBe('/attacker/session.mjs')
  })

  it('ignores a plugin section with no format object', () => {
    const { value, report } = adjustIncoming(PLUGIN_NAMESPACE, { opencodeSession: { providers: {} } }, current, false)
    expect(value).toEqual({ opencodeSession: { providers: {} } })
    expect(report.count).toBe(0)
  })

  it('surfaces a script through wiringReport', () => {
    const snapshot = snapshotOf({ 'dsh-thinking-effort': file })
    const namespaces = namespacesOf({ 'dsh-thinking-effort': current })
    expect(wiringReport(snapshot, namespaces).script).toBe('/attacker/session.mjs')
  })

  it('counts an empty script the file provides, without displaying one', () => {
    const fileWithEmptyScript = { opencodeSession: { format: { mode: 'script', script: '' } } }
    const { value, report } = adjustIncoming(PLUGIN_NAMESPACE, fileWithEmptyScript, current, false)
    const format = ((value.opencodeSession as Record<string, unknown>).format) as Record<string, unknown>
    expect(format.script).toBe('/mine/session.mjs')
    expect(report.count).toBe(1)
    expect(report.script).toBeUndefined()
    expect(report.providers).toEqual([])
    expect(report.endpoints).toEqual([])

    const merged = wiringReport(snapshotOf({ 'dsh-thinking-effort': fileWithEmptyScript }), namespacesOf({ 'dsh-thinking-effort': current }))
    expect(merged.count).toBe(1)
    expect(merged.script).toBeUndefined()
  })

  it('counts a non-string script the file provides, without displaying one', () => {
    const fileWithNumericScript = { opencodeSession: { format: { mode: 'script', script: 123 } } }
    const { value, report } = adjustIncoming(PLUGIN_NAMESPACE, fileWithNumericScript, current, false)
    const format = ((value.opencodeSession as Record<string, unknown>).format) as Record<string, unknown>
    expect(format.script).toBe('/mine/session.mjs')
    expect(report.count).toBe(1)
    expect(report.script).toBeUndefined()
  })

  it('does not report an empty script both sides agree on', () => {
    const { report } = adjustIncoming(
      PLUGIN_NAMESPACE,
      { opencodeSession: { format: { mode: 'script', script: '' } } },
      { opencodeSession: { format: { mode: 'script', script: '' } } },
      false,
    )
    expect(report.count).toBe(0)
    expect(report.script).toBeUndefined()
  })
})

const opsFor = (plan: ReturnType<typeof planImport>, ns: string): readonly unknown[] =>
  plan.namespaces.find((entry) => entry.ns === ns)?.ops ?? []

describe('planImport wiring integration', () => {
  const local = { 'llm-pi-ai': { providers: { route: { baseURL: 'https://mine.example/v1', models: [{ id: 'a' }] } } } }
  const stolen = { 'llm-pi-ai': { providers: { route: { baseURL: 'https://attacker.example/v1', models: [{ id: 'b' }] } } } }

  it('keeps the local baseURL in merge mode by default', () => {
    const plan = planImport(snapshotOf(stolen), namespacesOf(local), 'merge')
    const ops = JSON.stringify(opsFor(plan, 'llm-pi-ai'))
    expect(ops).toContain('https://mine.example/v1')
    expect(ops).not.toContain('attacker.example')
    expect(plan.wiring.count).toBeGreaterThan(0)
  })

  it('keeps the local baseURL in replace mode by default', () => {
    const plan = planImport(snapshotOf(stolen), namespacesOf(local), 'replace')
    const ops = JSON.stringify(opsFor(plan, 'llm-pi-ai'))
    expect(ops).toContain('https://mine.example/v1')
    expect(ops).not.toContain('attacker.example')
  })

  it('does not delete the local baseURL when the file omits it in replace mode', () => {
    const plan = planImport(snapshotOf({ 'llm-pi-ai': { providers: { route: { models: [{ id: 'b' }] } } } }), namespacesOf(local), 'replace')
    const ops = JSON.stringify(opsFor(plan, 'llm-pi-ai'))
    expect(ops).toContain('https://mine.example/v1')
  })

  it('applies the file baseURL when importWiring is on', () => {
    const plan = planImport(snapshotOf(stolen), namespacesOf(local), 'merge', { importWiring: true })
    expect(JSON.stringify(opsFor(plan, 'llm-pi-ai'))).toContain('attacker.example')
  })

  it('reports empty wiring for a snapshot that matches the machine', () => {
    const plan = planImport(snapshotOf(local), namespacesOf(local), 'merge')
    expect(plan.wiring.count).toBe(0)
  })

  it('leaves the existing replace behaviour for a route the file omits entirely', () => {
    const plan = planImport(snapshotOf({ 'llm-pi-ai': {} }), namespacesOf(local), 'replace')
    expect(opsFor(plan, 'llm-pi-ai')).toEqual([{ op: 'unset', path: ['providers'] }])
  })

  it('merges a report that counts a difference it cannot display', () => {
    // The file supplies an empty script. `count` still counts the difference
    // while `script` has no path to show, so a non-zero count without a script
    // survives the merge rather than being read as "nothing to warn about".
    const withScript = { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'script', script: '/mine/session.mjs' } } } }
    const plan = planImport(
      snapshotOf({ 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'script', script: '' } } } }),
      namespacesOf(withScript),
      'merge',
    )

    expect(plan.wiring.count).toBeGreaterThan(0)
    expect(plan.wiring.script).toBeUndefined()
  })
})

describe('replace mode withholds route wiring', () => {
  const local = {
    'llm-pi-ai': {
      providers: {
        B: { baseURL: 'https://mine.example/v1', apiKeyEnv: 'MINE', models: [{ id: 'local' }] },
        C: { baseURL: 'https://c.example/v1', models: [{ id: 'c' }] },
      },
    },
  }
  /** The providers value the single `providers` write carries, or undefined when no such write was planned. */
  const providersWrite = (plan: ReturnType<typeof planImport>): Record<string, Record<string, unknown>> | undefined => {
    const write = opsFor(plan, 'llm-pi-ai').find((op) => {
      const candidate = op as { readonly op?: string; readonly path?: readonly string[] }
      return candidate.op === 'set' && candidate.path?.[0] === 'providers'
    }) as { readonly value?: Record<string, Record<string, unknown>> } | undefined
    return write?.value
  }

  it('keeps a local endpoint on an existing route the file also carries', () => {
    const plan = planImport(
      snapshotOf({ 'llm-pi-ai': { providers: { B: { baseURL: 'https://attacker.example/v1', apiKeyEnv: 'THEIRS' } } } }),
      namespacesOf(local),
      'replace',
    )
    const providers = providersWrite(plan)!
    // Replace rewrites the whole `providers` dict, so the B entry must come back
    // with this machine's wiring rather than the file's — and B must not be
    // dropped for having nothing else in the file to import.
    expect(providers.B.baseURL).toBe('https://mine.example/v1')
    expect(providers.B.apiKeyEnv).toBe('MINE')
    expect(JSON.stringify(providers)).not.toContain('attacker.example')
  })

  it('does not create a route whose only content was wiring', () => {
    const plan = planImport(
      snapshotOf({ 'llm-pi-ai': { providers: { fresh: { baseURL: 'https://attacker.example/v1' } } } }),
      namespacesOf(local),
      'replace',
    )
    const providers = providersWrite(plan)!
    expect(providers.fresh).toBeUndefined()
    expect(JSON.stringify(providers)).not.toContain('attacker.example')
  })

  it('creates a new route with its capability fields and no wiring', () => {
    const plan = planImport(
      snapshotOf({ 'llm-pi-ai': { providers: { fresh: { baseURL: 'https://attacker.example/v1', models: [{ id: 'file' }] } } } }),
      namespacesOf(local),
      'replace',
    )
    const providers = providersWrite(plan)!
    expect(providers.fresh.models).toEqual([{ id: 'file' }])
    expect(providers.fresh.baseURL).toBeUndefined()
    expect(JSON.stringify(providers)).not.toContain('attacker.example')
  })

  it('still deletes a route the file omits entirely, wiring included', () => {
    const plan = planImport(
      snapshotOf({ 'llm-pi-ai': { providers: { B: { models: [{ id: 'file' }] } } } }),
      namespacesOf(local),
      'replace',
    )
    const providers = providersWrite(plan)!
    // Route C is absent from the file, so replace removes it with its endpoint —
    // the branch's withholding must not turn an omission into a keep.
    expect(providers.C).toBeUndefined()
    expect(JSON.stringify(providers)).not.toContain('c.example')
  })
})
