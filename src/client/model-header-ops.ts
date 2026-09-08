import type { InventoryItem, OpenCodeSessionState, SettingsNamespace, SettingsOp } from './types.js'
import { isOpenCodeSessionEnabled, modelPath, OPENCODE_SESSION_NAMESPACE } from '../compat/opencode-session.js'

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function ownRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  const object = record(value)
  if (object === undefined || !Object.prototype.hasOwnProperty.call(object, key)) return undefined
  return record(object[key])
}

function validSettingsValue(value: unknown): boolean {
  const session = ownRecord(value, 'opencodeSession')
  const providers = ownRecord(session, 'providers')
  if (providers === undefined) return false
  for (const provider of Object.values(providers)) {
    const models = ownRecord(provider, 'models')
    if (models === undefined) return false
    if (Object.values(models).some((enabled) => typeof enabled !== 'boolean')) return false
  }
  return true
}

export function isOpenCodeSessionNamespace(value: unknown): value is SettingsNamespace {
  const namespace = record(value)
  return namespace?.ns === OPENCODE_SESSION_NAMESPACE
    && typeof namespace.revision === 'number'
    && Number.isSafeInteger(namespace.revision)
    && namespace.revision >= 0
    && validSettingsValue(namespace.value)
}

export function openCodeSessionKey(item: Pick<InventoryItem, 'route' | 'model'>): string {
  return JSON.stringify([item.route, item.model])
}

export function openCodeSessionView(namespace: SettingsNamespace | null | undefined, item: InventoryItem): boolean {
  if (!isOpenCodeSessionNamespace(namespace)) return false
  return isOpenCodeSessionEnabled(namespace.value, item.route, item.model)
}

export function openCodeSessionOp(
  provider: string,
  model: string,
  enabled: boolean,
): SettingsOp | undefined {
  const path = modelPath(provider, model)
  if (path === undefined) return undefined
  return enabled
    ? { op: 'set', path, value: true }
    : { op: 'unset', path }
}

export function openCodeSessionStateFor(
  namespace: SettingsNamespace | undefined,
  inventory: readonly InventoryItem[],
  previous?: OpenCodeSessionState,
): OpenCodeSessionState {
  const available = isOpenCodeSessionNamespace(namespace)
  if (!available) {
    return {
      namespace: null,
      views: {},
      drafts: {},
      dirty: {},
      found: namespace !== undefined,
      available: false,
    }
  }

  const views: Record<string, boolean> = {}
  const drafts: Record<string, boolean> = {}
  const dirty: Record<string, boolean> = {}
  for (const item of inventory) {
    const key = openCodeSessionKey(item)
    const view = openCodeSessionView(namespace, item)
    views[key] = view
    if (previous?.dirty[key] === true && previous.drafts[key] !== undefined) {
      drafts[key] = previous.drafts[key]!
      dirty[key] = true
    } else {
      drafts[key] = view
    }
  }

  return { namespace, views, drafts, dirty, found: true, available: true }
}
