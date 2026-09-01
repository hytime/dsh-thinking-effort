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

interface ComparableVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: readonly (number | string)[]
}

interface ParsedVersion {
  readonly value: string
  readonly valid: boolean
  readonly comparable?: ComparableVersion
}

interface CompatibilityRange {
  readonly minimum: string
  readonly maximumExclusive: string
  readonly profile: Exclude<CompatibilityProfile, 'unknown'>
}

const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/

const verifiedRanges: readonly CompatibilityRange[] = [
  { minimum: '0.1.0-rc.7', maximumExclusive: '0.1.2-alpha.1', profile: 'legacy' },
  { minimum: '0.1.2-alpha.1', maximumExclusive: '0.1.3-0', profile: 'modern' },
]

function comparableVersion(value: string): ComparableVersion {
  const [core, prerelease] = value.split('-', 2)
  const [major, minor, patch] = core.split('.').map(Number)
  return {
    major,
    minor,
    patch,
    prerelease: prerelease === undefined
      ? []
      : prerelease.split('.').map((part) => /^\d+$/.test(part) ? Number(part) : part),
  }
}

function compareVersions(left: ComparableVersion, right: ComparableVersion): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }

  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    if (left.prerelease.length === right.prerelease.length) return 0
    return left.prerelease.length === 0 ? 1 : -1
  }

  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index]
    const rightPart = right.prerelease[index]
    if (leftPart === undefined || rightPart === undefined) return leftPart === undefined ? -1 : 1
    if (leftPart === rightPart) continue
    if (typeof leftPart === 'number' && typeof rightPart === 'string') return -1
    if (typeof leftPart === 'string' && typeof rightPart === 'number') return 1
    return leftPart < rightPart ? -1 : 1
  }
  return 0
}

function parseVersion(value: unknown): ParsedVersion | undefined {
  if (typeof value !== 'string') return undefined
  if (!semverPattern.test(value)) return { value, valid: false }
  return { value, valid: true, comparable: comparableVersion(value) }
}

function expectedProfileForVersion(parsed: ParsedVersion): Exclude<CompatibilityProfile, 'unknown'> | undefined {
  const version = parsed.comparable
  if (version === undefined) return undefined
  return verifiedRanges.find((range) => {
    const minimum = compareVersions(version, comparableVersion(range.minimum))
    const maximum = compareVersions(version, comparableVersion(range.maximumExclusive))
    return minimum >= 0 && maximum < 0
  })?.profile
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
  const parsed = parseVersion(input.version)
  const diagnostics: CompatibilityDiagnostic[] = []

  if (input.version === undefined) {
    return {
      profile: actualProfile,
      capabilities,
      diagnostics,
    }
  }

  if (parsed === undefined || !parsed.valid) {
    return {
      profile: 'unknown',
      ...(parsed === undefined ? {} : { version: parsed.value }),
      capabilities,
      diagnostics: [invalidVersionDiagnostic(parsed?.value, capabilities)],
    }
  }

  const expected = expectedProfileForVersion(parsed)
  if (expected === undefined) {
    return {
      profile: actualProfile,
      version: parsed.value,
      capabilities,
      diagnostics,
    }
  }

  if (expected !== actualProfile) {
    diagnostics.push(mismatchDiagnostic(parsed.value, expected, capabilities))
    return {
      profile: actualProfile,
      version: parsed.value,
      expected,
      capabilities,
      diagnostics,
    }
  }

  return {
    profile: expected,
    version: parsed.value,
    expected,
    capabilities,
    diagnostics,
  }
}
