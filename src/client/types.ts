import type { ALL_LEVELS } from './constants.js'
import type { GatewayCompatFieldKey } from '../compat/gateway/fields.js'
import type { ModelGatewayCompatView as GatewayModelGatewayCompatView } from '../compat/gateway/types.js'

export type {
  GatewayCompat,
  GatewayCompatEditability,
  GatewayCompatMode,
  GatewayCompatResolution,
  GatewayCompatResolveInput,
  GatewayCompatSchemaField,
  GatewayCompatSource,
  GatewayCompatValidationResult,
  MaxTokensField,
  ModelGatewayCompatUpdate,
  ModelGatewayCompatView,
  ProviderGatewayCompatSource,
  ProviderGatewayCompatUpdate,
  ProviderGatewayCompatView,
} from '../compat/gateway/types.js'
export type {
  OpenCodeSessionSettings,
} from '../compat/opencode-session.js'
export type ModelCompatDirtyFields = Partial<Record<GatewayCompatFieldKey, boolean>>

export type ModelGatewayCompatSelection = Pick<GatewayModelGatewayCompatView, GatewayCompatFieldKey>

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
  readonly modelsSnapshot?: readonly unknown[]
  readonly modelSourceConflict?: boolean
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
  readonly schema?: unknown
  readonly base?: unknown
  readonly user?: Record<string, unknown>
  /** Owner's declared effect timing; `restart` means the write needs a DSH restart. */
  readonly applies?: string
}

/**
 * What {@link revisionOf} reads off a section: only the id is required, so a
 * caller may hand over a full `SettingsNamespace` or a partial read.
 */
export interface RevisionedSection {
  readonly ns: string
  /** A non-numeric or absent revision reads as 0. */
  readonly revision?: unknown
}

/**
 * The revision fence one settings section stands at.
 *
 * Two call shapes grew independently — a single section (`SectionEditor`) and a
 * namespace list plus id (the snapshot cards) — but both are one lookup, so
 * they share this implementation. An absent or malformed revision reads as 0,
 * which is the value every existing caller already treated as "no fence yet";
 * the callers that must fail closed instead of writing without a fence check
 * the read's shape before they get here.
 */
export function revisionOf(section: RevisionedSection): number
export function revisionOf(sections: readonly RevisionedSection[], ns: string): number
export function revisionOf(input: RevisionedSection | readonly RevisionedSection[], ns?: string): number {
  const section = Array.isArray(input)
    ? (input as readonly RevisionedSection[]).find((candidate) => candidate.ns === ns)
    : input as RevisionedSection
  return typeof section?.revision === 'number' ? section.revision : 0
}

export interface OpenCodeSessionState {
  readonly namespace: SettingsNamespace | null
  readonly views: Record<string, boolean>
  readonly drafts: Record<string, boolean>
  readonly dirty: Record<string, boolean>
  readonly found: boolean
  readonly available: boolean
}

export interface SettingsDescribeValue {
  readonly namespaces: readonly SettingsNamespace[]
  /** Whether the active settings provider accepts writes; absent means writable. */
  readonly writable?: boolean
}

export interface ClientError {
  readonly message: string
  readonly [key: string]: unknown
}

export type ClientResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ClientError }

/**
 * The read-back one settings form publishes for its section.
 *
 * Only the three fields this plugin reads are declared: `status`, `revision`
 * and `writable`. A missing `revision` means the form cannot fence a write, and
 * `writable: false` means the host is in a memory mode (off-loopback) that
 * answers every mutation with `false`.
 */
export interface ConfigFormSnapshot {
  readonly status?: string
  readonly revision?: number
  readonly writable?: boolean
}

/**
 * The official per-entry settings form (`ctx.configForms.get(entryId)`, DSH
 * 0.1.7 and later). It already owns a serialized write queue, a revision fence
 * and a post-conflict re-read — the things the panel's `runOps` hand-rolls on
 * every host that does not provide one.
 */
export interface ConfigFormFace {
  getSnapshot(): ConfigFormSnapshot
  subscribe(listener: () => void): () => void
  mutate(ops: readonly SettingsOp[], expectedRevision?: number): Promise<boolean>
  set(field: string, value: unknown): Promise<boolean>
  unset(field: string): Promise<boolean>
  dispose(): Promise<void>
}

/** The optional `ctx.configForms` service itself. */
export interface ConfigFormsService {
  get(entryId: string): ConfigFormFace | undefined
}

export interface SettingsApi {
  readonly externalLanguages: boolean
  readonly compatibilityProfile: CompatibilityProfile
  describe(): Promise<ClientResult<SettingsDescribeValue>>
  mutate(ns: string, ops: readonly SettingsOp[], expectedRevision: number): Promise<ClientResult<SettingsNamespace>>
  /**
   * Present only when the host exposes `ctx.configForms`. When it is, the
   * editor routes its writes through that form instead of `mutate`; every
   * other host keeps the `describe`/`mutate` pair alone.
   */
  formFor?(entryId: string): ConfigFormFace | undefined
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

// The official SlotRegistry face (ui-renderer registry test's ErasedService):
// register returns a disposer and inject wraps the registration callback,
// returning its disposer — so registrations can ride `context.effect`.
export interface ClientSlots {
  inject(name: string, callback: () => (() => void) | Iterable<() => void>): () => void
  register(descriptor: Record<string, unknown>, render: unknown): () => void
}

export interface ClientContext {
  get(name: string): unknown
  /** Declare a Cordis service dependency; the callback runs when the services are available. */
  inject(options: string[], callback: (scope: ClientContext) => void): unknown
  /** Mount a named Cordis plugin with its own static service dependencies. */
  plugin(plugin: { name?: string; inject?: readonly string[]; apply: (scope: ClientContext) => void }): unknown
  on(event: 'internal/service', callback: (name: string) => void): unknown
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
