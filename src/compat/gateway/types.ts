import type { DshVersionCapabilities } from '../version-map.js'

export type GatewayCompatMode = 'auto' | 'supported' | 'unsupported'
export type MaxTokensField = 'max_tokens' | 'max_completion_tokens'

export type GatewayCompatField =
  | 'thinkingFormat'
  | 'supportsReasoningEffort'
  | 'supportsDeveloperRole'
  | 'maxTokensField'

export type GatewayCompatSource = 'model' | 'provider' | 'catalog' | 'protocol' | 'url' | 'unknown'
export type ProviderGatewayCompatSource = 'user' | 'base' | 'catalog' | 'unknown'

export interface GatewayCompat {
  readonly thinkingFormat?: string
  readonly supportsReasoningEffort?: boolean
  readonly supportsDeveloperRole?: boolean
  readonly maxTokensField?: MaxTokensField
}

export interface ProviderGatewayCompatView {
  provider: string
  supportsDeveloperRole: GatewayCompatMode
  maxTokensField: 'auto' | MaxTokensField
  supportsDeveloperRoleAvailable: boolean
  maxTokensFieldAvailable: boolean
  source: ProviderGatewayCompatSource
}

export interface GatewayCompatFieldResolution<T> {
  readonly value: T | undefined
  readonly source: GatewayCompatSource
}

export interface GatewayCompatResolution {
  readonly provider: string
  readonly model?: string
  readonly thinkingFormat: GatewayCompatFieldResolution<string>
  readonly supportsReasoningEffort: GatewayCompatFieldResolution<boolean>
  readonly supportsDeveloperRole: GatewayCompatFieldResolution<boolean>
  readonly maxTokensField: GatewayCompatFieldResolution<MaxTokensField>
  readonly versionCapabilities?: DshVersionCapabilities
}

export interface GatewayCompatResolveInput {
  readonly provider: string
  readonly model?: string
  readonly modelCompat?: unknown
  readonly providerCompat?: unknown
  readonly catalogCompat?: unknown
  readonly protocolDefault?: unknown
  readonly providerUrl?: string
  readonly versionCapabilities?: DshVersionCapabilities
}

export interface ProviderGatewayCompatUpdate {
  readonly supportsDeveloperRole?: GatewayCompatMode
  readonly maxTokensField?: 'auto' | MaxTokensField
}

export interface GatewayCompatEditability {
  readonly supportsDeveloperRole: boolean
  readonly maxTokensField: boolean
  readonly editableFields: readonly ('supportsDeveloperRole' | 'maxTokensField')[]
}

export interface GatewayCompatValidationResult extends GatewayCompatEditability {
  readonly available: boolean
}

export type GatewayCompatSchema = Readonly<Partial<Record<GatewayCompatField, unknown>>>
