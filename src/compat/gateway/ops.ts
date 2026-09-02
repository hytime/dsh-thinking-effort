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
    || item.modelSourceConflict === true
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

export function opsForModelArrayCompat(
  inventory: readonly InventoryItem[],
  item: InventoryItem,
  update: Partial<ModelGatewayCompatUpdate>,
  editability?: Partial<Pick<GatewayCompatEditability, 'supportsDeveloperRole' | 'maxTokensField'>>,
): SettingsOp[] {
  if (item.inOverrides !== false
    || item.modelSourceConflict === true
    || typeof item.route !== 'string'
    || item.route.trim() === ''
    || typeof item.model !== 'string'
    || item.model.trim() === ''
    || !Number.isInteger(item.index)
    || item.index < 0) return []

  if (inventory.some((candidate) => candidate.route === item.route && (candidate.modelSourceConflict === true || candidate.inOverrides === true))) return []
  const matches = inventory.filter((candidate) => candidate.inOverrides === false
    && candidate.route === item.route
    && candidate.index === item.index
    && candidate.model === item.model)
  if (matches.length !== 1) return []

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

  const clone = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map((entry) => clone(entry))
    if (typeof value !== 'object' || value === null) return value
    const source = value as Record<string, unknown>
    const copy: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(source)) {
      Object.defineProperty(copy, key, {
        configurable: true,
        enumerable: true,
        value: clone(entry),
        writable: true,
      })
    }
    return copy
  }
  const snapshot = item.modelsSnapshot ?? inventory
    .filter((candidate) => candidate.inOverrides === false && candidate.route === item.route)
    .sort((left, right) => left.index - right.index)
    .map((candidate) => candidate.raw)
  if (!Array.isArray(snapshot) || snapshot.length <= item.index) return []
  const originalTarget = snapshot[item.index]
  if (typeof originalTarget !== 'object' || originalTarget === null || Array.isArray(originalTarget)
    || (originalTarget as Record<string, unknown>).id !== item.model) return []

  const models = snapshot.map((entry, index) => {
    if (index !== item.index) return clone(entry)
    const model = clone(entry) as Record<string, unknown>
    const compatSource = model.compat
    const compat = typeof compatSource === 'object' && compatSource !== null && !Array.isArray(compatSource)
      ? { ...(compatSource as Record<string, unknown>) }
      : {}
    if (Object.prototype.hasOwnProperty.call(update, 'supportsDeveloperRole')) {
      if (update.supportsDeveloperRole === 'auto') delete compat.supportsDeveloperRole
      else compat.supportsDeveloperRole = update.supportsDeveloperRole === 'supported'
    }
    if (Object.prototype.hasOwnProperty.call(update, 'maxTokensField')) {
      if (update.maxTokensField === 'auto') delete compat.maxTokensField
      else compat.maxTokensField = update.maxTokensField
    }
    if (Object.keys(compat).length === 0) delete model.compat
    else model.compat = compat
    return model
  })

  return [{ op: 'set', path: ['providers', item.route, 'models'], value: models }]
}
