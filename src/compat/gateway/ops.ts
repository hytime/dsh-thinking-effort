import type { InventoryItem, SettingsOp } from '../../client/types.js'
import { GATEWAY_COMPAT_FIELDS, GATEWAY_COMPAT_FIELD_KEYS, type GatewayCompatFieldKey, type GatewayCompatFieldSpec } from './fields.js'
import type { GatewayCompatEditability, ModelGatewayCompatUpdate, ProviderGatewayCompatUpdate } from './types.js'

type CompatEditability = Partial<Pick<GatewayCompatEditability, GatewayCompatFieldKey>>

function providerPath(provider: string, field: string): string[] {
  return ['providers', provider, 'compat', field]
}

function fieldValue(spec: GatewayCompatFieldSpec, value: unknown): boolean | string | undefined {
  if (value === 'auto') return undefined
  if (spec.kind === 'boolean') {
    if (value === 'supported') return true
    if (value === 'unsupported') return false
    return undefined
  }
  if (typeof value === 'string' && (spec.enumValues as readonly string[]).some((entry) => entry === value)) return value
  return undefined
}

function pushFieldOperation(operations: SettingsOp[], path: string[], spec: GatewayCompatFieldSpec, value: unknown): void {
  const result = fieldValue(spec, value)
  if (result === undefined) {
    if (value === 'auto') operations.push({ op: 'unset', path })
    return
  }
  operations.push({ op: 'set', path, value: result })
}

function fieldEditable(editability: CompatEditability | undefined, key: GatewayCompatFieldKey, spec: GatewayCompatFieldSpec, value: unknown): boolean {
  if (typeof value === 'string' && (value === 'auto' || fieldValue(spec, value) !== undefined)) return editability?.[key] === true
  return false
}

export function opsForProviderCompat(
  provider: string,
  update: Partial<ProviderGatewayCompatUpdate>,
  editability?: CompatEditability,
): SettingsOp[] {
  if (provider.trim() === '') return []

  const fields = Object.keys(update)
  if (fields.length === 0) return []
  if (fields.some((field) => {
    if (!(GATEWAY_COMPAT_FIELD_KEYS as readonly string[]).includes(field)) return true
    const key = field as GatewayCompatFieldKey
    return !fieldEditable(editability, key, GATEWAY_COMPAT_FIELDS[key], update[key])
  })) return []

  const operations: SettingsOp[] = []
  GATEWAY_COMPAT_FIELD_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(update, key)) return
    pushFieldOperation(operations, providerPath(provider, key), GATEWAY_COMPAT_FIELDS[key], update[key])
  })
  return operations
}

export function opsForModelCompat(
  item: InventoryItem,
  update: Partial<ModelGatewayCompatUpdate>,
  editability?: CompatEditability,
): SettingsOp[] {
  if (item.inOverrides !== true
    || item.modelSourceConflict === true
    || typeof item.route !== 'string'
    || item.route.trim() === ''
    || typeof item.model !== 'string'
    || item.model.trim() === '') return []

  const fields = Object.keys(update)
  if (fields.length === 0) return []
  if (fields.some((field) => {
    if (!(GATEWAY_COMPAT_FIELD_KEYS as readonly string[]).includes(field)) return true
    const key = field as GatewayCompatFieldKey
    return !fieldEditable(editability, key, GATEWAY_COMPAT_FIELDS[key], update[key])
  })) return []

  const prefix = ['providers', item.route, 'modelOverrides', item.model, 'compat']
  const operations: SettingsOp[] = []
  GATEWAY_COMPAT_FIELD_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(update, key)) return
    pushFieldOperation(operations, [...prefix, key], GATEWAY_COMPAT_FIELDS[key], update[key])
  })
  return operations
}

export function opsForModelArrayCompat(
  inventory: readonly InventoryItem[],
  item: InventoryItem,
  update: Partial<ModelGatewayCompatUpdate>,
  editability?: CompatEditability,
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
  if (fields.length === 0) return []
  if (fields.some((field) => {
    if (!(GATEWAY_COMPAT_FIELD_KEYS as readonly string[]).includes(field)) return true
    const key = field as GatewayCompatFieldKey
    return !fieldEditable(editability, key, GATEWAY_COMPAT_FIELDS[key], update[key])
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
    GATEWAY_COMPAT_FIELD_KEYS.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(update, key)) return
      const value = update[key]
      if (value === 'auto') delete compat[key]
      else compat[key] = fieldValue(GATEWAY_COMPAT_FIELDS[key], value)
    })
    if (Object.keys(compat).length === 0) delete model.compat
    else model.compat = compat
    return model
  })

  return [{ op: 'set', path: ['providers', item.route, 'models'], value: models }]
}
