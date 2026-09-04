import type { GatewayCompatSource } from './types.js'

export type GatewayCompatFieldKind = 'boolean' | 'enum'
export type GatewayCompatGroupId = 'role' | 'format' | 'stream' | 'cache'

/**
 * Route protocols understood by DSH's `llm-pi-ai` compat gates. Each protocol
 * offers only a subset of the scalar gateway compat fields; configuring a field
 * the route's protocol does not offer makes DSH's `assertOfferedCompatFields`
 * reject the whole settings mutate.
 */
export type GatewayProtocol =
  | 'openai-completions'
  | 'openai-responses'
  | 'azure-openai-responses'
  | 'openai-codex-responses'
  | 'anthropic-messages'
  | 'bedrock-converse-stream'

const COMPLETIONS: readonly GatewayProtocol[] = ['openai-completions']
const RESPONSES: readonly GatewayProtocol[] = ['openai-responses', 'azure-openai-responses', 'openai-codex-responses']
const COMPLETIONS_AND_RESPONSES: readonly GatewayProtocol[] = [...COMPLETIONS, ...RESPONSES]
const STRICT_MODE_PROTOCOLS: readonly GatewayProtocol[] = [...COMPLETIONS_AND_RESPONSES, 'bedrock-converse-stream']
const LONG_CACHE_PROTOCOLS: readonly GatewayProtocol[] = [...COMPLETIONS_AND_RESPONSES, 'anthropic-messages']

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

interface GatewayCompatFieldBase {
  readonly key: string
  readonly group: GatewayCompatGroupId
  readonly labelKey: string
  /** Route protocols that offer this field; a field outside the route's offer must not be written. */
  readonly protocols: readonly GatewayProtocol[]
  readonly descriptionKey?: string
}

export type GatewayCompatFieldSpec =
  | (GatewayCompatFieldBase & { readonly kind: 'boolean' })
  | (GatewayCompatFieldBase & {
      readonly kind: 'enum'
      readonly enumValues: readonly string[]
      readonly enumOptions?: readonly GatewayCompatFieldOption[]
    })

export const SUPPORTED_THINKING_FORMATS = [
  'openai', 'openrouter', 'deepseek', 'together', 'baseten', 'zai', 'qwen',
  'chat-template', 'qwen-chat-template', 'string-thinking', 'ant-ling',
] as const

export const MAX_TOKENS_FIELDS = ['max_tokens', 'max_completion_tokens'] as const

function booleanField(key: string, group: GatewayCompatGroupId, protocols: readonly GatewayProtocol[]) {
  return { key, kind: 'boolean' as const, group, labelKey: key, protocols }
}

function enumField<const V extends readonly string[]>(
  key: string,
  group: GatewayCompatGroupId,
  protocols: readonly GatewayProtocol[],
  enumValues: V,
  enumOptions?: readonly GatewayCompatFieldOption[],
) {
  return { key, kind: 'enum' as const, group, labelKey: key, protocols, enumValues, enumOptions }
}

export const GATEWAY_COMPAT_FIELDS = {
  supportsDeveloperRole: booleanField('supportsDeveloperRole', 'role', COMPLETIONS_AND_RESPONSES),
  supportsReasoningEffort: booleanField('supportsReasoningEffort', 'role', COMPLETIONS),
  supportsThinkingTokenBudget: booleanField('supportsThinkingTokenBudget', 'role', COMPLETIONS),
  thinkingFormat: enumField('thinkingFormat', 'format', COMPLETIONS, SUPPORTED_THINKING_FORMATS),
  maxTokensField: enumField('maxTokensField', 'format', COMPLETIONS, MAX_TOKENS_FIELDS, [
    { value: 'max_tokens', labelKey: 'maxTokensFieldStandard' },
    { value: 'max_completion_tokens', labelKey: 'maxTokensFieldCompletion' },
  ]),
  requiresThinkingAsText: booleanField('requiresThinkingAsText', 'format', COMPLETIONS),
  requiresReasoningContentOnAssistantMessages: booleanField('requiresReasoningContentOnAssistantMessages', 'format', COMPLETIONS),
  supportsUsageInStreaming: booleanField('supportsUsageInStreaming', 'stream', COMPLETIONS),
  supportsFinishReason: booleanField('supportsFinishReason', 'stream', COMPLETIONS),
  requiresToolResultName: booleanField('requiresToolResultName', 'stream', COMPLETIONS),
  requiresAssistantAfterToolResult: booleanField('requiresAssistantAfterToolResult', 'stream', COMPLETIONS),
  supportsStrictMode: booleanField('supportsStrictMode', 'stream', STRICT_MODE_PROTOCOLS),
  supportsStore: booleanField('supportsStore', 'cache', COMPLETIONS),
  supportsLongCacheRetention: booleanField('supportsLongCacheRetention', 'cache', LONG_CACHE_PROTOCOLS),
  cacheControlFormat: enumField('cacheControlFormat', 'cache', COMPLETIONS, ['anthropic'], [
    { value: 'anthropic', labelKey: 'cacheControlFormatAnthropic' },
  ]),
} as const

export type GatewayCompatFieldKey = keyof typeof GATEWAY_COMPAT_FIELDS
export const GATEWAY_COMPAT_FIELD_KEYS = Object.keys(GATEWAY_COMPAT_FIELDS) as GatewayCompatFieldKey[]

/**
 * Return the gateway compat fields offered by a route's `api` protocol. An
 * unknown or missing api offers every registered field, so routes that do not
 * declare a protocol keep the previous full-field compatibility behavior.
 * Handles api values that are a string, an object (e.g. the provider profile),
 * or undefined.
 */
export function fieldsForApi(api: unknown): readonly GatewayCompatFieldKey[] {
  const rawProtocol = typeof api === 'string' && api.length > 0 ? api : record(api)?.api
  const protocol = typeof rawProtocol === 'string' && rawProtocol.length > 0 ? rawProtocol : undefined
  if (protocol === undefined) return GATEWAY_COMPAT_FIELD_KEYS
  const offered = GATEWAY_COMPAT_FIELD_KEYS.filter((key) => (
    GATEWAY_COMPAT_FIELDS[key].protocols.some((candidate) => candidate === protocol)
  ))
  return offered.length > 0 ? offered : GATEWAY_COMPAT_FIELD_KEYS
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

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

type FieldSpecOf<K extends GatewayCompatFieldKey> = (typeof GATEWAY_COMPAT_FIELDS)[K]
type BooleanFieldKey = { [K in GatewayCompatFieldKey]: FieldSpecOf<K> extends { kind: 'boolean' } ? K : never }[GatewayCompatFieldKey]
type EnumFieldKey = { [K in GatewayCompatFieldKey]: FieldSpecOf<K> extends { kind: 'enum'; enumValues: readonly string[] } ? K : never }[GatewayCompatFieldKey]
type EnumValuesOf<K extends EnumFieldKey> = FieldSpecOf<K> extends { readonly enumValues: infer V extends readonly string[] } ? V[number] : never

export type GatewayCompatValue<K extends GatewayCompatFieldKey> =
  K extends BooleanFieldKey ? boolean
  : K extends EnumFieldKey ? EnumValuesOf<K>
  : unknown

export type GatewayCompatSelectionFor<K extends GatewayCompatFieldKey> =
  K extends BooleanFieldKey ? 'auto' | 'supported' | 'unsupported'
  : K extends EnumFieldKey ? 'auto' | EnumValuesOf<K>
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
