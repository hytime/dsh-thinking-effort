import type { DshVersionCapabilities } from '../version-map.js'

export type GatewayCompatMode = 'auto' | 'supported' | 'unsupported'
export type MaxTokensField = 'max_tokens' | 'max_completion_tokens'

export type GatewayCompatSchemaField =
  | 'thinkingFormat'
  | 'supportsReasoningEffort'
  | 'supportsDeveloperRole'
  | 'maxTokensField'

export const SUPPORTED_THINKING_FORMATS = [
  'openai',
  'openrouter',
  'deepseek',
  'together',
  'baseten',
  'zai',
  'qwen',
  'chat-template',
  'qwen-chat-template',
  'string-thinking',
  'ant-ling',
] as const

export type ThinkingFormat = typeof SUPPORTED_THINKING_FORMATS[number]
export type GatewayCompatSource = 'model' | 'provider' | 'base' | 'catalog' | 'protocol' | 'unknown'
export type ProviderGatewayCompatSource = 'user' | 'base' | 'catalog' | 'unknown'

export interface GatewayCompat {
  readonly thinkingFormat?: ThinkingFormat
  readonly supportsReasoningEffort?: boolean
  readonly supportsDeveloperRole?: boolean
  readonly maxTokensField?: MaxTokensField
}

export interface ModelGatewayCompatView {
  readonly provider: string
  readonly model: string
  readonly supportsDeveloperRole: GatewayCompatMode
  readonly maxTokensField: 'auto' | MaxTokensField
  readonly supportsDeveloperRoleSource: GatewayCompatSource
  readonly maxTokensFieldSource: GatewayCompatSource
  readonly supportsDeveloperRoleAvailable: boolean
  readonly maxTokensFieldAvailable: boolean
}

export interface ModelGatewayCompatUpdate {
  readonly supportsDeveloperRole?: GatewayCompatMode
  readonly maxTokensField?: 'auto' | MaxTokensField
}

export interface ProviderGatewayCompatView {
  provider: string
  supportsDeveloperRole: GatewayCompatMode
  maxTokensField: 'auto' | MaxTokensField
  supportsDeveloperRoleSource: GatewayCompatSource
  maxTokensFieldSource: GatewayCompatSource
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
  readonly thinkingFormat: GatewayCompatFieldResolution<ThinkingFormat>
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
  readonly baseCompat?: unknown
  readonly catalogCompat?: unknown
  readonly protocolDefault?: unknown
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

export type GatewayCompatSchema = Readonly<Partial<Record<GatewayCompatSchemaField, unknown>>>
