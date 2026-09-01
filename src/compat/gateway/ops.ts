import type { SettingsOp } from '../../client/types.js'
import type { GatewayCompatEditability, ProviderGatewayCompatUpdate } from './types.js'

function providerPath(provider: string, field: string): string[] {
  return ['providers', provider, 'compat', field]
}

function pushModeOperation(operations: SettingsOp[], provider: string, field: 'supportsDeveloperRole', value: unknown): void {
  if (value === 'auto') {
    operations.push({ op: 'unset', path: providerPath(provider, field) })
  } else if (value === 'supported') {
    operations.push({ op: 'set', path: providerPath(provider, field), value: true })
  } else if (value === 'unsupported') {
    operations.push({ op: 'set', path: providerPath(provider, field), value: false })
  }
}

function pushMaxTokensOperation(operations: SettingsOp[], provider: string, value: unknown): void {
  const path = providerPath(provider, 'maxTokensField')
  if (value === 'auto') {
    operations.push({ op: 'unset', path })
  } else if (value === 'max_tokens' || value === 'max_completion_tokens') {
    operations.push({ op: 'set', path, value })
  }
}

export function opsForProviderCompat(
  provider: string,
  update: Partial<ProviderGatewayCompatUpdate>,
  editability?: Pick<GatewayCompatEditability, 'supportsDeveloperRole' | 'maxTokensField'>,
): SettingsOp[] {
  if (provider.trim() === '') return []

  const operations: SettingsOp[] = []
  if (Object.prototype.hasOwnProperty.call(update, 'supportsDeveloperRole')
    && editability?.supportsDeveloperRole !== false) {
    pushModeOperation(operations, provider, 'supportsDeveloperRole', update.supportsDeveloperRole)
  }
  if (Object.prototype.hasOwnProperty.call(update, 'maxTokensField')
    && editability?.maxTokensField !== false) {
    pushMaxTokensOperation(operations, provider, update.maxTokensField)
  }
  return operations
}

export const providerCompatOps = opsForProviderCompat
