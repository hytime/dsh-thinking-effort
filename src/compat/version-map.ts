export type SettingsApi = 'connection.api.settings' | 'remote.settings'
export type GatewayCompatField = 'supportsDeveloperRole' | 'maxTokensField'

export interface DshVersionCapabilities {
  settingsTransport: 'legacy' | 'modern'
  settingsApi: SettingsApi
  baseModelFields: readonly ('reasoningEfforts' | 'input' | 'contextWindow')[]
  gatewayCompatFields: readonly GatewayCompatField[]
  externalLanguages: boolean
  takeoverTransport: 'unsupported' | 'optional'
}

interface ComparableVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: readonly (number | string)[]
}

interface VersionRange {
  readonly minimum: string
  readonly maximumExclusive: string
  readonly capabilities: DshVersionCapabilities
}

const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/

const legacyBaseModelFields = ['reasoningEfforts'] as const
const completeBaseModelFields = ['reasoningEfforts', 'input', 'contextWindow'] as const
const completeGatewayCompatFields = ['supportsDeveloperRole', 'maxTokensField'] as const

const versionRanges: readonly VersionRange[] = [
  {
    minimum: '0.1.0-rc.7',
    maximumExclusive: '0.1.0-rc.8',
    capabilities: {
      settingsTransport: 'legacy',
      settingsApi: 'connection.api.settings',
      baseModelFields: legacyBaseModelFields,
      gatewayCompatFields: [],
      externalLanguages: false,
      takeoverTransport: 'unsupported',
    },
  },
  {
    minimum: '0.1.0-rc.8',
    maximumExclusive: '0.1.2-alpha.1',
    capabilities: {
      settingsTransport: 'legacy',
      settingsApi: 'connection.api.settings',
      baseModelFields: completeBaseModelFields,
      gatewayCompatFields: completeGatewayCompatFields,
      externalLanguages: false,
      takeoverTransport: 'optional',
    },
  },
  {
    minimum: '0.1.2-alpha.1',
    maximumExclusive: '0.1.3-0',
    capabilities: {
      settingsTransport: 'modern',
      settingsApi: 'remote.settings',
      baseModelFields: completeBaseModelFields,
      gatewayCompatFields: completeGatewayCompatFields,
      externalLanguages: true,
      takeoverTransport: 'optional',
    },
  },
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

export function isValidSemver(value: unknown): value is string {
  return typeof value === 'string' && semverPattern.test(value)
}

export function capabilitiesForVersion(version: string): DshVersionCapabilities | undefined {
  if (!isValidSemver(version)) return undefined

  const comparable = comparableVersion(version)
  return versionRanges.find((range) => (
    compareVersions(comparable, comparableVersion(range.minimum)) >= 0
      && compareVersions(comparable, comparableVersion(range.maximumExclusive)) < 0
  ))?.capabilities
}
