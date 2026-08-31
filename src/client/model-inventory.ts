import type { InventoryItem, InputModality, ReasoningEfforts } from './types.js'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function modelItem(route: string, model: string, raw: Record<string, unknown>, index: number, inOverrides: boolean): InventoryItem {
  const levels = raw.reasoningEfforts === undefined ? null : raw.reasoningEfforts as ReasoningEfforts
  const contextWindow = Number.isInteger(raw.contextWindow) ? raw.contextWindow as number : undefined
  const input = Array.isArray(raw.input) ? raw.input as InputModality[] : []
  return {
    route,
    model,
    name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : model,
    levels,
    contextWindow,
    input,
    raw,
    index,
    inOverrides,
  }
}

export function inventoryFrom(namespace: unknown): InventoryItem[] {
  const descriptor = record(namespace)
  const value = record(descriptor?.value)
  const providers = record(value?.providers)
  if (!providers) return []

  const inventory: InventoryItem[] = []
  for (const [route, profileValue] of Object.entries(providers)) {
    const profile = record(profileValue)
    if (!profile) continue
    if (Array.isArray(profile.models)) {
      profile.models.forEach((entry, index) => {
        const raw = record(entry)
        const model = typeof raw?.id === 'string' ? raw.id : undefined
        if (raw && model !== undefined) inventory.push(modelItem(route, model, raw, index, false))
      })
    }
    const overrides = record(profile.modelOverrides)
    if (overrides) {
      for (const [model, entry] of Object.entries(overrides)) {
        inventory.push(modelItem(route, model, record(entry) ?? {}, -1, true))
      }
    }
  }
  return inventory
}
