import { describe, expect, it } from 'vitest'
import { clientCapabilities, hostCapabilities } from '../src/compat/capabilities.ts'
import { capabilitiesForVersion } from '../src/compat/version-map.ts'
import { resolveCompatibility } from '../src/compat/version-adapter.ts'

const legacy = { settings: 'legacy', externalLanguages: false } as const
const modern = { settings: 'remote', externalLanguages: true } as const
const noSettings = { settings: 'none', externalLanguages: false } as const

describe('version capability map', () => {
  it('maps the rc7 compatibility boundary to its legacy API and fields', () => {
    expect(capabilitiesForVersion('0.1.0-rc.7')).toMatchObject({
      settingsApi: 'connection.api.settings',
      gatewayCompatFields: [],
    })
  })

  it('maps rc8 and later legacy releases to complete gateway fields', () => {
    expect(capabilitiesForVersion('0.1.0-rc.8')).toMatchObject({
      settingsApi: 'connection.api.settings',
      gatewayCompatFields: ['supportsDeveloperRole', 'maxTokensField'],
    })
  })

  it('maps modern alpha releases as a range without enumerating each alpha', () => {
    expect(capabilitiesForVersion('0.1.2-alpha.2')).toMatchObject({
      settingsApi: 'remote.settings',
      gatewayCompatFields: ['supportsDeveloperRole', 'maxTokensField'],
    })
    expect(capabilitiesForVersion('0.1.2-alpha.3')).toMatchObject({
      settingsApi: 'remote.settings',
      gatewayCompatFields: ['supportsDeveloperRole', 'maxTokensField'],
    })
    expect(capabilitiesForVersion('0.1.3')).toBeUndefined()
  })
})

describe('compatibility profiles', () => {
  it('classifies compatibility ranges without enumerating every release', () => {
    const legacyRange = resolveCompatibility({ version: '0.1.1-rc.99', capabilities: modern })
    expect(legacyRange.profile).toBe('modern')
    expect(legacyRange.expected).toBe('legacy')

    const modernRange = resolveCompatibility({ version: '0.1.2-alpha.99', capabilities: legacy })
    expect(modernRange.profile).toBe('legacy')
    expect(modernRange.expected).toBe('modern')

    const unknownFuture = resolveCompatibility({ version: '0.1.3', capabilities: legacy })
    expect(unknownFuture.profile).toBe('legacy')
    expect(unknownFuture.expected).toBeUndefined()
  })

  it('uses detected capabilities when version metadata is absent', () => {
    expect(resolveCompatibility({ version: undefined, capabilities: modern }).profile).toBe('modern')
    expect(resolveCompatibility({ version: undefined, capabilities: legacy }).profile).toBe('legacy')
    expect(resolveCompatibility({ version: undefined, capabilities: noSettings }).profile).toBe('unknown')
  })

  it('uses actual capabilities for an unknown valid modern version', () => {
    const report = resolveCompatibility({ version: '9.9.9', capabilities: modern })

    expect(report.profile).toBe('modern')
    expect(report.expected).toBeUndefined()
    expect(report.capabilities).toEqual(modern)
    expect(report.diagnostics).toHaveLength(0)
  })

  it('uses actual capabilities for an unknown valid legacy version', () => {
    const report = resolveCompatibility({ version: '9.9.9', capabilities: legacy })

    expect(report.profile).toBe('legacy')
    expect(report.expected).toBeUndefined()
    expect(report.diagnostics).toHaveLength(0)
  })
  it('treats malformed version metadata as unknown without throwing', () => {
    const report = resolveCompatibility({ version: '0.1', capabilities: legacy })

    expect(report.profile).toBe('unknown')
    expect(report.version).toBe('0.1')
    expect(report.expected).toBeUndefined()
    expect(report.diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid-version', version: '0.1' }),
    ])
  })

  it('uses actual capabilities and reports a modern-version mismatch', () => {
    const report = resolveCompatibility({ version: '0.1.2-alpha.1', capabilities: legacy })

    expect(report.profile).toBe('legacy')
    expect(report.expected).toBe('modern')
    expect(report.diagnostics).toHaveLength(1)
    expect(report.diagnostics[0]).toMatchObject({
      code: 'version-capability-mismatch',
      expectedProfile: 'modern',
      actualCapabilities: legacy,
    })
  })

  it('uses actual capabilities and reports a legacy-version mismatch', () => {
    const report = resolveCompatibility({ version: '0.1.0-rc.7', capabilities: modern })

    expect(report.profile).toBe('modern')
    expect(report.expected).toBe('legacy')
    expect(report.diagnostics).toHaveLength(1)
    expect(report.diagnostics[0]).toMatchObject({
      expectedProfile: 'legacy',
      actualCapabilities: modern,
    })
  })

  it('reports missing capabilities as a mismatch without throwing', () => {
    const report = resolveCompatibility({ version: '0.1.2-alpha.1', capabilities: noSettings })

    expect(report.profile).toBe('unknown')
    expect(report.diagnostics).toHaveLength(1)
    expect(report.diagnostics[0]).toMatchObject({
      expectedProfile: 'modern',
      actualCapabilities: noSettings,
    })
  })

  it('does not use external language support to choose a profile', () => {
    expect(resolveCompatibility({
      version: undefined,
      capabilities: { settings: 'remote', externalLanguages: false },
    }).profile).toBe('modern')
  })
})

describe('client capability reader', () => {
  it('prefers a complete Remote settings API without calling methods', () => {
    let calls = 0
    const remoteSettings = {
      describe: () => { calls += 1 },
      mutate: () => { calls += 1 },
    }
    const addLanguage = () => { calls += 1 }

    expect(clientCapabilities({ remoteSettings, addLanguage })).toEqual(modern)
    expect(calls).toBe(0)
  })

  it('recognizes Remote settings methods exposed through accessors', () => {
    const remoteSettings = {}
    Object.defineProperties(remoteSettings, {
      describe: { enumerable: true, get: () => () => undefined },
      mutate: { enumerable: true, get: () => () => undefined },
    })

    expect(clientCapabilities({ remoteSettings })).toEqual({ settings: 'remote', externalLanguages: false })
  })
  it('falls back to complete legacy settings when Remote is unavailable', () => {
    expect(clientCapabilities({
      remoteSettings: { describe() {} },
      legacySettings: { describe() {}, mutate() {} },
    })).toEqual(legacy)
  })

  it('returns no Settings for incomplete APIs and only accepts a function addLanguage', () => {
    expect(clientCapabilities({
      remoteSettings: { describe() {} },
      legacySettings: { mutate() {} },
      addLanguage: {},
    })).toEqual(noSettings)
  })
})

describe('host capability reader', () => {
  it('recognizes only the declared Host Settings shape', () => {
    expect(hostCapabilities({
      settings: {
        get() {},
        update() {},
        describe() {},
        writable: true,
        undeclared: 'ignored',
      },
    })).toEqual(legacy)
  })

  it('does not infer Host capabilities from undeclared properties', () => {
    expect(hostCapabilities({ settings: { writable: true } })).toEqual(noSettings)
  })
})
