import { describe, expect, it } from 'vitest'
import { ALPHA3_PLUS_COMPAT_FIELDS } from '../src/compat/gateway/fields.ts'
import { clientCapabilities, hostCapabilities } from '../src/compat/capabilities.ts'
import { capabilitiesForVersion, settingsModelForVersion, takeoverSupportedForVersion, takeoverTransportForVersion } from '../src/compat/version-map.ts'
import { resolveCompatibility } from '../src/compat/version-adapter.ts'

const legacy = { settings: 'legacy', externalLanguages: false } as const
const modern = { settings: 'remote', externalLanguages: true } as const
const noSettings = { settings: 'none', externalLanguages: false } as const

/**
 * The supported window is `0.1.7-alpha.1` through `0.2.2`: the entry-config
 * settings model, the modern Settings transport, the fully grown editable compat
 * field set, external language packs and optional takeover. Everything older
 * than `0.1.7-alpha.1` — the rc.7/rc.8, `0.1.2`, `0.1.3` and `0.1.6` lines — is
 * outside the map, and so is `0.2.3-0` and everything after it.
 */
const windowCapabilities = {
  settingsTransport: 'modern',
  settingsApi: 'remote.settings',
  settingsModel: 'entry-config',
  baseModelFields: ['reasoningEfforts', 'input', 'contextWindow'],
  gatewayCompatFields: [...ALPHA3_PLUS_COMPAT_FIELDS],
  externalLanguages: true,
  takeoverTransport: 'optional',
} as const

describe('version capability map', () => {
  it('returns the complete supported capability matrix', () => {
    expect(capabilitiesForVersion('0.1.7-alpha.1')).toEqual(windowCapabilities)
    expect(capabilitiesForVersion('0.2.2-alpha.2')).toEqual(windowCapabilities)
  })

  it('starts the map at 0.1.7-alpha.1', () => {
    // The floor is the first release of the entry-config model; the prerelease
    // immediately below it and every older line map to nothing.
    expect(capabilitiesForVersion('0.1.7-0')).toBeUndefined()
    expect(capabilitiesForVersion('0.1.6')).toBeUndefined()
    expect(capabilitiesForVersion('0.1.6-alpha.2')).toBeUndefined()
    expect(settingsModelForVersion('0.1.6-alpha.2')).toBeUndefined()
    expect(settingsModelForVersion('0.1.7-alpha.1')).toBe('entry-config')
  })

  it('exposes takeover availability from the mapped capability ranges', () => {
    expect(takeoverTransportForVersion('0.1.7-alpha.1')).toBe('optional')
    expect(takeoverTransportForVersion('0.1.7')).toBe('optional')
    expect(takeoverTransportForVersion('0.2.2-alpha.2')).toBe('optional')
    expect(takeoverSupportedForVersion('0.2.2-alpha.2')).toBe(true)
    // An unmapped version answers neither way: no transport fact is known.
    expect(takeoverTransportForVersion('0.1.6-alpha.2')).toBeUndefined()
    expect(takeoverSupportedForVersion('0.1.6-alpha.2')).toBe(false)
    expect(takeoverSupportedForVersion('bad')).toBe(false)
  })

  it('maps every release inside the supported window to the same capabilities', () => {
    for (const version of [
      '0.1.7-alpha.1', '0.1.7', '0.1.7-alpha.1+build.1',
      '0.2.0-rc.1', '0.2.0-rc.2', '0.2.0',
      '0.2.1-alpha.1', '0.2.1',
      '0.2.2-alpha.0', '0.2.2-alpha.2', '0.2.2',
    ]) {
      expect(capabilitiesForVersion(version)).toEqual(windowCapabilities)
      expect(takeoverTransportForVersion(version)).toBe('optional')
      expect(settingsModelForVersion(version)).toBe('entry-config')
    }
    // The first release of the next minor line is the exclusive upper bound.
    expect(capabilitiesForVersion('0.2.3-0')).toBeUndefined()
  })

  it('keeps the half-open bounds and accepts semver build metadata', () => {
    expect(capabilitiesForVersion('0.1.6-alpha.2')).toBeUndefined()
    expect(capabilitiesForVersion('0.2.3-0')).toBeUndefined()
    expect(capabilitiesForVersion('0.3.0')).toBeUndefined()

    expect(capabilitiesForVersion('0.1.7-alpha.1+ci.1')).toEqual(windowCapabilities)
    expect(capabilitiesForVersion('0.1.7-0+build.7')).toBeUndefined()
    expect(capabilitiesForVersion('0.2.0+build.9')).toEqual(windowCapabilities)
    expect(capabilitiesForVersion('0.2.1-alpha.1+build.3')).toEqual(windowCapabilities)
    expect(capabilitiesForVersion('0.2.2-alpha.2+build.5')).toEqual(windowCapabilities)
    expect(capabilitiesForVersion('0.2.3-0+build.5')).toBeUndefined()
  })

  it('carries the complete mapped matrix in compatibility reports', () => {
    expect(resolveCompatibility({ version: '0.1.7-alpha.1', capabilities: modern }).versionCapabilities)
      .toEqual(windowCapabilities)
    expect(resolveCompatibility({ version: '0.2.2-alpha.2+build.5', capabilities: modern }).versionCapabilities)
      .toEqual(windowCapabilities)
  })

  it('reports a supported release as the mapped modern profile', () => {
    const report = resolveCompatibility({ version: '0.2.2-alpha.2', capabilities: modern })

    expect(report.profile).toBe('modern')
    expect(report.expected).toBe('modern')
    expect(report.versionCapabilities).toEqual(windowCapabilities)
    expect(report.diagnostics).toHaveLength(0)
  })
})

describe('compatibility profiles', () => {
  it('classifies compatibility ranges without enumerating every release', () => {
    const mappedWindow = resolveCompatibility({ version: '0.1.7-alpha.1', capabilities: modern })
    expect(mappedWindow.profile).toBe('modern')
    expect(mappedWindow.expected).toBe('modern')

    // A release the map does not cover carries no expectation, so its actual
    // capabilities decide the profile without a diagnostic.
    const belowFloor = resolveCompatibility({ version: '0.1.6-alpha.2', capabilities: legacy })
    expect(belowFloor.profile).toBe('legacy')
    expect(belowFloor.expected).toBeUndefined()
    expect(belowFloor.versionCapabilities).toBeUndefined()
    expect(belowFloor.diagnostics).toHaveLength(0)

    const unknownFuture = resolveCompatibility({ version: '0.3.0', capabilities: legacy })
    expect(unknownFuture.profile).toBe('legacy')
    expect(unknownFuture.expected).toBeUndefined()
    expect(unknownFuture.versionCapabilities).toBeUndefined()
    expect(unknownFuture.diagnostics).toHaveLength(0)
  })

  it('reports the 0.2.0 line against its mapped profile', () => {
    const report = resolveCompatibility({ version: '0.2.0-rc.2', capabilities: modern })

    expect(report.profile).toBe('modern')
    expect(report.expected).toBe('modern')
    expect(report.versionCapabilities).toEqual(windowCapabilities)
    expect(report.diagnostics).toHaveLength(0)
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
    expect(report.versionCapabilities).toBeUndefined()
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
    expect(report.versionCapabilities).toBeUndefined()
    expect(report.diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid-version', version: '0.1' }),
    ])
  })

  it('uses actual capabilities and reports a modern-version mismatch', () => {
    const report = resolveCompatibility({ version: '0.2.2-alpha.2', capabilities: legacy })

    expect(report.profile).toBe('legacy')
    expect(report.expected).toBe('modern')
    expect(report.diagnostics).toHaveLength(1)
    expect(report.diagnostics[0]).toMatchObject({
      code: 'version-capability-mismatch',
      expectedProfile: 'modern',
      actualCapabilities: legacy,
    })
    expect(report.versionCapabilities).toEqual(windowCapabilities)
  })

  it('reports missing capabilities as a mismatch without throwing', () => {
    const report = resolveCompatibility({ version: '0.2.2-alpha.2', capabilities: noSettings })

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
