/**
 * The section id under the registered-namespace settings model (rc.7 … 0.1.6).
 * The 0.1.7 entry-config model addresses the section by Loader entry id
 * instead, which `settingsEntryId` reads from the live fiber.
 */
export const OPENCODE_SESSION_NAMESPACE = 'dsh-thinking-effort'
export const OPENCODE_SESSION_HEADER = 'x-opencode-session'

/**
 * The generator mode list: the Host resolves stored values against it and the
 * Client renders the mode select in this order, so both sides read one copy.
 * Kept in this module because the Client bundle imports it and must not pull a
 * `node:` built-in in.
 */
export const FORMAT_MODES = ['ses-derive', 'passthrough', 'template', 'expression', 'script'] as const
/** The timestamp-source list; same single-copy rule as `FORMAT_MODES`. */
export const FORMAT_TIMES = ['firstUse', 'hash'] as const
/** The on-invalid policy list; same single-copy rule as `FORMAT_MODES`. */
export const FORMAT_INVALID_POLICIES = ['warn', 'drop', 'send'] as const

export type OpenCodeSessionFormatMode = (typeof FORMAT_MODES)[number]
export type OpenCodeSessionTimeSource = (typeof FORMAT_TIMES)[number]
export type OpenCodeSessionInvalidPolicy = (typeof FORMAT_INVALID_POLICIES)[number]

/** Configurable generator shape stored under `opencodeSession.format`. */
export interface OpenCodeSessionFormatSettings {
  /** The generator mode; unknown values resolve to `ses-derive`. */
  readonly mode?: OpenCodeSessionFormatMode | string
  /** Where the 12-hex block comes from; `firstUse` mints once per session, `hash` derives from the session digest. */
  readonly time?: OpenCodeSessionTimeSource | string
  /** `template` mode: a string with `{hex12}`, `{tail62}`, `{sessionId}`, `{rawSessionId}`, `{sha256}`, `{now}`, `{provider}`, `{model}` placeholders. */
  readonly template?: string
  /** `expression` mode: a safe additive expression evaluated with the same context plus `sha256`, `slice`, `lower`, `upper` functions. */
  readonly expression?: string
  /** `script` mode: absolute path to a JS file exporting `format(context)`. */
  readonly script?: string
  /** Optional validation regex; invalid values follow `onInvalid`. */
  readonly validate?: string
  /** What to do when the produced value fails `validate`: `warn`, `drop`, or `send`. */
  readonly onInvalid?: OpenCodeSessionInvalidPolicy | string
}

/** Configurable `user-agent` override, scoped per provider/model. */
export interface OpenCodeSessionUserAgentSettings {
  /** Master value. Empty or absent disables the override entirely. */
  readonly value?: string
  readonly providers?: Readonly<Record<string, {
    /** Apply the override to every model on this route. */
    readonly enabled?: boolean
    /** Optional per-route value; falls back to the master `value`. */
    readonly value?: string
    readonly models?: Readonly<Record<string, boolean>>
  }>>
}

export interface OpenCodeSessionSettings {
  readonly opencodeSession?: {
    readonly providers?: Readonly<Record<string, {
      readonly models?: Readonly<Record<string, boolean>>
    }>>
    readonly format?: OpenCodeSessionFormatSettings
    readonly userAgent?: OpenCodeSessionUserAgentSettings
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function ownRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  const object = record(value)
  if (object === undefined || !Object.prototype.hasOwnProperty.call(object, key)) return undefined
  return record(object[key])
}

export function isOpenCodeSessionEnabled(
  settings: unknown,
  provider: string,
  model: string,
): boolean {
  if (provider.length === 0 || model.length === 0) return false
  const opencodeSession = ownRecord(settings, 'opencodeSession')
  const providers = ownRecord(opencodeSession, 'providers')
  const providerSettings = ownRecord(providers, provider)
  const models = ownRecord(providerSettings, 'models')
  return Object.prototype.hasOwnProperty.call(models ?? {}, model) && models?.[model] === true
}

export function modelPath(provider: string, model: string): readonly string[] | undefined {
  if (provider.length === 0 || model.length === 0) return undefined
  return ['opencodeSession', 'providers', provider, 'models', model]
}
