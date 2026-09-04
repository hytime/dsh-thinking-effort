import { GATEWAY_COMPAT_FIELD_KEYS } from '../src/compat/gateway/fields.js'
import type { ModelGatewayCompatView, ProviderGatewayCompatView } from '../src/compat/gateway/types.js'

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
