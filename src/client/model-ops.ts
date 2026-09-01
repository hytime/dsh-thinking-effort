import type { InventoryItem, ModelUpdate, SettingsOp } from './types.js'

export { opsForModelCompat, opsForProviderCompat } from '../compat/gateway/ops.js'

export function mergeModelUpdate(raw: Record<string, unknown>, update: ModelUpdate): Record<string, unknown> {
  const next = { ...raw }
  if (update.levels !== undefined) next.reasoningEfforts = update.levels
  if (update.contextWindowTouched === true) {
    if (update.contextWindow === undefined) delete next.contextWindow
    else next.contextWindow = update.contextWindow
  }
  if (update.inputTouched === true) {
    if (update.input === undefined) delete next.input
    else next.input = update.input
  }
  return next
}

interface Group {
  route: string
  type: 'models' | 'modelOverrides'
  updates: ModelUpdate[]
}

export function setOps(inventory: readonly InventoryItem[], updates: readonly ModelUpdate[]): SettingsOp[] {
  const groups = new Map<string, Group>()
  for (const update of updates) {
    const { item } = update
    if (!item) continue
    const type = item.inOverrides ? 'modelOverrides' : 'models'
    const key = `${item.route}\u0000${type}`
    const group = groups.get(key) ?? { route: item.route, type, updates: [] }
    group.updates.push(update)
    groups.set(key, group)
  }

  return [...groups.values()].map((group) => {
    const candidates = inventory.filter((candidate) => candidate.route === group.route
      && (group.type === 'modelOverrides' ? candidate.inOverrides : !candidate.inOverrides))
    if (group.type === 'modelOverrides') {
      const overrides = Object.fromEntries(
        candidates.map((candidate) => [candidate.model, { ...candidate.raw }]),
      ) as Record<string, Record<string, unknown>>
      for (const update of group.updates) {
        const model = update.item.model
        const current = Object.prototype.hasOwnProperty.call(overrides, model) ? overrides[model] : {}
        Object.defineProperty(overrides, model, {
          configurable: true,
          enumerable: true,
          value: mergeModelUpdate(current, update),
          writable: true,
        })
      }
      return { op: 'set', path: ['providers', group.route, 'modelOverrides'], value: overrides }
    }

    const models = [...candidates]
      .sort((a, b) => a.index - b.index)
      .map((candidate) => {
        const update = group.updates.find((entry) => entry.item.index === candidate.index && entry.item.model === candidate.model)
        return update ? mergeModelUpdate({ ...candidate.raw }, update) : { ...candidate.raw }
      })
    return { op: 'set', path: ['providers', group.route, 'models'], value: models }
  })
}
