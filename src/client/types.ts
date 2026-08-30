import type { ALL_LEVELS } from './constants.js'

export type ReasoningLevel = typeof ALL_LEVELS[number]
export type ReasoningEffort = string | null
export type ReasoningEfforts = Partial<Record<ReasoningLevel, ReasoningEffort>> & Record<string, unknown>

export interface InventoryItem {
  readonly route: string
  readonly model: string
  readonly name: string
  readonly levels: ReasoningEfforts | null
  readonly contextWindow?: number
  readonly input: readonly InputModality[]
  readonly raw: Record<string, unknown>
  readonly index: number
  readonly inOverrides: boolean
}

export type InputModality = 'text' | 'image'

export interface DraftCell {
  on: boolean
  wire: string
}

export type ReasoningDraft = Partial<Record<ReasoningLevel, DraftCell>>

export interface ContextDraft {
  value: string
  oneMillion: boolean
  previousValue: string
  touched: boolean
}

export interface InputDraft {
  text: boolean
  image: boolean
  touched: boolean
}

export interface SettingsOp {
  readonly op: 'set' | 'unset'
  readonly path: readonly string[]
  readonly value?: unknown
}

export interface SettingsNamespace {
  readonly ns: string
  readonly revision: number
  readonly value: Record<string, unknown>
  readonly user?: Record<string, unknown>
}

export interface SettingsDescribeValue {
  readonly namespaces: readonly SettingsNamespace[]
}

export interface ClientError {
  readonly message: string
  readonly [key: string]: unknown
}

export type ClientResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ClientError }

export interface SettingsApi {
  readonly externalLanguages: boolean
  describe(): Promise<ClientResult<SettingsDescribeValue>>
  mutate(ns: string, ops: readonly SettingsOp[], expectedRevision: number): Promise<ClientResult<SettingsNamespace>>
}

export type CompatibilitySettings = 'remote' | 'legacy' | 'none'
export type CompatibilityProfile = 'modern' | 'legacy' | 'unknown'
export type CompatibilityDiagnosticCode = 'invalid-version' | 'version-capability-mismatch'

export interface DshCompatibilityCapabilities {
  readonly settings: CompatibilitySettings
  readonly externalLanguages: boolean
}

export interface CompatibilityDiagnostic {
  readonly code: CompatibilityDiagnosticCode
  readonly version?: string
  readonly expectedProfile?: Exclude<CompatibilityProfile, 'unknown'>
  readonly actualCapabilities: DshCompatibilityCapabilities
  readonly message: string
}

export type Translation = (key: string, params?: Record<string, unknown>) => string
export type LocaleDictionary = Record<string, string>
export type LocaleCode = 'zh' | 'en' | 'ja' | 'ko'

export interface LocaleSnapshot {
  readonly active?: string
  readonly locales?: readonly { readonly id?: string }[]
}

export interface ClientLocale {
  register(namespace: string, dictionaries: Record<LocaleCode, LocaleDictionary>): () => void
  bind(namespace: string): Translation
  getSnapshot?: () => LocaleSnapshot
  setLocale?: (locale: string) => void
  addLanguage?: (entry: { id: string; label: string; fallback: string }) => () => void
}

export interface ClientConnection {
  readonly api?: {
    readonly settings?: unknown
  }
}

export interface RemoteContext {
  get(name: string): unknown
}

export interface ClientSlots {
  inject(name: string, callback: () => void): unknown
  register(descriptor: Record<string, unknown>, render: unknown): unknown
}

export interface ClientContext {
  get(name: 'slots' | 'connection' | 'locale'): unknown
  inject(names: readonly string[], callback: (context: RemoteContext) => void): unknown
  effect(callback: () => void | (() => void), label?: string): unknown
}

export interface ModelUpdate {
  readonly item: InventoryItem
  readonly levels?: ReasoningEfforts
  readonly contextWindow?: number
  readonly contextWindowTouched?: boolean
  readonly input?: readonly InputModality[]
  readonly inputTouched?: boolean
}
