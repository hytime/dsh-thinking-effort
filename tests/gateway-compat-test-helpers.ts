import { GATEWAY_COMPAT_FIELD_KEYS } from '../src/compat/gateway/fields.js'
import type { ModelGatewayCompatView, ProviderGatewayCompatView } from '../src/compat/gateway/types.js'

export function countAvailable(view: Record<string, unknown>): number {
  return GATEWAY_COMPAT_FIELD_KEYS.filter((key) => view[`${key}Available`] === true).length
}

export function mainFieldCount(view: { readonly supportsDeveloperRoleAvailable: boolean; readonly maxTokensFieldAvailable: boolean }): number {
  return (view.supportsDeveloperRoleAvailable ? 1 : 0) + (view.maxTokensFieldAvailable ? 1 : 0)
}

export function availableCountFor(view: ProviderGatewayCompatView | ModelGatewayCompatView): number {
  return countAvailable(view as Record<string, unknown>) - mainFieldCount(view)
}

const selectionDefaults = Object.fromEntries(GATEWAY_COMPAT_FIELD_KEYS.map((key) => [key, 'auto']))
const sourceDefaults = Object.fromEntries(GATEWAY_COMPAT_FIELD_KEYS.map((key) => [`${key}Source`, 'unknown']))
const availableDefaults = Object.fromEntries(GATEWAY_COMPAT_FIELD_KEYS.map((key) => [`${key}Available`, false]))
const resolvedDefaults = Object.fromEntries(GATEWAY_COMPAT_FIELD_KEYS.map((key) => [`${key}Resolved`, undefined]))

export function providerView(partial: Partial<ProviderGatewayCompatView> = {}): ProviderGatewayCompatView {
  return {
    provider: 'provider',
    source: 'unknown',
    ...selectionDefaults,
    ...sourceDefaults,
    ...availableDefaults,
    ...resolvedDefaults,
    ...partial,
  } as ProviderGatewayCompatView
}

export function modelView(partial: Partial<ModelGatewayCompatView> = {}): ModelGatewayCompatView {
  return {
    provider: 'provider',
    model: 'model',
    ...selectionDefaults,
    ...sourceDefaults,
    ...availableDefaults,
    ...resolvedDefaults,
    ...partial,
  } as ModelGatewayCompatView
}