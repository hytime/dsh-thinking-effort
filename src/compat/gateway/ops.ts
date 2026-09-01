import type { InventoryItem, SettingsOp } from '../../client/types.js'
import type { GatewayCompatEditability, ModelGatewayCompatUpdate, ProviderGatewayCompatUpdate } from './types.js'

function providerPath(provider: string, field: string): string[] {
  return ['providers', provider, 'compat', field]
}

function pushModeOperation(operations: SettingsOp[], path: string[], value: unknown): void {
  if (value === 'auto') {
    operations.push({ op: 'unset', path })
  } else if (value === 'supported') {
    operations.push({ op: 'set', path, value: true })
  } else if (value === 'unsupported') {
    operations.push({ op: 'set', path, value: false })
  }
}

function pushMaxTokensOperation(operations: SettingsOp[], path: string[], value: unknown): void {
  if (value === 'auto') {
    operations.push({ op: 'unset', path })
  } else if (value === 'max_tokens' || value === 'max_completion_tokens') {
    operations.push({ op: 'set', path, value })
  }
}

export function opsForProviderCompat(
  provider: string,
  update: Partial<ProviderGatewayCompatUpdate>,
  editability?: Partial<Pick<GatewayCompatEditability, 'supportsDeveloperRole' | 'maxTokensField'>>,
): SettingsOp[] {
  if (provider.trim() === '') return []

  const operations: SettingsOp[] = []
  if (Object.prototype.hasOwnProperty.call(update, 'supportsDeveloperRole')
    && editability?.supportsDeveloperRole === true) {
    pushModeOperation(operations, providerPath(provider, 'supportsDeveloperRole'), update.supportsDeveloperRole)
  }
  if (Object.prototype.hasOwnProperty.call(update, 'maxTokensField')
    && editability?.maxTokensField === true) {
    pushMaxTokensOperation(operations, providerPath(provider, 'maxTokensField'), update.maxTokensField)
  }
  return operations
}

export function opsForModelCompat(
  item: InventoryItem,
  update: Partial<ModelGatewayCompatUpdate>,
  editability?: Partial<Pick<GatewayCompatEditability, 'supportsDeveloperRole' | 'maxTokensField'>>,
): SettingsOp[] {
  if (item.route.trim() === '' || (!item.inOverrides && (!Number.isInteger(item.index) || item.index < 0))) return []

  const prefix = item.inOverrides
    ? ['providers', item.route, 'modelOverrides', item.model, 'compat']
    : ['providers', item.route, 'models', String(item.index), 'compat']
  const operations: SettingsOp[] = []
  if (Object.prototype.hasOwnProperty.call(update, 'supportsDeveloperRole')
    && editability?.supportsDeveloperRole === true) {
    pushModeOperation(operations, [...prefix, 'supportsDeveloperRole'], update.supportsDeveloperRole)
  }
  if (Object.prototype.hasOwnProperty.call(update, 'maxTokensField')
    && editability?.maxTokensField === true) {
    pushMaxTokensOperation(operations, [...prefix, 'maxTokensField'], update.maxTokensField)
  }
  return operations
}

export const providerCompatOps = opsForProviderCompat
