import type { InventoryItem, InputModality, ModelGatewayCompatSelection, ModelGatewayCompatView, ProviderGatewayCompatView, ReasoningEfforts, SettingsNamespace, CompatibilityProfile } from './types.js'
import type { TakeoverRuntimeResolution } from './takeover-runtime.js'
import { resolveModelGatewayCompat, resolveProviderGatewayCompat } from '../compat/gateway/resolve.js'
import { editableProviderCompatFields } from '../compat/gateway/validation.js'
import type { GatewayCompatResolveInput } from '../compat/gateway/types.js'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function modelItem(route: string, model: string, raw: Record<string, unknown>, index: number, inOverrides: boolean): InventoryItem {
  const levels = raw.reasoningEfforts === undefined ? null : raw.reasoningEfforts as ReasoningEfforts
  const contextWindow = Number.isInteger(raw.contextWindow) ? raw.contextWindow as number : undefined
  const input = Array.isArray(raw.input) ? raw.input as InputModality[] : []
  return {
    route,
    model,
    name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : model,
    levels,
    contextWindow,
    input,
    raw,
    index,
    inOverrides,
  }
}

function layerCompat(layer: unknown, provider: string): Record<string, unknown> | undefined {
  const root = record(layer)
  const providers = record(root?.providers)
  const profile = record(providers?.[provider])
  return record(profile?.compat)
}

function modelLayerCompat(layer: unknown, provider: string, model: string): Record<string, unknown> | undefined {
  const root = record(layer)
  const providers = record(root?.providers)
  const profile = record(providers?.[provider])
  if (!profile) return undefined

  const overrides = record(profile.modelOverrides)
  const override = overrides !== undefined && Object.prototype.hasOwnProperty.call(overrides, model)
    ? record(overrides[model])
    : undefined
  if (override !== undefined) return record(override.compat)

  if (Array.isArray(profile.models)) {
    const row = profile.models.find((entry) => record(entry)?.id === model)
    return record(record(row)?.compat)
  }
  return undefined
}

function modelFieldValue(
  candidates: readonly (Record<string, unknown> | undefined)[],
  field: 'supportsDeveloperRole' | 'maxTokensField',
): boolean | string | undefined {
  for (const candidate of candidates) {
    const value = candidate?.[field]
    if (field === 'supportsDeveloperRole' && typeof value === 'boolean') return value
    if (field === 'maxTokensField' && (value === 'max_tokens' || value === 'max_completion_tokens')) return value
  }
  return undefined
}

function modeFrom(value: boolean | undefined): ModelGatewayCompatSelection['supportsDeveloperRole'] {
  return value === undefined ? 'auto' : value ? 'supported' : 'unsupported'
}

function resolvedBooleanFrom(mode: ModelGatewayCompatView['supportsDeveloperRole']): boolean | undefined {
  return mode === 'auto' ? undefined : mode === 'supported'
}

function modelRuntimeCompatFor(
  runtime: TakeoverRuntimeResolution | undefined,
  provider: string,
  model: string,
): TakeoverRuntimeResolution['compat'][number] | undefined {
  return runtime?.compat.find((resolution) => resolution.provider === provider && resolution.model === model)
}

function protocolCompatFrom(
  resolution: TakeoverRuntimeResolution['compat'][number] | undefined,
): Record<string, unknown> | undefined {
  if (resolution === undefined) return undefined
  return {
    ...(resolution.supportsDeveloperRole.value === undefined ? {} : { supportsDeveloperRole: resolution.supportsDeveloperRole.value }),
    ...(resolution.maxTokensField.value === undefined ? {} : { maxTokensField: resolution.maxTokensField.value }),
  }
}

function modelGatewayCompatViewFromResolution(
  item: InventoryItem,
  resolution: TakeoverRuntimeResolution['compat'][number],
  editability: ReturnType<typeof editableProviderCompatFields>,
): ModelGatewayCompatView {
  const modelSupportsDeveloperRole = resolution.supportsDeveloperRole.source === 'model'
    ? resolution.supportsDeveloperRole.value
    : undefined
  const modelMaxTokensField = resolution.maxTokensField.source === 'model'
    ? resolution.maxTokensField.value
    : undefined
  return {
    provider: item.route,
    model: item.model,
    supportsDeveloperRole: modeFrom(modelSupportsDeveloperRole),
    maxTokensField: modelMaxTokensField ?? 'auto',
    supportsDeveloperRoleSource: resolution.supportsDeveloperRole.source,
    maxTokensFieldSource: resolution.maxTokensField.source,
    supportsDeveloperRoleResolved: resolution.supportsDeveloperRole.value,
    maxTokensFieldResolved: resolution.maxTokensField.value,
    supportsDeveloperRoleAvailable: editability.supportsDeveloperRole,
    maxTokensFieldAvailable: editability.maxTokensField,
  }
}

export function modelGatewayCompatViewFrom(
  namespace: SettingsNamespace | unknown,
  item: InventoryItem,
  compatibilityProfile: CompatibilityProfile = 'unknown',
  takeoverRuntime?: TakeoverRuntimeResolution,
): ModelGatewayCompatView {
  const descriptor = record(namespace)
  const userModel = modelLayerCompat(descriptor?.user, item.route, item.model)
  const userProvider = layerCompat(descriptor?.user, item.route)
  const baseModel = modelLayerCompat(descriptor?.base, item.route, item.model)
  const baseProvider = layerCompat(descriptor?.base, item.route)
  const catalogModel = record(item.raw?.compat) ?? modelLayerCompat(descriptor?.value, item.route, item.model)
  const catalogProvider = layerCompat(descriptor?.value, item.route)
  const runtimeModel = modelRuntimeCompatFor(takeoverRuntime, item.route, item.model)
  const editability = editableProviderCompatFields(compatibilityProfile, descriptor?.schema)
  const resolved = resolveModelGatewayCompat({
    provider: item.route,
    model: item.model,
    modelCompat: userModel,
    providerCompat: userProvider,
    baseCompat: [baseModel, baseProvider],
    catalogCompat: [catalogModel, catalogProvider],
    protocolDefault: protocolCompatFrom(runtimeModel),
  }, {
    supportsDeveloperRoleAvailable: editability.supportsDeveloperRole,
    maxTokensFieldAvailable: editability.maxTokensField,
  })
  if (runtimeModel !== undefined) return modelGatewayCompatViewFromResolution(item, runtimeModel, editability)

  const modelCandidates = [userModel, baseModel, catalogModel]
  const selectedSupportsDeveloperRole = modelFieldValue(modelCandidates, 'supportsDeveloperRole')
  const selectedMaxTokensField = modelFieldValue(modelCandidates, 'maxTokensField')
  return {
    ...resolved,
    supportsDeveloperRole: modeFrom(typeof selectedSupportsDeveloperRole === 'boolean' ? selectedSupportsDeveloperRole : undefined),
    maxTokensField: typeof selectedMaxTokensField === 'string' ? selectedMaxTokensField as ModelGatewayCompatView['maxTokensField'] : 'auto',
    supportsDeveloperRoleResolved: resolvedBooleanFrom(resolved.supportsDeveloperRole),
    maxTokensFieldResolved: resolved.maxTokensField === 'auto' ? undefined : resolved.maxTokensField,
  }
}

export const modelCompatViewFrom = modelGatewayCompatViewFrom

function takeoverCompatFor(runtime: TakeoverRuntimeResolution | undefined, provider: string): TakeoverRuntimeResolution['compat'][number] | undefined {
  if (runtime === undefined || !runtime.providers.includes(provider)) return undefined
  return runtime.compat.find((resolution) => resolution.provider === provider && resolution.model === undefined)
}

function runtimeSource(
  resolution: TakeoverRuntimeResolution['compat'][number],
  fallback: ProviderGatewayCompatView['source'],
): ProviderGatewayCompatView['source'] {
  const sources = [resolution.supportsDeveloperRole.source, resolution.maxTokensField.source]
  if (sources.includes('model') || sources.includes('provider')) return 'user'
  if (sources.includes('protocol')) return 'base'
  if (sources.includes('catalog')) return 'catalog'
  return fallback
}

function runtimeFieldValue<T>(resolution: TakeoverRuntimeResolution['compat'][number], field: 'supportsDeveloperRole' | 'maxTokensField'): T | undefined {
  const fieldResolution = resolution[field]
  return fieldResolution.source === 'provider' ? fieldResolution.value as T | undefined : undefined
}

function applyTakeoverCompat(
  view: ProviderGatewayCompatView,
  runtime: TakeoverRuntimeResolution | undefined,
): ProviderGatewayCompatView {
  const resolution = takeoverCompatFor(runtime, view.provider)
  if (resolution === undefined) return view
  const developer = runtimeFieldValue<boolean>(resolution, 'supportsDeveloperRole')
  const maxTokens = runtimeFieldValue<ProviderGatewayCompatView['maxTokensField']>(resolution, 'maxTokensField')
  return {
    ...view,
    supportsDeveloperRole: developer === undefined ? 'auto' : developer ? 'supported' : 'unsupported',
    maxTokensField: maxTokens ?? 'auto',
    supportsDeveloperRoleSource: resolution.supportsDeveloperRole.source,
    maxTokensFieldSource: resolution.maxTokensField.source,
    supportsDeveloperRoleAvailable: view.supportsDeveloperRoleAvailable,
    maxTokensFieldAvailable: view.maxTokensFieldAvailable,
    source: runtimeSource(resolution, view.source),
  }
}

export function providerGatewayCompatViewFrom(
  namespace: SettingsNamespace | unknown,
  provider: string,
  compatibilityProfile: CompatibilityProfile = 'unknown',
  takeoverRuntime?: TakeoverRuntimeResolution,
): ProviderGatewayCompatView {
  const descriptor = record(namespace)
  const user = layerCompat(descriptor?.user, provider)
  const base = layerCompat(descriptor?.base, provider)
  const value = layerCompat(descriptor?.value, provider)
  const input: GatewayCompatResolveInput = {
    provider,
    providerCompat: user,
    baseCompat: base,
    catalogCompat: value,
  }
  const resolved = resolveProviderGatewayCompat(input)
  const editability = editableProviderCompatFields(compatibilityProfile, descriptor?.schema)
  return applyTakeoverCompat({
    ...resolved,
    supportsDeveloperRoleAvailable: editability.supportsDeveloperRole,
    maxTokensFieldAvailable: editability.maxTokensField,
  }, takeoverRuntime)
}

export const providerCompatViewFrom = providerGatewayCompatViewFrom

export function providerGatewayCompatViewsFrom(
  namespace: SettingsNamespace | unknown,
  compatibilityProfile: CompatibilityProfile = 'unknown',
  takeoverRuntime?: TakeoverRuntimeResolution,
): Record<string, ProviderGatewayCompatView> {
  const descriptor = record(namespace)
  const value = record(descriptor?.value)
  const providers = record(value?.providers)
  if (!providers) return {}
  return Object.fromEntries(Object.keys(providers).map((provider) => [provider, providerGatewayCompatViewFrom(namespace, provider, compatibilityProfile, takeoverRuntime)]))
}

export const providerCompatViewsFrom = providerGatewayCompatViewsFrom

export function inventoryFrom(namespace: unknown): InventoryItem[] {
  const descriptor = record(namespace)
  const value = record(descriptor?.value)
  const providers = record(value?.providers)
  if (!providers) return []

  const inventory: InventoryItem[] = []
  for (const [route, profileValue] of Object.entries(providers)) {
    const profile = record(profileValue)
    if (!profile) continue
    if (Array.isArray(profile.models)) {
      profile.models.forEach((entry, index) => {
        const raw = record(entry)
        const model = typeof raw?.id === 'string' ? raw.id : undefined
        if (raw && model !== undefined) inventory.push(modelItem(route, model, raw, index, false))
      })
    }
    const overrides = record(profile.modelOverrides)
    if (overrides) {
      for (const [model, entry] of Object.entries(overrides)) {
        inventory.push(modelItem(route, model, record(entry) ?? {}, -1, true))
      }
    }
  }
  return inventory
}
