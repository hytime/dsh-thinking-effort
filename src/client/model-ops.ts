import type { InventoryItem, ModelUpdate, SettingsOp } from './types.js'

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
      const overrides: Record<string, Record<string, unknown>> = {}
      for (const candidate of candidates) overrides[candidate.model] = { ...candidate.raw }
      for (const update of group.updates) {
        overrides[update.item.model] = mergeModelUpdate(overrides[update.item.model] ?? {}, update)
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
