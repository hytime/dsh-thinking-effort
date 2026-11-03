import { capabilitiesForVersion } from '../version-map.js'
import { GATEWAY_COMPAT_FIELDS, GATEWAY_COMPAT_FIELD_KEYS } from './fields.js'
import type { GatewayCompatFieldKey, GatewayCompatFieldKind } from './fields.js'
import {
  resolveTakeoverProviders,
  takeoverGatewayCompatInputs,
} from './takeover.js'
import type { PiAiSection, TakeoverSection } from './takeover.js'
import { isUnknownRecord } from '../../shared/guards.js'
import type {
  GatewayCompat,
  GatewayCompatEditability,
  GatewayCompatFieldResolution,
  GatewayCompatResolveInput,
  GatewayCompatResolution,
  GatewayCompatSource,
  MaxTokensField,
  ModelGatewayCompatView,
  PreserveThinkingContext,
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
  return isUnknownRecord(value) ? value : undefined
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
      const fieldValue = spec.key === 'preserveThinking'
        ? record(input.chatTemplateKwargs)?.preserve_thinking
        : input[spec.key]
      if (spec.kind === 'boolean') {
        if (typeof fieldValue === 'boolean') output[spec.key] = fieldValue
      } else if (spec.kind === 'enum') {
        if (typeof fieldValue === 'string' && (spec.enumValues as readonly string[]).some((entry) => entry === fieldValue)) {
          output[spec.key] = fieldValue
        }
      } else if (typeof fieldValue === 'number' && Number.isFinite(fieldValue)) {
        // `number` fields are numeric in the document (`vllmPriority` is
        // `z.number().step(1)` in DSH), so a string here is not a usable value.
        output[spec.key] = fieldValue
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

type RawCompatSource = { readonly value: unknown; readonly source: GatewayCompatSource }

function rawCompatSources(input: GatewayCompatResolveInput): RawCompatSource[] {
  return [
    { value: input.modelCompat, source: 'model' },
    { value: input.providerCompat, source: 'provider' },
    { value: input.baseCompat, source: 'base' },
    { value: input.catalogCompat, source: 'catalog' },
    { value: input.protocolDefault, source: 'protocol' },
  ]
}

/** DSH replaces chatTemplateKwargs as one compat field; nested keys do not merge. */
function atomicChatTemplateKwargs(sources: readonly RawCompatSource[]): GatewayCompatFieldResolution<unknown> {
  for (const source of sources) {
    const candidates = Array.isArray(source.value) ? source.value : [source.value]
    for (const candidate of candidates) {
      const compat = compatRecord(candidate)
      if (compat && Object.prototype.hasOwnProperty.call(compat, 'chatTemplateKwargs')) {
        const value = compat.chatTemplateKwargs
        // configuredCompatEntries in DSH skips empty objects entirely: an
        // empty dict left by Auto does not mask a lower layer's kwargs.
        if (isUnknownRecord(value) && Object.keys(value).length === 0) continue
        return { value, source: source.source }
      }
    }
  }
  return { value: undefined, source: 'unknown' }
}

function resolvePreserveThinking(
  sources: readonly RawCompatSource[],
  format: GatewayCompatFieldResolution<unknown>,
): GatewayCompatFieldResolution<unknown> {
  // pi-ai's Qwen shorthand hardcodes preserve=true and ignores custom kwargs.
  if (format.value === 'qwen-chat-template') return { value: true, source: format.source }
  // Other formats never consume chatTemplateKwargs.preserve_thinking.
  if (format.value !== 'chat-template') return { value: undefined, source: 'unknown' }
  const kwargs = atomicChatTemplateKwargs(sources)
  const preserved = record(kwargs.value)?.preserve_thinking
  return { value: typeof preserved === 'boolean' ? preserved : undefined, source: kwargs.source }
}

/** Effective raw values needed to change preserve without replacing custom reasoning mappings. */
export function resolvePreserveThinkingContext(input: GatewayCompatResolveInput): PreserveThinkingContext {
  const sources = rawCompatSources(input)
  const readSources = sources.map((source) => ({ value: readCompat(source.value), source: source.source }))
  return {
    thinkingFormat: sourceFor('thinkingFormat', readSources).value,
    chatTemplateKwargs: atomicChatTemplateKwargs(sources).value,
  }
}

export function resolveGatewayCompat(input: GatewayCompatResolveInput): GatewayCompatResolution {
  const rawSources = rawCompatSources(input)
  const sources = rawSources.map((source) => ({ value: readCompat(source.value), source: source.source }))
  const fields = {} as Record<GatewayCompatFieldKey, GatewayCompatFieldResolution<unknown>>
  for (const key of GATEWAY_COMPAT_FIELD_KEYS) fields[key] = sourceFor(key, sources)
  fields.preserveThinking = resolvePreserveThinking(rawSources, fields.thinkingFormat)
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

function selectionFor(modelCompatValue: unknown, kind: GatewayCompatFieldKind): string {
  if (modelCompatValue === undefined) return 'auto'
  if (kind === 'boolean') return modelCompatValue ? 'supported' : 'unsupported'
  // `enum` and `number` both carry their value as a string in the UI; the write
  // path parses a numeric string back into a number.
  return String(modelCompatValue)
}

function isFieldAvailable(editability: GatewayCompatEditability | Record<string, unknown>, key: string, resolved: unknown): boolean {
  const record = editability as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(record, key)) return record[key] === true
  if (Object.prototype.hasOwnProperty.call(record, `${key}Available`)) return record[`${key}Available`] === true
  const ef = record.editableFields
  // 若 editableFields 是数组，它的 includes(key) 完全决定可用性（含负向 false）
  if (Array.isArray(ef)) return ef.includes(key)
  // 完全未提供编辑性信息才 fallback 到 resolved
  return resolved !== undefined
}

export function resolveModelGatewayCompat(
  input: GatewayCompatResolveInput & { readonly model: string },
  editability: GatewayCompatEditability | Record<string, unknown> = {},
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

export function resolveProviderGatewayCompat(
  input: GatewayCompatResolveInput,
  editability: GatewayCompatEditability | Record<string, unknown> = {},
): ProviderGatewayCompatView {
  const resolution = resolveGatewayCompat({ ...input, model: undefined, modelCompat: undefined })
  const out: Record<string, unknown> = { provider: input.provider }
  for (const key of GATEWAY_COMPAT_FIELD_KEYS) {
    const spec = GATEWAY_COMPAT_FIELDS[key]
    // provider 视图只看 source === 'provider' 的值作为显式选择，否则 auto
    const explicit = resolution[key].source === 'provider' ? resolution[key].value : undefined
    out[key] = selectionFor(explicit, spec.kind)
    out[`${key}Source`] = resolution[key].source
    out[`${key}Resolved`] = resolution[key].value
    out[`${key}Available`] = isFieldAvailable(editability, key, resolution[key].value)
  }
  out.source = providerSource(resolution)
  return out as unknown as ProviderGatewayCompatView
}

export type { MaxTokensField }
