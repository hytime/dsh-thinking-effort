import { capabilitiesForVersion } from '../version-map.js'
import { GATEWAY_COMPAT_FIELDS, GATEWAY_COMPAT_FIELD_KEYS } from './fields.js'
import type { GatewayCompatFieldKey } from './fields.js'
import {
  resolveTakeoverProviders,
  takeoverGatewayCompatInputs,
} from './takeover.js'
import type { PiAiSection, TakeoverSection } from './takeover.js'
import type {
  GatewayCompat,
  GatewayCompatEditability,
  GatewayCompatFieldResolution,
  GatewayCompatResolveInput,
  GatewayCompatResolution,
  GatewayCompatSource,
  MaxTokensField,
  ModelGatewayCompatView,
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

function readCompat(value: unknown): GatewayCompat {
  const candidates = Array.isArray(value) ? value : [value]
  const output: Record<string, unknown> = {}
  for (const candidate of candidates) {
    const input = compatRecord(candidate)
    if (!input) continue
    for (const spec of Object.values(GATEWAY_COMPAT_FIELDS)) {
      if (output[spec.key] !== undefined) continue
      const fieldValue = input[spec.key]
      if (spec.kind === 'boolean') {
        if (typeof fieldValue === 'boolean') output[spec.key] = fieldValue
      } else if (spec.kind === 'enum') {
        if (typeof fieldValue === 'string' && (spec.enumValues as readonly string[]).some((entry) => entry === fieldValue)) {
          output[spec.key] = fieldValue
        }
      }
    }
  }
  return output as GatewayCompat
}

function sourceFor(field: GatewayCompatFieldKey, sources: readonly { value: GatewayCompat; source: GatewayCompatSource }[]): GatewayCompatFieldResolution<unknown> {
  for (const candidate of sources) {
    const value = candidate.value[field]
    if (value !== undefined) return { value, source: candidate.source }
  }
  return { value: undefined, source: 'unknown' }
}

export function resolveGatewayCompat(input: GatewayCompatResolveInput): GatewayCompatResolution {
  const sources = [
    { value: readCompat(input.modelCompat), source: 'model' as const },
    { value: readCompat(input.providerCompat), source: 'provider' as const },
    { value: readCompat(input.baseCompat), source: 'base' as const },
    { value: readCompat(input.catalogCompat), source: 'catalog' as const },
    { value: readCompat(input.protocolDefault), source: 'protocol' as const },
  ]
  const fields = {} as Record<GatewayCompatFieldKey, GatewayCompatFieldResolution<unknown>>
  for (const key of GATEWAY_COMPAT_FIELD_KEYS) fields[key] = sourceFor(key, sources)
  return {
    provider: input.provider,
    ...(input.model === undefined ? {} : { model: input.model }),
    ...fields,
    ...(input.versionCapabilities === undefined ? {} : { versionCapabilities: input.versionCapabilities }),
  }
}

export function resolveTakeoverGatewayCompat(input: {
  readonly version?: unknown
  readonly runtimeProfile?: 'legacy' | 'modern' | 'unknown'
  readonly descriptorSchema?: unknown
  readonly piAi?: PiAiSection
  readonly takeover?: TakeoverSection
  readonly provider: string
  readonly model?: string
}): GatewayCompatResolution | undefined {
  const version = input.version
  const providers = resolveTakeoverProviders({
    version,
    runtimeProfile: input.runtimeProfile,
    descriptorSchema: input.descriptorSchema,
    piAi: input.piAi,
    takeover: input.takeover,
  })
  if (!providers.includes(input.provider)) return undefined
  const capabilities = typeof version === 'string' ? capabilitiesForVersion(version) : undefined
  const projected = takeoverGatewayCompatInputs(input.piAi, input.provider, input.model)
  return resolveGatewayCompat({
    provider: input.provider,
    ...(input.model === undefined ? {} : { model: input.model }),
    ...projected,
    ...(capabilities === undefined ? {} : { versionCapabilities: capabilities }),
  })
}

function selectionFor(modelCompatValue: unknown, kind: 'boolean' | 'enum'): string {
  if (modelCompatValue === undefined) return 'auto'
  if (kind === 'boolean') return modelCompatValue ? 'supported' : 'unsupported'
  return String(modelCompatValue)
}

function isFieldAvailable(editability: GatewayCompatEditability | Record<string, unknown>, key: string, resolved: unknown): boolean {
  const editabilityRecord = editability as Record<string, unknown>
  // 新形状: editability[key] === true
  if (editabilityRecord[key] === true) return true
  // 旧形状: editability[`${key}Available`] === true
  if (editabilityRecord[`${key}Available`] === true) return true
  // 兜底: resolved 有值
  return resolved !== undefined
}

export function resolveModelGatewayCompat(
  input: GatewayCompatResolveInput & { readonly model: string },
  editability: GatewayCompatEditability | Record<string, unknown> = { editableFields: [] },
): ModelGatewayCompatView {
  const resolution = resolveGatewayCompat(input)
  const modelCompat = readCompat(input.modelCompat)
  const out: Record<string, unknown> = { provider: input.provider, model: input.model }
  for (const key of GATEWAY_COMPAT_FIELD_KEYS) {
    const spec = GATEWAY_COMPAT_FIELDS[key]
    out[key] = selectionFor(modelCompat[key], spec.kind)
    out[`${key}Source`] = resolution[key].source
    out[`${key}Resolved`] = resolution[key].value
    out[`${key}Available`] = isFieldAvailable(editability, key, resolution[key].value)
  }
  return out as unknown as ModelGatewayCompatView
}

function providerSource(resolution: GatewayCompatResolution): ProviderGatewayCompatView['source'] {
  const sources = GATEWAY_COMPAT_FIELD_KEYS.map((key) => resolution[key].source)
  if (sources.includes('model') || sources.includes('provider')) return 'user'
  if (sources.includes('protocol') || sources.includes('base')) return 'base'
  if (sources.includes('catalog')) return 'catalog'
  return 'unknown'
}

export function resolveProviderGatewayCompat(input: GatewayCompatResolveInput): ProviderGatewayCompatView {
  const resolution = resolveGatewayCompat({ ...input, model: undefined, modelCompat: undefined })
  const out: Record<string, unknown> = { provider: input.provider }
  for (const key of GATEWAY_COMPAT_FIELD_KEYS) {
    const spec = GATEWAY_COMPAT_FIELDS[key]
    // provider 视图只看 source === 'provider' 的值作为显式选择，否则 auto
    const explicit = resolution[key].source === 'provider' ? resolution[key].value : undefined
    out[key] = selectionFor(explicit, spec.kind)
    out[`${key}Source`] = resolution[key].source
    out[`${key}Available`] = explicit !== undefined
  }
  out.source = providerSource(resolution)
  return out as unknown as ProviderGatewayCompatView
}

export const resolveProviderCompat = resolveProviderGatewayCompat
export const resolveGatewayCompatibility = resolveGatewayCompat

export function gatewayCompatFieldNames(): readonly GatewayCompatFieldKey[] {
  return GATEWAY_COMPAT_FIELD_KEYS
}

export type { MaxTokensField }
