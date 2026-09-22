export type UnknownRecord = Record<string, unknown>

export interface ModelEntry extends UnknownRecord {
  readonly id?: unknown
  readonly reasoningEfforts?: unknown
}

export interface ProviderProfile extends UnknownRecord {
  readonly models?: unknown
  readonly modelOverrides?: unknown
}

export interface SettingsDescriptor extends UnknownRecord {
  readonly ns?: unknown
  readonly user?: unknown
}

export interface AgentRequestPayload extends UnknownRecord {
  readonly agent?: unknown
}

export interface AgentRequestConfig extends UnknownRecord {
  readonly provider?: unknown
  readonly model?: unknown
  readonly reasoningEffort?: unknown
}

export interface SettingsScope {
  readonly get: () => unknown
  readonly watch: (callback: (...args: unknown[]) => unknown) => () => void
}

/**
 * One path-addressed settings edit. The shape mirrors the settings service's
 * own `mutate` op, which exists under both settings models and applies the op
 * to the section as it stands when the write runs.
 *
 * The service also accepts `unset`, which the fill never issues: every fill
 * adds a level set and none removes a value, and a variant the plugin cannot
 * produce would leave the path walk of every model — including the older
 * array-unaware one this plugin must stay safe against — without a compiler
 * check on a branch it does not exercise. Narrowing here does not affect the
 * service: an array of `set` ops is assignable to the service's wider union.
 */
export interface SettingsPathOp {
  readonly op: 'set'
  readonly path: readonly string[]
  readonly value: unknown
}

export interface SettingsInjectionContext {
  readonly settings: HostSettings
  readonly effect: (callback: () => void | (() => void), label?: string) => unknown
}

export interface SettingsSectionHooks {
  readonly setSource: (source: () => unknown) => void
  readonly onChange: () => void
  readonly validate?: (value: unknown) => void
}

export interface HostSettings {
  readonly writable?: unknown
  /** Absent from the `entry-config` model, which exposes values through `describe` only. */
  readonly get?: (namespace: string) => unknown
  readonly update: (namespace: string, value: UnknownRecord) => unknown
  /**
   * Path-addressed edit, present under both settings models. Preferred over
   * `update` for a partial change: a merge carries whole subtrees, so a value
   * read from the resolved section would pin every schema default it took on.
   */
  readonly mutate?: (namespace: string, ops: readonly SettingsPathOp[]) => unknown
  readonly describe?: () => unknown
  readonly installSection?: (
    owner: unknown,
    namespace: string,
    schema: unknown,
    entry: unknown,
    hooks: SettingsSectionHooks,
  ) => void
  readonly register?: (
    namespace: string,
    schema: unknown,
    options?: UnknownRecord,
  ) => SettingsScope
}

export interface HostContext {
  readonly settings?: HostSettings
  /**
   * The plugin's own Loader entry, which the `entry-config` settings model uses
   * as its section id.
   */
  readonly fiber?: {
    readonly entry?: { readonly options?: { readonly id?: unknown } }
  }
  readonly inject?: (
    dependencies: readonly string[],
    callback: (scope: SettingsInjectionContext) => void,
  ) => unknown
  readonly timeout: (callback: () => void, delay: number) => unknown
  readonly on: (
    event: string,
    callback: (...args: unknown[]) => unknown,
    options?: UnknownRecord,
  ) => unknown
  readonly effect: (callback: () => void | (() => void), label?: string) => unknown
}

export function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isModelEntry(value: unknown): value is ModelEntry {
  return isUnknownRecord(value)
}

export function isProviderProfile(value: unknown): value is ProviderProfile {
  return isUnknownRecord(value)
}

export function isSettingsDescriptor(value: unknown): value is SettingsDescriptor {
  return isUnknownRecord(value)
}

export function isAgentRequestPayload(value: unknown): value is AgentRequestPayload {
  return isUnknownRecord(value)
}

export function isAgentRequestConfig(value: unknown): value is AgentRequestConfig {
  return isUnknownRecord(value)
}
