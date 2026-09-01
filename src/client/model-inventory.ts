import type { InventoryItem, InputModality, ProviderGatewayCompatView, ReasoningEfforts, SettingsNamespace } from './types.js'
import { resolveProviderGatewayCompat } from '../compat/gateway/resolve.js'
import { editableProviderCompatFields } from '../compat/gateway/validation.js'
import type { GatewayCompatResolveInput } from '../compat/gateway/types.js'
import type { DshVersionCapabilities } from '../compat/version-map.js'

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

const providerCompatFields = ['supportsDeveloperRole', 'maxTokensField'] as const

type ProviderCompatField = typeof providerCompatFields[number]

function fieldLayer(source: Record<string, unknown> | undefined, field: ProviderCompatField): Record<string, unknown> {
  if (source === undefined || !Object.prototype.hasOwnProperty.call(source, field)) return {}
  return { [field]: source[field] }
}

export function providerGatewayCompatViewFrom(namespace: SettingsNamespace | unknown, provider: string): ProviderGatewayCompatView {
  const descriptor = record(namespace)
  const user = layerCompat(descriptor?.user, provider)
  const base = layerCompat(descriptor?.base, provider)
  const value = layerCompat(descriptor?.value, provider)
  const input: GatewayCompatResolveInput = {
    provider,
    providerCompat: Object.assign({}, fieldLayer(user, 'supportsDeveloperRole'), fieldLayer(user, 'maxTokensField')),
    protocolDefault: Object.assign({}, fieldLayer(base, 'supportsDeveloperRole'), fieldLayer(base, 'maxTokensField')),
    catalogCompat: Object.assign(
      {},
      user?.supportsDeveloperRole === undefined && base?.supportsDeveloperRole === undefined ? fieldLayer(value, 'supportsDeveloperRole') : {},
      user?.maxTokensField === undefined && base?.maxTokensField === undefined ? fieldLayer(value, 'maxTokensField') : {},
    ),
  }
  const resolved = resolveProviderGatewayCompat(input)
  const editability = editableProviderCompatFields(descriptor?.versionCapabilities as DshVersionCapabilities | undefined, descriptor?.schema)
  return {
    ...resolved,
    supportsDeveloperRoleAvailable: editability.supportsDeveloperRole,
    maxTokensFieldAvailable: editability.maxTokensField,
  }
}

export const providerCompatViewFrom = providerGatewayCompatViewFrom

export function providerGatewayCompatViewsFrom(namespace: SettingsNamespace | unknown): Record<string, ProviderGatewayCompatView> {
  const descriptor = record(namespace)
  const value = record(descriptor?.value)
  const providers = record(value?.providers)
  if (!providers) return {}
  return Object.fromEntries(Object.keys(providers).map((provider) => [provider, providerGatewayCompatViewFrom(namespace, provider)]))
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
