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
