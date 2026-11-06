import {
  GATEWAY_COMPAT_FIELD_KEYS,
  type GatewayCompatFieldKey,
} from '../../compat/gateway/fields.js'
import { isPluginEntrySection } from '../subagent-section.js'
import { modelCompatKey } from '../model-inventory.js'
import { isOpenCodeSessionNamespace } from '../model-header-ops.js'
import type {
  ContextDraft,
  InputDraft,
  InventoryItem,
  ModelCompatDirtyFields,
  ModelGatewayCompatView,
  OpenCodeSessionState,
  ProviderGatewayCompatView,
  ModelUpdate,
  ReasoningDraft,
  SettingsNamespace,
} from '../types.js'

/** Which of one model's own fields the panel has edited since its last read. */
export type DirtyFields = { levels?: boolean; context?: boolean; input?: boolean }

/** One resolved `subagentEffort` read: the wire value, and the section revision it came from. */
export interface SubagentState { effort: string | null; revision: number }

/**
 * Everything the settings panel renders, in one reducer-shaped value.
 *
 * The fields fall into four groups, and the grouping is why this lives beside
 * the appliers rather than inside the component: the reads, the draft edits and
 * the write projections all have to agree on the shape, and a single owner keeps
 * them from drifting apart.
 *
 * - `namespace`/`inventory`/`revision` — the shared `llm-pi-ai` section.
 * - the `provider*`/`model*` families — the gateway compat views and the drafts
 *   derived from them, each with its own dirty map so an unsaved edit survives
 *   a re-read that resolved a different value.
 * - the per-model `drafts`/`contextDrafts`/`inputDrafts` + `dirty` — the row
 *   editors, keyed by `modelCompatKey`.
 * - `pluginSection`/`subagent`/`openCodeSession*` — the plugin's own section.
 */
export interface EditorState {
  loading: boolean
  namespace: SettingsNamespace | null
  openCodeSessionViews: Record<string, boolean>
  openCodeSessionDrafts: Record<string, boolean>
  openCodeSessionDirty: Record<string, boolean>
  openCodeSessionFound: boolean
  openCodeSessionAvailable: boolean
  inventory: InventoryItem[]
  providerViews: Record<string, ProviderGatewayCompatView>
  providerDrafts: Record<string, ProviderGatewayCompatView>
  providerDirty: Record<string, boolean>
  providerCompatDirty: Record<string, Partial<Record<GatewayCompatFieldKey, boolean>>>
  providerCompatExpanded: Record<string, boolean>
  modelCompatViews: Record<string, ModelGatewayCompatView>
  modelCompatDrafts: Record<string, ModelGatewayCompatView>
  modelCompatDirty: Record<string, ModelCompatDirtyFields>
  modelCompatExpanded: Record<string, boolean>
  revision: number
  /**
   * A count of the reads of the shared `dsh-thinking-effort` namespace, handed
   * to the generator card so it re-reads whenever this editor does. It is not
   * the namespace revision: the import path can land on one revision twice (the
   * snapshot writer commits `set`s, and the card's own write bumps it again), so
   * a value the card compares for equality has to change on every read, not
   * only when the revision does.
   */
  openCodeSessionReads: number
  expanded: Record<string, boolean>
  expandedProviders: Record<string, boolean>
  drafts: Record<string, ReasoningDraft>
  contextDrafts: Record<string, ContextDraft>
  inputDrafts: Record<string, InputDraft>
  dirty: Record<string, DirtyFields>
  busy: boolean
  error: string | null
  notice: string | null
  query: string
  nsFound: boolean
  /**
   * The plugin's own section under whatever settings model the host publishes:
   * the Loader entry section on 0.1.7 and later, the registered
   * `dsh-thinking-effort` namespace before that. Both the OpenCode session
   * fields and `subagentEffort` live in it, so the editor holds exactly ONE
   * descriptor for it — a second copy would be refreshed by only the writes
   * that named it, and because 0.1.7 revisions are per section, the copy left
   * behind would fence its next write with a stale `expectedRevision` and be
   * refused as a conflict.
   */
  pluginSection: SettingsNamespace | null
  subagent: SubagentState | null
  subagentDraft: string
  subagentCustom: string
  quickSettingsOpen: boolean
}

export const initialState: EditorState = {
  loading: true, namespace: null, openCodeSessionReads: 0, openCodeSessionViews: {}, openCodeSessionDrafts: {}, openCodeSessionDirty: {}, openCodeSessionFound: false, openCodeSessionAvailable: false, inventory: [], providerViews: {}, providerDrafts: {}, providerDirty: {}, providerCompatDirty: {}, providerCompatExpanded: {}, modelCompatViews: {}, modelCompatDrafts: {}, modelCompatDirty: {}, modelCompatExpanded: {}, revision: 0, expanded: {}, expandedProviders: {}, drafts: {}, contextDrafts: {}, inputDrafts: {}, dirty: {}, busy: false, error: null, notice: null, query: '', nsFound: true, pluginSection: null, subagent: null, subagentDraft: 'default', subagentCustom: '', quickSettingsOpen: false,
}

/** One model's row key: the same identity the inventory and the ops use. */
export function keyOf(item: InventoryItem): string {
  return modelCompatKey(item.route, item.model)
}

/**
 * Re-point a model update at the same model in a freshly read inventory.
 *
 * The model-level ops carry a whole `models` array (or `modelOverrides` dict)
 * rebuilt from this panel's inventory. Replaying that container unchanged after
 * a conflict would write the stale copy over the document and silently drop
 * whatever another writer did meanwhile — an edit to a sibling model, or a
 * model the Host's own default-levels fill had just added. Rebuilding from the
 * fresh inventory is what makes the retry additive instead of destructive.
 *
 * An update whose model is gone is dropped rather than resurrected: there is
 * nothing left to write to, and re-adding it would undo the deletion.
 */
export function rebaseItem(fresh: readonly InventoryItem[], item: InventoryItem): InventoryItem | undefined {
  return fresh.find((candidate) => candidate.route === item.route
    && candidate.model === item.model
    && candidate.inOverrides === item.inOverrides)
}

/** Re-point model updates at the same models in a freshly read inventory. */
export function rebaseUpdates(fresh: readonly InventoryItem[], updates: readonly ModelUpdate[]): ModelUpdate[] {
  return updates.flatMap((update) => {
    const item = rebaseItem(fresh, update.item)
    return item === undefined ? [] : [{ ...update, item }]
  })
}

/**
 * How many compat fields a view offers beyond the two rendered inline.
 *
 * The props pass this count to the "more fields" disclosure, so it has to match
 * the fields that disclosure actually renders: the two inline ones are excluded
 * because they already have their own controls above it.
 */
export function availableCompatFieldCount(view: ProviderGatewayCompatView | ModelGatewayCompatView): number {
  const values = view as unknown as Record<string, unknown>
  return GATEWAY_COMPAT_FIELD_KEYS.filter((key) => key !== 'supportsDeveloperRole' && key !== 'maxTokensField' && values[`${key}Available`] === true).length
}

/** Drop `fields` from one key's dirty map, and the key itself once it states nothing. */
export function removeDirtyFields<T extends object>(dirty: Record<string, T>, key: string, fields: readonly (keyof T)[]): Record<string, T> {
  const next = { ...dirty }
  const entry = { ...(next[key] ?? {}) }
  fields.forEach((field) => { delete entry[field] })
  if (Object.keys(entry).length === 0) delete next[key]
  else next[key] = entry
  return next
}

/**
 * Collapsing a row leaves the OpenCode toggle's draft alone.
 *
 * The toggle saves immediately, so its draft always equals the persisted
 * namespace value; clearing it here would make the reopened row render a blank
 * switch until the next read.
 */
export function clearOpenCodeSessionState(current: EditorState, _key: string): EditorState {
  return current
}

/**
 * Collapse one model's row editor, keeping the OpenCode toggle's draft.
 *
 * The OpenCode Header toggle saves immediately, so its draft always equals the
 * persisted namespace value. Collapsing the editor must not clear it; reopening
 * renders the saved value.
 */
export function clearModelEditorState(current: EditorState, key: string): EditorState {
  const next = clearOpenCodeSessionState(current, key)
  const expanded = { ...next.expanded }; delete expanded[key]
  const drafts = { ...current.drafts }; delete drafts[key]
  const contextDrafts = { ...current.contextDrafts }; delete contextDrafts[key]
  const inputDrafts = { ...current.inputDrafts }; delete inputDrafts[key]
  const dirty = { ...current.dirty }; delete dirty[key]
  return { ...current, expanded, drafts, contextDrafts, inputDrafts, dirty }
}

/**
 * The section whose `user` layer holds `subagentEffort`: the plugin's own entry
 * section when the host publishes one (0.1.7 and later), else the `llm-pi-ai`
 * section the releases before it wrote the value into. `null` while the model
 * registry itself is missing, which is the state the editor already reports as
 * "unconfigured": the setting is only meaningful beside the models it applies
 * to, and `nsFound` hides the rest of the page in exactly that case.
 */
export function subagentSection(
  pluginSection: SettingsNamespace | null,
  llmSection: SettingsNamespace | null,
): SettingsNamespace | null {
  return isPluginEntrySection(pluginSection) && llmSection !== null ? pluginSection : llmSection
}

/** The OpenCode session state the editor holds, in the shape its merge helpers take. */
export function openCodeStateOf(current: EditorState): OpenCodeSessionState {
  return {
    namespace: isOpenCodeSessionNamespace(current.pluginSection) ? current.pluginSection : null,
    views: current.openCodeSessionViews,
    drafts: current.openCodeSessionDrafts,
    dirty: current.openCodeSessionDirty,
    found: current.openCodeSessionFound,
    available: current.openCodeSessionAvailable,
  }
}
