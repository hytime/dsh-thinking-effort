import { openCodeSessionOp, openCodeSessionStateFor } from '../model-header-ops.js'
import { isOpenCodeSessionNamespace } from '../model-header-ops.js'
import type {
  ClientResult,
  InventoryItem,
  OpenCodeSessionState,
  SettingsApi,
  SettingsNamespace,
} from '../types.js'

export type { OpenCodeSessionState } from '../types.js'

/**
 * Project a section descriptor onto the OpenCode session toggle views.
 *
 * `previous` carries the drafts the panel already holds, so an edit that has not
 * been saved yet survives the read that resolved a different stored value.
 */
export function createOpenCodeSessionState(
  namespace: SettingsNamespace | undefined,
  inventory: readonly InventoryItem[],
  previous?: OpenCodeSessionState,
): OpenCodeSessionState {
  return openCodeSessionStateFor(namespace, inventory, previous)
}

/**
 * Merge one accepted mutation's descriptor back into the toggle views.
 *
 * A refusal and a malformed descriptor both leave the state untouched: the
 * toggle's draft was already set optimistically by the caller, and only an
 * accepted write has anything to project.
 */
export function applyOpenCodeSessionMutation(
  state: OpenCodeSessionState,
  response: ClientResult<SettingsNamespace>,
  inventory: readonly InventoryItem[],
  savedKey?: string,
): OpenCodeSessionState {
  if (!response.ok || !isOpenCodeSessionNamespace(response.value)) return state
  const previous: OpenCodeSessionState = {
    ...state,
    dirty: { ...state.dirty },
  }
  if (savedKey !== undefined) delete previous.dirty[savedKey]
  return openCodeSessionStateFor(response.value, inventory, previous)
}

/**
 * Write one model's OpenCode session flag.
 *
 * Resolves the op first so a model without a usable route/model pair is refused
 * before reaching the transport, and addresses the section the descriptor came
 * from — the entry id under 0.1.7 rather than the legacy registered namespace.
 */
export async function saveOpenCodeSession(
  settings: Pick<SettingsApi, 'mutate'>,
  namespace: SettingsNamespace,
  item: InventoryItem,
  enabled: boolean,
): Promise<ClientResult<SettingsNamespace>> {
  const operation = openCodeSessionOp(item.route, item.model, enabled)
  if (operation === undefined) {
    return { ok: false, error: { message: 'OpenCode session settings require a provider and model' } }
  }
  return settings.mutate(namespace.ns, [operation], namespace.revision)
}
