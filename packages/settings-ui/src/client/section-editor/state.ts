import {
  GATEWAY_COMPAT_FIELD_KEYS,
  type GatewayCompatFieldKey,
} from '@hytime/dsh-plugin-kit'
import { isPluginEntrySection } from '../subagent-section.js'
import { modelCompatKey } from '../model-inventory.js'
import { isOpenCodeSessionNamespace } from '../model-header-ops.js'
import {
  compactionPolicyFrom,
  formatRatioPercent,
} from '@hytime/dsh-plugin-kit'
import { isUnknownRecord } from '@hytime/dsh-plugin-kit'
import type {
  CompactionPolicySettings,
} from '@hytime/dsh-plugin-kit'
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
} from '@hytime/dsh-plugin-kit'

/** Which of one model's own fields the panel has edited since its last read. */
export type DirtyFields = { levels?: boolean; context?: boolean; input?: boolean }

/**
 * What the model editor holds for one model's compaction override.
 *
 * The two fields keep the PERCENT text the user typed rather than a fraction:
 * the panel shows and edits percentages, and an empty field is meaningful — it
 * means "follow the global ratio", which cannot be written into the input
 * because a typed number and an inherited number would then look identical.
 * `touched` separates the two: a draft nobody edited is rebuilt from the
 * persisted section on every re-read, while an edited one survives it.
 */
export interface CompactionDraft {
  /** Percent text for this model's `thresholdRatio`; empty follows the global value. */
  threshold: string
  /** Percent text for this model's `retainRatio`; empty follows the global value. */
  retain: string
  /** Whether either field was edited since the draft was last built from settings. */
  touched: boolean
}

/** The subagent default route the picker holds before it is saved. */
export interface SubagentModelDraft {
  /** Provider id, or an empty string for "inherit the parent session's route". */
  provider: string
  /** Exact model id, or an empty string for "inherit". */
  model: string
  /** Whether the user changed the pair since it was last read from settings. */
  touched: boolean
}

/** One provider row of the subagent default-model picker, with its selectable models. */
export interface SubagentModelRoute {
  readonly provider: string
  readonly models: readonly string[]
}

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
  /**
   * Per-model compaction overrides, keyed like every other per-model draft.
   * They live beside `contextDrafts` rather than inside it because they are NOT
   * part of the `providers[].models` container: their persistence path is
   * `compaction.models[route][model]`, a leaf of the plugin's own section.
   */
  compactionDrafts: Record<string, CompactionDraft>
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
  /** The subagent default-route picker's unsaved state. */
  subagentModelDraft: SubagentModelDraft
  quickSettingsOpen: boolean
}

export const initialState: EditorState = {
  loading: true, namespace: null, openCodeSessionReads: 0, openCodeSessionViews: {}, openCodeSessionDrafts: {}, openCodeSessionDirty: {}, openCodeSessionFound: false, openCodeSessionAvailable: false, inventory: [], providerViews: {}, providerDrafts: {}, providerDirty: {}, providerCompatDirty: {}, providerCompatExpanded: {}, modelCompatViews: {}, modelCompatDrafts: {}, modelCompatDirty: {}, modelCompatExpanded: {}, revision: 0, expanded: {}, expandedProviders: {}, drafts: {}, contextDrafts: {}, inputDrafts: {}, compactionDrafts: {}, dirty: {}, busy: false, error: null, notice: null, query: '', nsFound: true, pluginSection: null, subagent: null, subagentDraft: 'default', subagentCustom: '', subagentModelDraft: { provider: '', model: '', touched: false }, quickSettingsOpen: false,
}

/** One model's row key: the same identity the inventory and the ops use. */
export function keyOf(item: InventoryItem): string {
  return modelCompatKey(item.route, item.model)
}

/**
 * The plugin's compaction policy as the panel edits it.
 *
 * The resolved `value` layer is authoritative when the host publishes it — it is
 * the schema defaults merged with the user document, so it already reflects every
 * write this panel makes. A section carrying no `compaction` there is the
 * legacy/unresolved case, where the raw user layer is the only source.
 */
export function compactionPolicyOf(section: SettingsNamespace | null): CompactionPolicySettings {
  const resolved = compactionPolicyFrom(section?.value?.compaction)
  if (isUnknownRecord(section?.value?.compaction)) return resolved
  return compactionPolicyFrom(section?.user?.compaction)
}

/**
 * The percent text the model editor shows for one route.
 *
 * An unset override renders as an EMPTY field rather than as the inherited
 * number: writing the inherited value into the input would silently convert
 * "follow the global setting" into a pinned per-model override the moment the
 * user saved an unrelated field.
 */
export function compactionDraftFrom(
  policy: CompactionPolicySettings,
  route: string,
  model: string,
): CompactionDraft {
  const override = policy.models[route]?.[model]
  return {
    threshold: override?.thresholdRatio === undefined ? '' : formatRatioPercent(override.thresholdRatio),
    retain: override?.retainRatio === undefined ? '' : formatRatioPercent(override.retainRatio),
    touched: false,
  }
}

/**
 * Rebuild the per-model compaction drafts from a freshly read section.
 *
 * An untouched draft is replaced outright so a re-read shows what the document
 * now holds; a touched one is kept, because it is the user's unsaved edit and a
 * refresh (a sibling save, another window's write) must not silently discard it.
 * Drafts for models that left the inventory are dropped: their key addresses a
 * route the panel can no longer render, and keeping it would resurrect the row's
 * pending state if the same model ever came back under different settings.
 */
export function compactionDraftsFor(
  current: EditorState,
  policy: CompactionPolicySettings,
  inventory: readonly InventoryItem[],
): Record<string, CompactionDraft> {
  const next: Record<string, CompactionDraft> = {}
  for (const item of inventory) {
    const key = keyOf(item)
    const existing = current.compactionDrafts[key]
    next[key] = existing !== undefined && existing.touched ? existing : compactionDraftFrom(policy, item.route, item.model)
  }
  return next
}

/**
 * Read the stored subagent default route into the picker's draft.
 *
 * An untouched draft follows the document; a touched one survives the re-read.
 * A cleared pair arrives as either absent fields or empty strings — the schema
 * defaults both to `''` — so both spell "inherit".
 */
export function subagentModelDraftFor(current: EditorState, namespace: SettingsNamespace | null): SubagentModelDraft {
  if (current.subagentModelDraft.touched) return current.subagentModelDraft
  // The resolved `value` layer is authoritative when the host publishes it (it
  // merges the user document with the schema defaults); the user layer is the
  // fallback for a host that has no resolved shape yet.
  const stored = isUnknownRecord(namespace?.value?.subagentModel)
    ? namespace.value.subagentModel
    : namespace?.user?.subagentModel
  const provider = isUnknownRecord(stored) && typeof stored.provider === 'string' ? stored.provider : ''
  const model = isUnknownRecord(stored) && typeof stored.model === 'string' ? stored.model : ''
  return { provider, model, touched: false }
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
