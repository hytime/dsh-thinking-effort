import type { DshVersionCapabilities } from '../version-map.js'
import { SUPPORTED_THINKING_FORMATS } from './fields.js'
import type {
  AvailableNamed,
  GatewayCompatFieldKey,
  GatewayCompatSelection,
  GatewayCompatSelectionFor,
  ResolvedNamed,
  SourceNamed,
} from './fields.js'

export type { AvailableNamed, GatewayCompatFieldKey, GatewayCompatSelection, GatewayCompatSelectionFor, ResolvedNamed, SourceNamed } from './fields.js'
export { SUPPORTED_THINKING_FORMATS } from './fields.js'

export type GatewayCompatMode = 'auto' | 'supported' | 'unsupported'
export type MaxTokensField = 'max_tokens' | 'max_completion_tokens'
export type GatewayCompatSource = 'model' | 'provider' | 'base' | 'catalog' | 'protocol' | 'unknown'
export type ProviderGatewayCompatSource = 'user' | 'base' | 'catalog' | 'unknown'

export type GatewayCompat = Partial<Record<GatewayCompatFieldKey, unknown>>

export type ThinkingFormat = (typeof SUPPORTED_THINKING_FORMATS)[number]

/** Generalized registry-key member shipped as `GatewayCompatSchemaField` (overload of `GatewayCompatFieldKey`). */
export type GatewayCompatSchemaField = GatewayCompatFieldKey

export interface GatewayCompatFieldResolution<T> {
  readonly value: T | undefined
  readonly source: GatewayCompatSource
}
export type GatewayCompatEditability = Partial<Record<GatewayCompatFieldKey, boolean>> & {
  readonly editableFields: readonly GatewayCompatFieldKey[]
}
export interface GatewayCompatValidationResult extends GatewayCompatEditability {
  readonly available: boolean
}
export type GatewayCompatSchema = Readonly<Partial<Record<GatewayCompatFieldKey, unknown>>>

export interface GatewayCompatResolveInput {
  readonly provider: string
  readonly model?: string
  readonly modelCompat?: unknown
  readonly providerCompat?: unknown
  readonly baseCompat?: unknown
  readonly catalogCompat?: unknown
  readonly protocolDefault?: unknown
  readonly versionCapabilities?: DshVersionCapabilities
}
export type GatewayCompatResolution = {
  readonly provider: string
  readonly model?: string
  readonly versionCapabilities?: DshVersionCapabilities
} & { readonly [Key in GatewayCompatFieldKey]: GatewayCompatFieldResolution<unknown> }

/** Bare-name selection field for every registry key, e.g. `supportsDeveloperRole`, `maxTokensField`. */
type SelectionFieldRecord = { readonly [Key in GatewayCompatFieldKey]: GatewayCompatSelectionFor<Key> }
/** Optional bare-name selection field for every registry key (for update payloads). */
type SelectionFieldUpdate = { readonly [Key in GatewayCompatFieldKey]?: GatewayCompatSelectionFor<Key> }

export type ModelGatewayCompatView = SourceNamed & AvailableNamed & ResolvedNamed & SelectionFieldRecord & {
  readonly provider: string
  readonly model: string
}

export type ModelGatewayCompatUpdate = SelectionFieldUpdate

export type ProviderGatewayCompatView = SourceNamed & AvailableNamed & SelectionFieldRecord & {
  readonly provider: string
  readonly source: ProviderGatewayCompatSource
}

export type ProviderGatewayCompatUpdate = SelectionFieldUpdate
