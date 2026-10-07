import { ALPHA1_PLUS_COMPAT_FIELDS, ALPHA3_PLUS_COMPAT_FIELDS, GATEWAY_COMPAT_FIELDS, RC8_COMPAT_FIELDS } from './gateway/fields.js'
import type { GatewayCompatFieldKey } from './gateway/fields.js'
import { settingsModelOf } from './settings-model.js'
import type { SettingsModel } from './settings-model.js'

export type TakeoverTransport = 'unsupported' | 'optional'
export type SettingsApi = 'connection.api.settings' | 'remote.settings'
export type GatewayCompatEditableField = keyof typeof GATEWAY_COMPAT_FIELDS

export interface DshVersionCapabilities {
  settingsTransport: 'legacy' | 'modern'
  settingsApi: SettingsApi
  /**
   * Which settings architecture the release exposes. `namespace` covers the
   * rc.7 through 0.1.6 lines; `entry-config` starts at the 0.1.7 line, where a
   * plugin owns its section as a Loader entry instead of registering a
   * namespace, so `register`/`installSection`/`get` no longer exist.
   */
  settingsModel: SettingsModel
  baseModelFields: readonly ('reasoningEfforts' | 'input' | 'contextWindow')[]
  gatewayCompatFields: readonly GatewayCompatEditableField[]
  externalLanguages: boolean
  takeoverTransport: TakeoverTransport
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

const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

const legacyBaseModelFields = ['reasoningEfforts'] as const
const completeBaseModelFields = ['reasoningEfforts', 'input', 'contextWindow'] as const

/**
 * Half-open capability windows. Each `maximumExclusive` bound marks the first
 * DSH version whose capabilities are not yet known, so a release newer than the
 * newest window maps to nothing. An unmapped version is not an error: callers
 * fall back to the runtime capability the host actually exposes, and
 * `resolveCompatibility` reports the detected profile without a mismatch
 * diagnostic. Extend the newest bound when a release is verified to stay inside
 * the window it would otherwise fall out of.
 *
 * The newest window is bounded per minor line, matching how `0.1.6-0` was
 * chosen for the `0.1.5` line: `0.1.6-alpha.1` was verified directly (modern
 * Settings transport, `user`-layer reads, the same editable compat fields as
 * the window it joins, external language packs, optional takeover) and the
 * bound moved to `0.1.7-0` so the whole `0.1.6` line resolves instead of
 * falling out of the map.
 *
 * The `0.1.2-alpha.1` line splits at `0.1.3-alpha.2`: that prerelease is what
 * grew the editable field set (`thinkingTokenBudgetField` on completions,
 * `supportsMaxOutputTokens` on Responses, plus the numeric `vllmPriority`),
 * measured against the real packages. The split is a prerelease comparison, so
 * `0.1.3-0` and `0.1.3-alpha.1` still resolve to the narrower set.
 *
 * The `0.1.7` window records the settings rewrite: `0.1.7-alpha.1` was verified
 * directly and keeps the modern transport, the `user` layer, the same editable
 * compat fields, external language packs and optional takeover, but replaces
 * namespace registration with per-entry `Config` forms. `0.2.0-rc.2` was
 * verified to stay inside that same window: the settings controller,
 * `configForms`, `plugin-compatibility`, the locale pack and the model
 * directory are byte-identical to `0.2.0-rc.1`, the pi-ai `compatProfile` is
 * unchanged, and the one gate that release adds (`mistral-conversations`)
 * offers no field, so the plugin's editable set is untouched. `0.2.1-alpha.1`
 * was verified the same way against `0.2.0-rc.2`: every API this plugin reads
 * is byte-identical (settings controller, `configForms`,
 * `plugin-compatibility`, locale pack, model directory, the
 * `conversation.input.model` seat contract — still `{ locked }` — and the
 * `modelDirectories`/`remote.session` faces), pi-ai stays at 0.87.1 with the
 * same offered field sets, and the release's breaking changes miss this
 * plugin: it imports no `./invariant` entry, registers no input-stats
 * extension, and is configured as a package-root specifier rather than a
 * subpath specifier. The bound is `0.2.2-0`, so the whole `0.1.7` through
 * `0.2.1` span resolves.
 */
const versionRanges: readonly VersionRange[] = [
  {
    minimum: '0.1.0-rc.7',
    maximumExclusive: '0.1.0-rc.8',
    capabilities: {
      settingsTransport: 'legacy',
      settingsApi: 'connection.api.settings',
      settingsModel: 'namespace',
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
      settingsModel: 'namespace',
      baseModelFields: completeBaseModelFields,
      gatewayCompatFields: RC8_COMPAT_FIELDS,
      externalLanguages: false,
      takeoverTransport: 'optional',
    },
  },
  {
    minimum: '0.1.2-alpha.1',
    maximumExclusive: '0.1.3-alpha.2',
    capabilities: {
      settingsTransport: 'modern',
      settingsApi: 'remote.settings',
      settingsModel: 'namespace',
      baseModelFields: completeBaseModelFields,
      gatewayCompatFields: ALPHA1_PLUS_COMPAT_FIELDS,
      externalLanguages: true,
      takeoverTransport: 'optional',
    },
  },
  {
    // `0.1.3-alpha.2` grew the completions gate by `thinkingTokenBudgetField`
    // and `vllmPriority` and the Responses gate by `supportsMaxOutputTokens`
    // (task 7 adds the numeric one). The bound is the prerelease `alpha.2`
    // itself, so `0.1.3-0` and `0.1.3-alpha.1` stay in the window above.
    minimum: '0.1.3-alpha.2',
    maximumExclusive: '0.1.7-0',
    capabilities: {
      settingsTransport: 'modern',
      settingsApi: 'remote.settings',
      settingsModel: 'namespace',
      baseModelFields: completeBaseModelFields,
      gatewayCompatFields: ALPHA3_PLUS_COMPAT_FIELDS,
      externalLanguages: true,
      takeoverTransport: 'optional',
    },
  },
  {
    // Verified through `0.2.1-alpha.1`: the 0.1.7 line's window was extended
    // rather than split, because neither the 0.2.0 nor the 0.2.1 line changed
    // any capability it maps. The bound is the first release of the next minor
    // line (`0.2.2-0`), so `0.2.0`, `0.2.1` and their prereleases resolve here.
    minimum: '0.1.7-0',
    maximumExclusive: '0.2.2-0',
    capabilities: {
      settingsTransport: 'modern',
      settingsApi: 'remote.settings',
      settingsModel: 'entry-config',
      baseModelFields: completeBaseModelFields,
      gatewayCompatFields: ALPHA3_PLUS_COMPAT_FIELDS,
      externalLanguages: true,
      takeoverTransport: 'optional',
    },
  },
]

function comparableVersion(value: string): ComparableVersion {
  const [withoutBuild] = value.split('+', 2)
  const separator = withoutBuild.indexOf('-')
  const core = separator === -1 ? withoutBuild : withoutBuild.slice(0, separator)
  const prerelease = separator === -1 ? undefined : withoutBuild.slice(separator + 1)
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

export function takeoverTransportForVersion(version: string): TakeoverTransport | undefined {
  return capabilitiesForVersion(version)?.takeoverTransport
}

export function takeoverSupportedForVersion(version: string): boolean {
  return takeoverTransportForVersion(version) === 'optional'
}

export function settingsModelForVersion(version: string): SettingsModel | undefined {
  return capabilitiesForVersion(version)?.settingsModel
}

/**
 * The settings model the plugin must code against. The live service decides,
 * because the same version can be reached through a compatibility provider;
 * the version map only answers when the service exposes neither shape. An
 * unknown version with an unknown service yields `undefined`, and callers keep
 * their most conservative behaviour.
 */
export function settingsModelForRuntime(input: {
  readonly settings?: unknown
  readonly version?: unknown
}): SettingsModel | undefined {
  const detected = settingsModelOf(input.settings)
  if (detected !== undefined) return detected
  return typeof input.version === 'string' ? settingsModelForVersion(input.version) : undefined
}
