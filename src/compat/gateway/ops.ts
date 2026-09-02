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

  const fields = Object.keys(update)
  if (fields.some((field) => field !== 'supportsDeveloperRole' && field !== 'maxTokensField')) return []
  if (Object.prototype.hasOwnProperty.call(update, 'supportsDeveloperRole')
    && (editability?.supportsDeveloperRole !== true
      || !['auto', 'supported', 'unsupported'].includes(update.supportsDeveloperRole as string))) return []
  if (Object.prototype.hasOwnProperty.call(update, 'maxTokensField')
    && (editability?.maxTokensField !== true
      || !['auto', 'max_tokens', 'max_completion_tokens'].includes(update.maxTokensField as string))) return []

  const operations: SettingsOp[] = []
  if (Object.prototype.hasOwnProperty.call(update, 'supportsDeveloperRole')) {
    pushModeOperation(operations, providerPath(provider, 'supportsDeveloperRole'), update.supportsDeveloperRole)
  }
  if (Object.prototype.hasOwnProperty.call(update, 'maxTokensField')) {
    pushMaxTokensOperation(operations, providerPath(provider, 'maxTokensField'), update.maxTokensField)
  }
  return operations
}

export function opsForModelCompat(
  item: InventoryItem,
  update: Partial<ModelGatewayCompatUpdate>,
  editability?: Partial<Pick<GatewayCompatEditability, 'supportsDeveloperRole' | 'maxTokensField'>>,
): SettingsOp[] {
  if (item.inOverrides !== true
    || typeof item.route !== 'string'
    || item.route.trim() === ''
    || typeof item.model !== 'string'
    || item.model.trim() === '') return []

  const fields = Object.keys(update)
  if (fields.length === 0 || fields.some((field) => field !== 'supportsDeveloperRole' && field !== 'maxTokensField')) return []
  if (fields.some((field) => {
    if (field === 'supportsDeveloperRole') {
      return editability?.supportsDeveloperRole !== true
        || !['auto', 'supported', 'unsupported'].includes(update.supportsDeveloperRole as string)
    }
    return editability?.maxTokensField !== true
      || !['auto', 'max_tokens', 'max_completion_tokens'].includes(update.maxTokensField as string)
  })) return []

  const prefix = ['providers', item.route, 'modelOverrides', item.model, 'compat']
  const operations: SettingsOp[] = []
  if (Object.prototype.hasOwnProperty.call(update, 'supportsDeveloperRole')) {
    pushModeOperation(operations, [...prefix, 'supportsDeveloperRole'], update.supportsDeveloperRole)
  }
  if (Object.prototype.hasOwnProperty.call(update, 'maxTokensField')) {
    pushMaxTokensOperation(operations, [...prefix, 'maxTokensField'], update.maxTokensField)
  }
  return operations
}

export const providerCompatOps = opsForProviderCompat
