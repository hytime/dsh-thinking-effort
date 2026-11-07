import { GATEWAY_COMPAT_FIELD_KEYS } from '../../compat/gateway/fields.js'
import {
  inventoryFrom,
  modelGatewayCompatViewsFrom,
  providerGatewayCompatViewsFrom,
} from '../model-inventory.js'
import { createOpenCodeSessionState, applyOpenCodeSessionMutation } from './open-code-session.js'
import { subagentView } from './subagent.js'
import {
  compactionDraftsFor,
  compactionPolicyOf,
  keyOf,
  openCodeStateOf,
  subagentModelDraftFor,
  subagentSection,
  type EditorState,
} from './state.js'
import { revisionOf } from '../types.js'
import type {
  CompatibilityProfile,
  InventoryItem,
  SettingsNamespace,
} from '../types.js'
import type { TakeoverRuntimeResolution } from '../takeover-runtime.js'

/**
 * The gateway-compat views and drafts a section read produces.
 *
 * A draft that the panel has marked dirty keeps its edited value: the re-read
 * resolved a different one, and silently overwriting the edit is what the dirty
 * map exists to prevent. Every other draft follows the read.
 */
function compatViewsOf(
  namespace: SettingsNamespace,
  inventory: readonly InventoryItem[],
  profile: CompatibilityProfile,
  takeoverResolution: TakeoverRuntimeResolution,
  current: EditorState,
): {
  providerViews: EditorState['providerViews']
  providerDrafts: EditorState['providerDrafts']
  modelCompatViews: EditorState['modelCompatViews']
  modelCompatDrafts: EditorState['modelCompatDrafts']
} {
  const providerViews = providerGatewayCompatViewsFrom(namespace, profile, takeoverResolution)
  const providerDrafts = { ...current.providerDrafts }
  for (const [provider, providerView] of Object.entries(providerViews)) {
    if (current.providerDirty[provider] !== true) providerDrafts[provider] = providerView
  }
  const modelCompatViews = modelGatewayCompatViewsFrom(namespace, inventory, profile, takeoverResolution)
  const modelCompatDrafts = { ...current.modelCompatDrafts }
  for (const item of inventory) {
    const key = keyOf(item)
    const view = modelCompatViews[key]
    if (view === undefined) continue
    const dirty = current.modelCompatDirty[key]
    const draft = modelCompatDrafts[key]
    if (!dirty) {
      modelCompatDrafts[key] = view
      continue
    }
    if (!draft) continue
    // Only the fields this key edited survive the read; the rest come from the
    // fresh view, which is what keeps an untouched field from going stale.
    const preserved = { ...view }
    for (const field of GATEWAY_COMPAT_FIELD_KEYS) {
      if (dirty[field] === true) Object.assign(preserved, { [field]: draft[field] })
    }
    modelCompatDrafts[key] = preserved
  }
  return { providerViews, providerDrafts, modelCompatViews, modelCompatDrafts }
}

/**
 * Project a freshly read `llm-pi-ai` section onto the editor state.
 *
 * `notice` is the success message to surface once the read lands, and
 * `pluginSection` is the descriptor of the plugin's own section from the same
 * `describe` — the two are read together because one description answers both.
 */
export function applyNamespaceView(
  current: EditorState,
  nextNamespace: SettingsNamespace,
  notice: string | null,
  pluginSection: SettingsNamespace | null,
  profile: CompatibilityProfile,
  takeoverResolution: TakeoverRuntimeResolution,
): EditorState {
  const view = subagentView(subagentSection(pluginSection, nextNamespace))
  const nextInventory = inventoryFrom(nextNamespace)
  const compat = compatViewsOf(nextNamespace, nextInventory, profile, takeoverResolution, current)
  // The compaction policy and the subagent route live in the plugin's OWN
  // section, which this call receives separately: the inventory re-read may
  // arrive before that section does on the first load.
  const ownSection = pluginSection ?? current.pluginSection
  return {
    ...current,
    loading: false,
    namespace: nextNamespace,
    busy: false,
    nsFound: true,
    pluginSection,
    inventory: nextInventory,
    ...compat,
    compactionDrafts: compactionDraftsFor(current, compactionPolicyOf(ownSection), nextInventory),
    revision: revisionOf(nextNamespace),
    subagent: view.subagent,
    subagentDraft: view.draft,
    subagentCustom: view.custom,
    subagentModelDraft: subagentModelDraftFor(current, ownSection),
    notice,
  }
}

/**
 * Refresh every view of the plugin's one section from a single descriptor.
 *
 * `subagentEffort` and the OpenCode session fields live in the same section
 * under the 0.1.7 entry-config model, so one write to either returns the
 * descriptor that supersedes what the editor holds for both — and the revision
 * in it is the `expectedRevision` the NEXT write to that section has to send.
 * Revisions are per section there, so a view left on the pre-write copy made the
 * second of any two such writes fail as a conflict. Every write whose response
 * targets this section lands here; `savedKey` names the OpenCode toggle just
 * persisted, whose draft is no longer dirty.
 */
export function applyPluginSectionView(
  current: EditorState,
  section: SettingsNamespace | null,
  notice: string | null,
  savedKey?: string,
): EditorState {
  const previous = openCodeStateOf(current)
  const refreshed = section === null
    ? createOpenCodeSessionState(undefined, current.inventory, previous)
    : applyOpenCodeSessionMutation(previous, { ok: true, value: section }, current.inventory, savedKey)
  const ownSection = section ?? current.pluginSection
  const view = subagentView(subagentSection(section, current.namespace))
  return {
    ...current,
    busy: false,
    pluginSection: section,
    openCodeSessionReads: current.openCodeSessionReads + 1,
    openCodeSessionViews: refreshed.views,
    openCodeSessionDrafts: refreshed.drafts,
    openCodeSessionDirty: refreshed.dirty,
    openCodeSessionFound: refreshed.found,
    openCodeSessionAvailable: refreshed.available,
    compactionDrafts: compactionDraftsFor(current, compactionPolicyOf(ownSection), current.inventory),
    subagent: view.subagent,
    subagentDraft: view.draft,
    subagentCustom: view.custom,
    subagentModelDraft: subagentModelDraftFor(current, ownSection),
    notice,
  }
}

/**
 * Recompute only the compat views and drafts, for a runtime snapshot change
 * that leaves the sections themselves unchanged.
 */
export function reapplyCompatViews(
  current: EditorState,
  profile: CompatibilityProfile,
  takeoverResolution: TakeoverRuntimeResolution,
): EditorState {
  if (current.namespace === null) return current
  const compat = compatViewsOf(current.namespace, current.inventory, profile, takeoverResolution, current)
  return { ...current, ...compat }
}
