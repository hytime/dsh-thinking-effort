import type { InventoryItem, SettingsOp } from '../../client/types.js'
import { isUnknownRecord } from '../../shared/guards.js'
import { GATEWAY_COMPAT_FIELDS, GATEWAY_COMPAT_FIELD_KEYS, type GatewayCompatFieldKey, type GatewayCompatFieldSpec } from './fields.js'
import type { GatewayCompatEditability, ModelGatewayCompatUpdate, PreserveThinkingContext, ProviderGatewayCompatUpdate } from './types.js'

type CompatEditability = Partial<Pick<GatewayCompatEditability, GatewayCompatFieldKey>>

function providerPath(provider: string, field?: string): string[] {
  const prefix = ['providers', provider, 'compat']
  return field === undefined ? prefix : [...prefix, field]
}

function fieldValue(spec: GatewayCompatFieldSpec, value: unknown): boolean | string | number | undefined {
  if (value === 'auto') return undefined
  if (spec.kind === 'boolean') {
    if (value === 'supported') return true
    if (value === 'unsupported') return false
    return undefined
  }
  if (spec.kind === 'enum') {
    if (typeof value === 'string' && (spec.enumValues as readonly string[]).some((entry) => entry === value)) return value
    return undefined
  }
  // `number`: the UI carries the field as a string, so parse it and require a
  // finite integer — DSH declares `z.number().step(1)`, and a fractional or
  // non-numeric string would be rejected by that schema.
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && Number.isInteger(parsed)) return parsed
  }
  return undefined
}

const ENABLE_THINKING_TEMPLATE_VALUE = { $var: 'thinking.enabled' } as const
const REASONING_EFFORT_TEMPLATE_VALUE = { $var: 'thinking.effort', omitWhenOff: true } as const

/** Build a complete atomic kwargs dict while retaining all effective custom values. */
function preserveTemplateKwargs(context: PreserveThinkingContext, preserved: boolean): Record<string, unknown> {
  const kwargs = isUnknownRecord(context.chatTemplateKwargs) ? { ...context.chatTemplateKwargs } : {}
  if (context.thinkingFormat !== 'chat-template') {
    // Switching away from OpenAI-style effort controls needs equivalent template
    // mappings, but existing values still win even on an otherwise ignored dict.
    if (!Object.prototype.hasOwnProperty.call(kwargs, 'enable_thinking')) kwargs.enable_thinking = ENABLE_THINKING_TEMPLATE_VALUE
    if (!Object.prototype.hasOwnProperty.call(kwargs, 'reasoning_effort')) kwargs.reasoning_effort = REASONING_EFFORT_TEMPLATE_VALUE
  }
  kwargs.preserve_thinking = preserved
  return kwargs
}

function preserveContextForUpdate(
  context: PreserveThinkingContext,
  update: Partial<ProviderGatewayCompatUpdate>,
): PreserveThinkingContext {
  if (!Object.prototype.hasOwnProperty.call(update, 'thinkingFormat')) return context
  return {
    ...context,
    // An Auto format cannot be assumed to remain generic after its override is
    // removed. An explicit preserve selection must therefore install generic.
    thinkingFormat: update.thinkingFormat === 'auto' ? undefined : update.thinkingFormat,
  }
}

/**
 * preserveThinking is virtual. Generic templates only change the complete
 * atomic kwargs dict; switching formats also installs missing effort mappings.
 * Auto removes only the preserve override and never deletes sibling settings.
 */
function pushPreserveThinkingOperations(
  operations: SettingsOp[],
  compatPath: string[],
  value: unknown,
  context: PreserveThinkingContext,
): void {
  const preservePath = [...compatPath, 'chatTemplateKwargs', 'preserve_thinking']
  if (value === 'auto') {
    operations.push({ op: 'unset', path: preservePath })
    return
  }
  const preserved = fieldValue(GATEWAY_COMPAT_FIELDS.preserveThinking, value)
  if (typeof preserved !== 'boolean') return
  if (context.thinkingFormat !== 'chat-template') {
    operations.push({ op: 'set', path: [...compatPath, 'thinkingFormat'], value: 'chat-template' })
  }
  operations.push({ op: 'set', path: [...compatPath, 'chatTemplateKwargs'], value: preserveTemplateKwargs(context, preserved) })
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
  preserveContext: PreserveThinkingContext = {},
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
    if (key === 'preserveThinking') pushPreserveThinkingOperations(operations, providerPath(provider), update[key], preserveContextForUpdate(preserveContext, update))
    else pushFieldOperation(operations, providerPath(provider, key), GATEWAY_COMPAT_FIELDS[key], update[key])
  })
  return operations
}

export function opsForModelCompat(
  item: InventoryItem,
  update: Partial<ModelGatewayCompatUpdate>,
  editability?: CompatEditability,
  preserveContext: PreserveThinkingContext = {},
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
    if (key === 'preserveThinking') pushPreserveThinkingOperations(operations, prefix, update[key], preserveContextForUpdate(preserveContext, update))
    else pushFieldOperation(operations, [...prefix, key], GATEWAY_COMPAT_FIELDS[key], update[key])
  })
  return operations
}

export function opsForModelArrayCompat(
  inventory: readonly InventoryItem[],
  item: InventoryItem,
  update: Partial<ModelGatewayCompatUpdate>,
  editability?: CompatEditability,
  preserveContext?: PreserveThinkingContext,
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
    const compat = isUnknownRecord(compatSource) ? { ...compatSource } : {}
    GATEWAY_COMPAT_FIELD_KEYS.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(update, key)) return
      const value = update[key]
      if (key === 'preserveThinking') {
        const kwargsSource = compat.chatTemplateKwargs
        const kwargs = isUnknownRecord(kwargsSource) ? { ...kwargsSource } : {}
        if (value === 'auto') {
          delete kwargs.preserve_thinking
          if (Object.keys(kwargs).length === 0) delete compat.chatTemplateKwargs
          else compat.chatTemplateKwargs = kwargs
        } else {
          const preserved = fieldValue(GATEWAY_COMPAT_FIELDS.preserveThinking, value)
          if (typeof preserved !== 'boolean') return
          const context = preserveContextForUpdate(
            preserveContext ?? { thinkingFormat: compat.thinkingFormat, chatTemplateKwargs: compat.chatTemplateKwargs },
            update,
          )
          if (context.thinkingFormat !== 'chat-template') compat.thinkingFormat = 'chat-template'
          compat.chatTemplateKwargs = preserveTemplateKwargs(context, preserved)
        }
      } else if (value === 'auto') delete compat[key]
      else compat[key] = fieldValue(GATEWAY_COMPAT_FIELDS[key], value)
    })
    if (Object.keys(compat).length === 0) delete model.compat
    else model.compat = compat
    return model
  })

  return [{ op: 'set', path: ['providers', item.route, 'models'], value: models }]
}
