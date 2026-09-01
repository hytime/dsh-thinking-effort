import { SUPPORTED_THINKING_FORMATS } from './types.js'
import { capabilitiesForVersion } from '../version-map.js'
import {
  resolveTakeoverProviders,
  takeoverGatewayCompatInputs,
} from './takeover.js'
import type { PiAiSection, TakeoverSection } from './takeover.js'
import type {
  GatewayCompat,
  GatewayCompatFieldResolution,
  GatewayCompatResolveInput,
  GatewayCompatResolution,
  GatewayCompatSource,
  MaxTokensField,
  ProviderGatewayCompatView,
} from './types.js'

export {
  declaresThinking,
  identifyTakeoverProviders,
  isCustomOpenAiGateway,
  isProviderTakenOver,
  resolveTakeoverProviders,
  takeoverGatewayCompatInputs,
  takeoverProvidersOf,
} from './takeover.js'
export type {
  PiAiModelRow,
  PiAiProviderProfile,
  PiAiSection,
  TakeoverGatewayCompatInputs,
  TakeoverProvidersInput,
  TakeoverSection,
} from './takeover.js'

const gatewayFields = ['thinkingFormat', 'supportsReasoningEffort', 'supportsDeveloperRole', 'maxTokensField'] as const

type GatewayField = typeof gatewayFields[number]

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function compatRecord(value: unknown): Record<string, unknown> | undefined {
  const input = record(value)
  if (!input) return undefined
  const nested = record(input.compat)
  return nested ?? input
}

function isSupportedThinkingFormat(value: unknown): value is typeof SUPPORTED_THINKING_FORMATS[number] {
  return typeof value === 'string' && SUPPORTED_THINKING_FORMATS.some((entry) => entry === value)
}

function readCompat(value: unknown): GatewayCompat {
  const input = compatRecord(value)
  if (!input) return {}
  const output: { -readonly [Key in keyof GatewayCompat]?: GatewayCompat[Key] } = {}
  if (isSupportedThinkingFormat(input.thinkingFormat)) {
    output.thinkingFormat = input.thinkingFormat
  }
  if (typeof input.supportsReasoningEffort === 'boolean') {
    output.supportsReasoningEffort = input.supportsReasoningEffort
  }
  if (typeof input.supportsDeveloperRole === 'boolean') {
    output.supportsDeveloperRole = input.supportsDeveloperRole
  }
  if (input.maxTokensField === 'max_tokens' || input.maxTokensField === 'max_completion_tokens') {
    output.maxTokensField = input.maxTokensField
  }
  return output
}

function sourceFor(field: GatewayField, sources: readonly { value: GatewayCompat; source: GatewayCompatSource }[]): GatewayCompatFieldResolution<never> {
  for (const candidate of sources) {
    const value = candidate.value[field]
    if (value !== undefined) return { value: value as never, source: candidate.source }
  }
  return { value: undefined, source: 'unknown' }
}

export function resolveGatewayCompat(input: GatewayCompatResolveInput): GatewayCompatResolution {
  const sources = [
    { value: readCompat(input.modelCompat), source: 'model' as const },
    { value: readCompat(input.providerCompat), source: 'provider' as const },
    { value: readCompat(input.catalogCompat), source: 'catalog' as const },
    { value: readCompat(input.protocolDefault), source: 'protocol' as const },
  ]
  return {
    provider: input.provider,
    ...(input.model === undefined ? {} : { model: input.model }),
    thinkingFormat: sourceFor('thinkingFormat', sources),
    supportsReasoningEffort: sourceFor('supportsReasoningEffort', sources),
    supportsDeveloperRole: sourceFor('supportsDeveloperRole', sources),
    maxTokensField: sourceFor('maxTokensField', sources),
    ...(input.versionCapabilities === undefined ? {} : { versionCapabilities: input.versionCapabilities }),
  }
}

export function resolveTakeoverGatewayCompat(input: {
  readonly version?: unknown
  readonly piAi?: PiAiSection
  readonly takeover?: TakeoverSection
  readonly provider: string
  readonly model?: string
}): GatewayCompatResolution | undefined {
  const version = input.version
  if (typeof version !== 'string') return undefined
  const providers = resolveTakeoverProviders({ version, piAi: input.piAi, takeover: input.takeover })
  if (!providers.includes(input.provider)) return undefined
  const capabilities = capabilitiesForVersion(version)
  if (capabilities === undefined) return undefined
  const projected = takeoverGatewayCompatInputs(input.piAi, input.provider, input.model)
  return resolveGatewayCompat({
    provider: input.provider,
    ...(input.model === undefined ? {} : { model: input.model }),
    ...projected,
    versionCapabilities: capabilities,
  })
}

function providerSource(resolution: GatewayCompatResolution): ProviderGatewayCompatView['source'] {
  const sources = [
    resolution.supportsDeveloperRole.source,
    resolution.maxTokensField.source,
  ]
  if (sources.includes('model') || sources.includes('provider')) return 'user'
  if (sources.includes('protocol')) return 'base'
  if (sources.includes('catalog')) return 'catalog'
  return 'unknown'
}

export function resolveProviderGatewayCompat(input: GatewayCompatResolveInput): ProviderGatewayCompatView {
  const resolution = resolveGatewayCompat(input)
  const developer = resolution.supportsDeveloperRole.value
  const maxTokens = resolution.maxTokensField.value
  return {
    provider: input.provider,
    supportsDeveloperRole: developer === undefined ? 'auto' : developer ? 'supported' : 'unsupported',
    maxTokensField: maxTokens ?? 'auto',
    supportsDeveloperRoleAvailable: developer !== undefined,
    maxTokensFieldAvailable: maxTokens !== undefined,
    source: providerSource(resolution),
  }
}

export const resolveProviderCompat = resolveProviderGatewayCompat
export const resolveGatewayCompatibility = resolveGatewayCompat

export function gatewayCompatFieldNames(): readonly GatewayField[] {
  return gatewayFields
}

export type { MaxTokensField }
