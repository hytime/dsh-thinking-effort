import type { InventoryItem, InputModality, ModelGatewayCompatView, ProviderGatewayCompatView, ReasoningEfforts, SettingsNamespace, CompatibilityProfile } from './types.js'
import type { TakeoverRuntimeResolution } from './takeover-runtime.js'
import { resolveModelGatewayCompat, resolveProviderGatewayCompat } from '../compat/gateway/resolve.js'
import { editableProviderCompatFields } from '../compat/gateway/validation.js'
import { hasModelSourceConflict } from '../compat/model-source.js'

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
  if (hasModelSourceConflict(profile)) return undefined

  const overrides = record(profile.modelOverrides)
  if (overrides !== undefined && Object.prototype.hasOwnProperty.call(overrides, model)) {
    const override = record(overrides[model])
    return override === undefined ? undefined : record(override.compat)
  }

  if (Array.isArray(profile.models)) {
    const row = profile.models.find((entry) => record(entry)?.id === model)
    return record(record(row)?.compat)
  }
  return undefined
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
  const supportsDeveloperRole = resolution.supportsDeveloperRole.source === 'protocol'
    ? resolution.supportsDeveloperRole.value
    : undefined
  const maxTokensField = resolution.maxTokensField.source === 'protocol'
    ? resolution.maxTokensField.value
    : undefined
  if (supportsDeveloperRole === undefined && maxTokensField === undefined) return undefined
  return {
    ...(supportsDeveloperRole === undefined ? {} : { supportsDeveloperRole }),
    ...(maxTokensField === undefined ? {} : { maxTokensField }),
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
  const catalogProfile = record(record(record(descriptor?.value)?.providers)?.[item.route])
  const catalogModel = hasModelSourceConflict(catalogProfile)
    ? undefined
    : record(item.raw?.compat) ?? modelLayerCompat(descriptor?.value, item.route, item.model)
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
  return resolved
}

export const modelCompatViewFrom = modelGatewayCompatViewFrom

export function modelCompatKey(route: string, model: string): string {
  return JSON.stringify([route, model])
}

export function modelGatewayCompatViewsFrom(
  namespace: SettingsNamespace | unknown,
  inventory: readonly InventoryItem[],
  compatibilityProfile: CompatibilityProfile = 'unknown',
  takeoverRuntime?: TakeoverRuntimeResolution,
): Record<string, ModelGatewayCompatView> {
  const descriptor = record(namespace)
  const value = record(descriptor?.value)
  const providers = record(value?.providers)
  return Object.fromEntries(inventory.flatMap((item) => {
    const profile = record(providers?.[item.route])
    if (hasModelSourceConflict(profile)) return []
    return [[modelCompatKey(item.route, item.model), modelGatewayCompatViewFrom(namespace, item, compatibilityProfile, takeoverRuntime)] as const]
  }))
}

export const modelCompatViewsFrom = modelGatewayCompatViewsFrom

function takeoverCompatFor(runtime: TakeoverRuntimeResolution | undefined, provider: string): TakeoverRuntimeResolution['compat'][number] | undefined {
  if (runtime === undefined || !runtime.providers.includes(provider)) return undefined
  return runtime.compat.find((resolution) => resolution.provider === provider && resolution.model === undefined)
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
  const runtime = takeoverCompatFor(takeoverRuntime, provider)
  const resolved = resolveProviderGatewayCompat({
    provider,
    providerCompat: user,
    baseCompat: base,
    catalogCompat: value,
    protocolDefault: protocolCompatFrom(runtime),
  })
  const editability = editableProviderCompatFields(compatibilityProfile, descriptor?.schema)
  return {
    ...resolved,
    supportsDeveloperRoleAvailable: editability.supportsDeveloperRole,
    maxTokensFieldAvailable: editability.maxTokensField,
  }
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
