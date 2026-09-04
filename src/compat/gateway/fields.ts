import type { GatewayCompatSource } from './types.js'

export type GatewayCompatFieldKind = 'boolean' | 'enum'
export type GatewayCompatGroupId = 'role' | 'format' | 'stream' | 'cache'

export interface GatewayCompatGroup {
  readonly id: GatewayCompatGroupId
  readonly titleKey: string
}

export const GATEWAY_COMPAT_GROUPS: readonly GatewayCompatGroup[] = [
  { id: 'role', titleKey: 'gatewayGroupRole' },
  { id: 'format', titleKey: 'gatewayGroupFormat' },
  { id: 'stream', titleKey: 'gatewayGroupStream' },
  { id: 'cache', titleKey: 'gatewayGroupCache' },
]

export interface GatewayCompatFieldOption {
  readonly value: string
  readonly labelKey?: string
}

export interface GatewayCompatFieldSpec {
  readonly key: string
  readonly kind: GatewayCompatFieldKind
  readonly group: GatewayCompatGroupId
  readonly enumValues?: readonly string[]
  readonly enumOptions?: readonly GatewayCompatFieldOption[]
  readonly labelKey: string
  readonly descriptionKey?: string
}

export const SUPPORTED_THINKING_FORMATS = [
  'openai', 'openrouter', 'deepseek', 'together', 'baseten', 'zai', 'qwen',
  'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling',
] as const

export const MAX_TOKENS_FIELDS = ['max_tokens', 'max_completion_tokens'] as const

function booleanField(key: string, group: GatewayCompatGroupId): GatewayCompatFieldSpec {
  return { key, kind: 'boolean', group, labelKey: key }
}

function enumField(key: string, group: GatewayCompatGroupId, enumValues: readonly string[], enumOptions?: readonly GatewayCompatFieldOption[]): GatewayCompatFieldSpec {
  return { key, kind: 'enum', group, labelKey: key, enumValues, enumOptions }
}

export const GATEWAY_COMPAT_FIELDS = {
  supportsDeveloperRole: booleanField('supportsDeveloperRole', 'role'),
  supportsReasoningEffort: booleanField('supportsReasoningEffort', 'role'),
  supportsThinkingTokenBudget: booleanField('supportsThinkingTokenBudget', 'role'),
  thinkingFormat: enumField('thinkingFormat', 'format', SUPPORTED_THINKING_FORMATS),
  maxTokensField: enumField('maxTokensField', 'format', MAX_TOKENS_FIELDS, [
    { value: 'max_tokens', labelKey: 'maxTokensFieldStandard' },
    { value: 'max_completion_tokens', labelKey: 'maxTokensFieldCompletion' },
  ]),
  requiresThinkingAsText: booleanField('requiresThinkingAsText', 'format'),
  requiresReasoningContentOnAssistantMessages: booleanField('requiresReasoningContentOnAssistantMessages', 'format'),
  supportsUsageInStreaming: booleanField('supportsUsageInStreaming', 'stream'),
  supportsFinishReason: booleanField('supportsFinishReason', 'stream'),
  requiresToolResultName: booleanField('requiresToolResultName', 'stream'),
  requiresAssistantAfterToolResult: booleanField('requiresAssistantAfterToolResult', 'stream'),
  supportsStrictMode: booleanField('supportsStrictMode', 'stream'),
  supportsStore: booleanField('supportsStore', 'cache'),
  supportsLongCacheRetention: booleanField('supportsLongCacheRetention', 'cache'),
  cacheControlFormat: enumField('cacheControlFormat', 'cache', ['anthropic'], [
    { value: 'anthropic', labelKey: 'cacheControlFormatAnthropic' },
  ]),
} as const

export type GatewayCompatFieldKey = keyof typeof GATEWAY_COMPAT_FIELDS
export const GATEWAY_COMPAT_FIELD_KEYS = Object.keys(GATEWAY_COMPAT_FIELDS) as GatewayCompatFieldKey[]

/**
 * Per-DSH-version field sets. `gatewayCompatFields` in the version map must be
 * one of these arrays, NOT the flat `GATEWAY_COMPAT_FIELD_KEYS`, because DSH's
 * `llm-pi-ai` `compatProfile` grows across releases: `supportsFinishReason`
 * and `supportsThinkingTokenBudget` only exist from 0.1.2-alpha.1 onward.
 * Configuring a field the running DSH does not declare makes that DSH's
 * `assertOfferedCompatFields` reject the entire settings mutate.
 */
export const RC8_COMPAT_FIELDS = [
  'supportsStore', 'supportsDeveloperRole', 'supportsReasoningEffort',
  'supportsUsageInStreaming', 'maxTokensField', 'requiresToolResultName',
  'requiresAssistantAfterToolResult', 'requiresThinkingAsText',
  'requiresReasoningContentOnAssistantMessages', 'supportsStrictMode',
  'thinkingFormat', 'cacheControlFormat', 'supportsLongCacheRetention',
] as const satisfies readonly Omit<GatewayCompatFieldKey, 'supportsFinishReason' | 'supportsThinkingTokenBudget'>[]

export const ALPHA1_PLUS_COMPAT_FIELDS = [
  ...RC8_COMPAT_FIELDS,
  'supportsFinishReason', 'supportsThinkingTokenBudget',
] as const satisfies readonly GatewayCompatFieldKey[]

export type GatewayCompatSelection = 'auto' | string

type BooleanFieldKey = { [K in GatewayCompatFieldKey]: typeof GATEWAY_COMPAT_FIELDS[K]['kind'] extends 'boolean' ? K : never }[GatewayCompatFieldKey]
type EnumFieldKey = { [K in GatewayCompatFieldKey]: typeof GATEWAY_COMPAT_FIELDS[K]['kind'] extends 'enum' ? K : never }[GatewayCompatFieldKey]

export type GatewayCompatValue<K extends GatewayCompatFieldKey> =
  K extends BooleanFieldKey ? boolean
  : K extends EnumFieldKey ? Exclude<GatewayCompatSelection, 'auto'>
  : unknown

export type GatewayCompatSelectionFor<K extends GatewayCompatFieldKey> =
  K extends BooleanFieldKey ? 'auto' | 'supported' | 'unsupported'
  : K extends EnumFieldKey ? 'auto' | (string & {})
  : 'auto'

export type SelectionNamed = { [K in GatewayCompatFieldKey]: GatewayCompatSelectionFor<K> }
export type SourceNamed = { [K in GatewayCompatFieldKey as `${K & string}Source`]: GatewayCompatSource }
export type AvailableNamed = { [K in GatewayCompatFieldKey as `${K & string}Available`]: boolean }
export type ResolvedNamed = { [K in GatewayCompatFieldKey as `${K & string}Resolved`]: unknown }

export function fieldSpec(key: GatewayCompatFieldKey): GatewayCompatFieldSpec {
  return GATEWAY_COMPAT_FIELDS[key]
}

export function fieldsInGroup(group: GatewayCompatGroupId): readonly GatewayCompatFieldSpec[] {
  return GATEWAY_COMPAT_FIELD_KEYS.map((key) => GATEWAY_COMPAT_FIELDS[key]).filter((spec) => spec.group === group)
}
