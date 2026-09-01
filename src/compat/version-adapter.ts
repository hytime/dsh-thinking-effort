import { capabilitiesForVersion, isValidSemver } from './version-map.js'
import type {
  CompatibilityDiagnostic,
  CompatibilityProfile,
  DshCompatibilityCapabilities,
} from '../client/types.js'

export type {
  CompatibilityDiagnostic,
  CompatibilityDiagnosticCode,
  CompatibilityProfile,
  CompatibilitySettings,
  DshCompatibilityCapabilities,
} from '../client/types.js'

export interface CompatibilityReport {
  readonly profile: CompatibilityProfile
  readonly version?: string
  readonly expected?: Exclude<CompatibilityProfile, 'unknown'>
  readonly capabilities: DshCompatibilityCapabilities
  readonly diagnostics: readonly CompatibilityDiagnostic[]
}

function profileForCapabilities(capabilities: DshCompatibilityCapabilities): CompatibilityProfile {
  if (capabilities.settings === 'remote') return 'modern'
  if (capabilities.settings === 'legacy') return 'legacy'
  return 'unknown'
}

function invalidVersionDiagnostic(
  version: string | undefined,
  capabilities: DshCompatibilityCapabilities,
): CompatibilityDiagnostic {
  return {
    code: 'invalid-version',
    ...(version === undefined ? {} : { version }),
    actualCapabilities: capabilities,
    message: 'Runtime version metadata is not a valid semver value.',
  }
}

function mismatchDiagnostic(
  version: string,
  expectedProfile: Exclude<CompatibilityProfile, 'unknown'>,
  capabilities: DshCompatibilityCapabilities,
): CompatibilityDiagnostic {
  return {
    code: 'version-capability-mismatch',
    version,
    expectedProfile,
    actualCapabilities: capabilities,
    message: `Version metadata expects ${expectedProfile}, but detected capabilities select ${profileForCapabilities(capabilities)}.`,
  }
}

export function resolveCompatibility(input: {
  readonly version?: unknown
  readonly capabilities: DshCompatibilityCapabilities
}): CompatibilityReport {
  const { capabilities } = input
  const actualProfile = profileForCapabilities(capabilities)
  const version = input.version
  const diagnostics: CompatibilityDiagnostic[] = []

  if (version === undefined) {
    return {
      profile: actualProfile,
      capabilities,
      diagnostics,
    }
  }

  if (!isValidSemver(version)) {
    return {
      profile: 'unknown',
      ...(typeof version === 'string' ? { version } : {}),
      capabilities,
      diagnostics: [invalidVersionDiagnostic(typeof version === 'string' ? version : undefined, capabilities)],
    }
  }

  const mappedCapabilities = capabilitiesForVersion(version)
  const expected = mappedCapabilities === undefined
    ? undefined
    : mappedCapabilities.settingsTransport
  if (expected === undefined) {
    return {
      profile: actualProfile,
      version,
      capabilities,
      diagnostics,
    }
  }

  if (expected !== actualProfile) {
    diagnostics.push(mismatchDiagnostic(version, expected, capabilities))
    return {
      profile: actualProfile,
      version,
      expected,
      capabilities,
      diagnostics,
    }
  }

  return {
    profile: expected,
    version,
    expected,
    capabilities,
    diagnostics,
  }
}
