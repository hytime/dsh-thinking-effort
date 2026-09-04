import type { InventoryItem, InputModality, ModelGatewayCompatView, ProviderGatewayCompatView, ReasoningEfforts, SettingsNamespace, CompatibilityProfile } from './types.js'
import type { TakeoverRuntimeResolution } from './takeover-runtime.js'
import { resolveModelGatewayCompat, resolveProviderGatewayCompat } from '../compat/gateway/resolve.js'
import { editableProviderCompatFields } from '../compat/gateway/validation.js'
import { fieldsForApi, GATEWAY_COMPAT_FIELD_KEYS } from '../compat/gateway/fields.js'
import { hasLayeredModelSourceConflict, hasModelSourceConflict } from '../compat/model-source.js'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function ownedData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => ownedData(entry))
  const object = record(value)
  if (object === undefined) return value
  const copy: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(object)) {
    Object.defineProperty(copy, key, {
      configurable: true,
      enumerable: true,
      value: ownedData(entry),
      writable: true,
    })
  }
  return copy
}
function modelItem(route: string, model: string, raw: Record<string, unknown>, index: number, inOverrides: boolean, modelsSnapshot?: readonly unknown[], modelSourceConflict = false): InventoryItem {
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
    ...(modelSourceConflict ? { modelSourceConflict: true } : {}),
    ...(modelsSnapshot === undefined ? {} : { modelsSnapshot }),
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

/**
 * Resolve the `api` protocol string a route declares across the descriptor
 * value, user, and base layers. `undefined` means the route declares no
 * protocol; the UI then keeps full-field compatibility.
 */
export function routeApi(namespace: unknown, route: string): string | undefined {
  for (const layer of ['value', 'user', 'base']) {
    const root = record(record(namespace)?.[layer])
    const providers = record(root?.providers)
    const profile = record(providers?.[route])
    if (profile === undefined) continue
    const api = profile.api
    if (typeof api === 'string' && api.length > 0) return api
  }
  return undefined
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
  const projection: Record<string, unknown> = {}
  for (const key of GATEWAY_COMPAT_FIELD_KEYS) {
    const field = record(record(resolution)?.[key])
    if (field?.source === 'protocol' && field.value !== undefined) projection[key] = field.value
  }
  return Object.keys(projection).length > 0 ? projection : undefined
}

export function modelGatewayCompatViewFrom(
  namespace: SettingsNamespace | unknown,
  item: InventoryItem,
  compatibilityProfile: CompatibilityProfile = 'unknown',
  takeoverRuntime?: TakeoverRuntimeResolution,
): ModelGatewayCompatView {
  const descriptor = record(namespace)
  const sourceConflict = hasLayeredModelSourceConflict(namespace, item.route)
  const userModel = sourceConflict ? undefined : modelLayerCompat(descriptor?.user, item.route, item.model)
  const userProvider = layerCompat(descriptor?.user, item.route)
  const baseModel = sourceConflict ? undefined : modelLayerCompat(descriptor?.base, item.route, item.model)
  const baseProvider = layerCompat(descriptor?.base, item.route)
  const catalogProfile = record(record(record(descriptor?.value)?.providers)?.[item.route])
  const catalogModel = sourceConflict || hasModelSourceConflict(catalogProfile)
    ? undefined
    : record(item.raw?.compat) ?? modelLayerCompat(descriptor?.value, item.route, item.model)
  const catalogProvider = layerCompat(descriptor?.value, item.route)
  const modelSelection = userModel
  const runtimeModel = modelRuntimeCompatFor(takeoverRuntime, item.route, item.model)
  const editability = editableProviderCompatFields(compatibilityProfile, descriptor?.schema, routeApi(namespace, item.route))
  const resolved = resolveModelGatewayCompat({
    provider: item.route,
    model: item.model,
    modelCompat: modelSelection,
    providerCompat: userProvider,
    baseCompat: [baseModel, baseProvider],
    catalogCompat: [catalogModel, catalogProvider],
    protocolDefault: protocolCompatFrom(runtimeModel),
  }, editability)
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
  return Object.fromEntries(inventory.flatMap((item) => {
    if (hasLayeredModelSourceConflict(namespace, item.route)) return []
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
  const api = routeApi(namespace, provider)
  const editability = editableProviderCompatFields(compatibilityProfile, descriptor?.schema, api)
  const resolved = resolveProviderGatewayCompat({
    provider,
    providerCompat: user,
    baseCompat: base,
    catalogCompat: value,
    protocolDefault: protocolCompatFrom(runtime),
  }, editability)
  const out: Record<string, unknown> = { ...resolved }
  for (const key of GATEWAY_COMPAT_FIELD_KEYS) {
    out[`${key}Available`] = editability[key] === true
  }
  return out as unknown as ProviderGatewayCompatView
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
    const modelSourceConflict = hasLayeredModelSourceConflict(namespace, route)
    if (Array.isArray(profile.models)) {
      const modelsSnapshot = ownedData(profile.models) as readonly unknown[]
      profile.models.forEach((entry, index) => {
        const raw = record(entry)
        const model = typeof raw?.id === 'string' ? raw.id : undefined
        if (raw && model !== undefined) inventory.push(modelItem(route, model, raw, index, false, modelsSnapshot, modelSourceConflict))
      })
    }
    const overrides = record(profile.modelOverrides)
    if (overrides) {
      for (const [model, entry] of Object.entries(overrides)) {
        inventory.push(modelItem(route, model, record(entry) ?? {}, -1, true, undefined, modelSourceConflict))
      }
    }
  }
  return inventory
}
