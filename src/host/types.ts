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
  readonly get: (namespace: string) => unknown
  readonly update: (namespace: string, value: UnknownRecord) => unknown
  readonly describe: () => unknown
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
