import React from 'react'
import { useSyncExternalStore } from 'react'
import { GATEWAY_COMPAT_FIELD_KEYS, partEnabled, type GatewayCompatFieldKey } from '@hytime/dsh-plugin-kit'
import { editableProviderCompatFields } from '@hytime/dsh-plugin-kit'
import { ALL_LEVELS, CONTEXT_1M, DEFAULT_LEVELS, NS, OPENCODE_SESSION_NS, PRESETS } from './constants.js'
import { inventoryFrom } from './model-inventory.js'
import { emptyTakeoverRuntimeResolution } from './takeover-runtime.js'
import { openCodeSessionOp, isOpenCodeSessionNamespace } from './model-header-ops.js'
import { opsForModelArrayCompat, opsForModelCompat, opsForProviderCompat, setOps } from './model-ops.js'
import { isPluginEntrySection, pluginSection, subagentEffortTarget } from './subagent-section.js'
import { buildInput, buildLevels, contextDraftFrom, draftFrom, inputDraftFrom, modelSaveBlockedReason, validateContextWindow } from './validation.js'
import {
  availableCompatFieldCount,
  clearModelEditorState,
  clearOpenCodeSessionState,
  initialState,
  keyOf,
  rebaseItem,
  rebaseUpdates,
  removeDirtyFields,
  type EditorState,
} from './section-editor/state.js'
import { applyNamespaceView, applyPluginSectionView, reapplyCompatViews } from './section-editor/views.js'
import { subagentEffortOp } from './section-editor/subagent.js'
import { checkCompactionDraft, compactionOps, compactionProblemText } from './compaction-section.js'
import { formatRatioPercent } from '@hytime/dsh-plugin-kit'
import { compactionDraftFrom, compactionPolicyOf, keyOf as keyOfState } from './section-editor/state.js'
import { PLUGIN_VERSION } from '@hytime/dsh-plugin-kit'
import type { CompactionDraft, SubagentModelRoute } from './section-editor/state.js'
import type { ComponentKey, ComponentSwitchState, ComponentSwitchStore } from '@hytime/dsh-plugin-kit'

/**
 * Stable fallbacks for a mount without a store.
 *
 * `useSyncExternalStore` resubscribes when either callback changes identity, so
 * inline closures would tear down and rebuild the subscription on every render.
 */
const NO_SUBSCRIBE = (): (() => void) => () => undefined
const NO_SNAPSHOT = (): Record<ComponentKey, ComponentSwitchState> | undefined => undefined
import type { ModelCompactionControls } from './components/ModelEditor.js'
import type { SubagentModelPicker } from './components/SubagentSettings.js'
import { useSaveQueue, type SaveRequest } from './section-editor/use-save-queue.js'
import { revisionOf } from '@hytime/dsh-plugin-kit'
import type { ClientLocale, DraftCell, InventoryItem, GatewayCompatEditability, ModelCompatDirtyFields, ModelGatewayCompatUpdate, ModelUpdate, ProviderGatewayCompatUpdate, ProviderGatewayCompatView, SettingsApi, SettingsNamespace, SettingsOp, Translation } from '@hytime/dsh-plugin-kit'
import type { Palette } from './theme.js'
import type { TakeoverRuntimeStore } from './takeover-runtime.js'
import { iosPalette } from './theme.js'
import { ActionButton, Icon, SwitchControl } from './components/Controls.js'
import css from './settings.module.css'
import { ModelRow } from './components/ModelRow.js'
import { SubagentSettings } from './components/SubagentSettings.js'
import { ConfigBackupCard } from './components/ConfigBackupCard.js'
import { OpenCodeFormatCard } from './components/OpenCodeFormatCard.js'
import { renderGatewayCompatControls } from './components/GatewayCompatControls.js'



// How long the success badge floats in the panel's top-right before it fades
// on its own. Every field edit clears the notice (they set notice: null), so a
// later save re-shows it and restarts this countdown.
const NOTICE_DISMISS_MS = 3000

const noRuntimeSubscribe = (): (() => void) => () => undefined
const noRuntimeSnapshot = (): typeof emptyTakeoverRuntimeResolution => emptyTakeoverRuntimeResolution

export interface SectionEditorProps {
  readonly settings: SettingsApi
  readonly locale: ClientLocale
  readonly t: Translation
  readonly palette?: Palette
  readonly takeoverRuntime?: TakeoverRuntimeStore
  /**
   * Which of the bundle's other components are switched on.
   *
   * Each card this page renders belongs to a separate Loader row, so a row the
   * profile disabled must not render its card — the control would still look
   * live while the host half that acts on it is not mounted. This is a STORE
   * rather than a snapshot because the page stays mounted across a toggle in
   * the plugin page: reading it per render is what makes the change appear
   * without a refresh. Absent means an older caller, which renders everything.
   */
  readonly switches?: ComponentSwitchStore
  /** Re-read the switches when the user returns to Settings. */
  readonly onMounted?: () => void
}

// The OpenCode session helpers and the state shape live in `section-editor/`;
// they are re-exported from here because that is where callers already import
// them from, and the split must not move a public entry point.
export { applyOpenCodeSessionMutation, createOpenCodeSessionState, saveOpenCodeSession } from './section-editor/open-code-session.js'
export type { OpenCodeSessionState } from '@hytime/dsh-plugin-kit'
export function SectionEditor({ settings, locale, t, palette = iosPalette(), takeoverRuntime, switches, onMounted }: SectionEditorProps): React.ReactElement {
  // Subscribed rather than read once: a row toggled in the plugin page has to
  // take effect on the panel that is already open.
  const switchSnapshot = useSyncExternalStore(
    switches?.subscribe ?? NO_SUBSCRIBE,
    switches?.getSnapshot ?? NO_SNAPSHOT,
    switches?.getSnapshot ?? NO_SNAPSHOT,
  )
  // The panel's own row first: with `thinking-effort-settings` off there is no
  // page to render at all, and every card below it is unreachable anyway.
  const settingsOn = switchSnapshot === undefined || partEnabled(switchSnapshot, 'settings')
  const opencodeOn = switchSnapshot === undefined || partEnabled(switchSnapshot, 'opencode')
  const compactionOn = switchSnapshot === undefined || partEnabled(switchSnapshot, 'compaction')
  const migrationOn = switchSnapshot === undefined || partEnabled(switchSnapshot, 'migration')
  const subagentOn = switchSnapshot === undefined || partEnabled(switchSnapshot, 'subagent')
  const [state, setState] = React.useState<EditorState>(initialState)
  const takeoverResolution = React.useSyncExternalStore(
    takeoverRuntime?.subscribe ?? noRuntimeSubscribe,
    takeoverRuntime?.getSnapshot ?? noRuntimeSnapshot,
    takeoverRuntime?.getSnapshot ?? noRuntimeSnapshot,
  )

  /**
   * Refresh every view of the plugin's one section from a single descriptor.
   *
   * `subagentEffort` and the OpenCode session fields live in the same section
   * under the 0.1.7 entry-config model, so one write to either returns the
   * descriptor that supersedes what the editor holds for both — and the
   * revision in it is the `expectedRevision` the NEXT write to that section has
   * to send. Revisions are per section there, so a view left on the pre-write
   * copy made the second of any two such writes fail as a conflict. Every write
   * whose response targets this section lands here; `savedKey` names the
   * OpenCode toggle just persisted, whose draft is no longer dirty.
   */
  /**
   * Re-read every section this editor renders through one `describe`.
   *
   * `notice` is the success message to surface once the re-read lands. The
   * default `null` is what the mount-time and card-triggered calls want (they
   * are reads, not saves); the `configForms` write branch passes its
   * `successMessage` because that transport carries no response body to project
   * and would otherwise lose the "saved" notice the legacy path shows.
   */
  const load = (notice: string | null = null): void => {
    // Only the first read — before any inventory is on screen — swaps the page
    // for the loading placeholder. A save refreshes through here too, and
    // collapsing a populated list to one line shrinks the document height, which
    // is what yanked the panel back to the top (losing the user's scroll and the
    // row they had just edited) on every save. Keeping the current list mounted
    // while the re-read is in flight preserves that position.
    setState((current) => ({ ...current, loading: current.inventory.length === 0, error: null }))
    settings.describe().then((response) => {
      if (!response.ok) {
        setState((current) => ({ ...current, loading: false, busy: false, error: response.error.message }))
        return
      }
      const found = response.value.namespaces.find((entry) => entry.ns === NS)
      // One description answers both questions: which section this plugin's
      // settings live in, and the id that section carries under whichever model
      // the host exposes. The legacy `dsh-thinking-effort` namespace no longer
      // exists under 0.1.7, where every plugin setting lives in the entry
      // section, so the resolved section supersedes the id-specific lookup.
      const plugin = pluginSection(response.value.namespaces) ?? null
      if (!found) {
        setState((current) => {
          const next = { ...current, loading: false, busy: false, nsFound: false, namespace: null, inventory: [], providerViews: {}, providerDrafts: {}, providerDirty: {}, providerCompatDirty: {}, providerCompatExpanded: {}, modelCompatViews: {}, modelCompatDrafts: {}, modelCompatDirty: {}, modelCompatExpanded: {}, subagent: null }
          return applyPluginSectionView(next, plugin, notice)
        })
        return
      }
      setState((current) => applyPluginSectionView(
        applyNamespaceView(current, found, notice, plugin, settings.compatibilityProfile, takeoverResolution),
        plugin,
        notice,
      ))
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setState((current) => ({ ...current, loading: false, busy: false, error: t('readSettingsFailed', { message }) }))
    })
  }

  React.useEffect(() => { load() }, [])

  React.useEffect(() => { onMounted?.() }, [onMounted])

  React.useEffect(() => {
    setState((current) => reapplyCompatViews(current, settings.compatibilityProfile, takeoverResolution))
  }, [takeoverResolution])

  React.useEffect(() => {
    if (state.notice === null) return undefined
    const timer = setTimeout(() => {
      setState((current) => (current.notice === null ? current : { ...current, notice: null }))
    }, NOTICE_DISMISS_MS)
  return () => clearTimeout(timer)
  }, [state.notice])

  // Every save goes through the write queue in `section-editor/use-save-queue`;
  // it owns the two transports, the conflict retry and the error split, none of
  // which belongs in the component that renders rows.
  const runOps = useSaveQueue({
    settings,
    t,
    onAccepted: (request: SaveRequest, value: SettingsNamespace) => setState((current) => {
      if (request.ns === NS) return applyNamespaceView(current, value, request.successMessage, current.pluginSection, settings.compatibilityProfile, takeoverResolution)
      // Every other accepted write targets the plugin's own section, so its
      // response refreshes the OpenCode view and the subagent view together.
      if (request.entrySectionWrite === true) return applyPluginSectionView(current, value, request.successMessage)
      return applyPluginSectionView(current, value, request.successMessage, request.openCodeSessionSavedKey)
    }),
    reload: (notice: string) => load(notice),
    setBusy: () => setState((current) => ({ ...current, busy: true, error: null, notice: null })),
    setError: (message: string) => setState((current) => ({ ...current, busy: false, error: message })),
  })

  const applyModel = (item: InventoryItem): void => {
    const key = keyOf(item)
    const levels = buildLevels(state.drafts[key] ?? {})
    const contextDraft = state.contextDrafts[key] ?? contextDraftFrom(item)
    const inputDraft = state.inputDrafts[key] ?? inputDraftFrom(item)
    // One shared predicate decides both this refusal and the Save button's
    // disabled state, so the two can never disagree about what is savable.
    const blocked = modelSaveBlockedReason(levels, contextDraft, inputDraft, t)
    if (blocked !== null) { setState((current) => ({ ...current, error: blocked })); return }
    const context = contextDraft.touched ? validateContextWindow(contextDraft, t) : { value: undefined }
    const input = inputDraft.touched ? buildInput(inputDraft, t) : { value: undefined }
    const update: ModelUpdate = { item, levels, contextWindow: context.value, contextWindowTouched: contextDraft.touched, input: input.value, inputTouched: inputDraft.touched }
    runOps({
      ns: NS,
      revision: state.revision,
      ops: setOps(state.inventory, [update]),
      // Whole-array write: rebuild from the fresh inventory so a concurrent
      // sibling edit or added model survives the retry.
      rebuildOps: (fresh) => {
        const inventory = inventoryFrom(fresh)
        return setOps(inventory, rebaseUpdates(inventory, [update]))
      },
      successMessage: t('modelSettingsSaved'),
      onSuccess: () => {
        // Normalize the context field to the integer that was actually stored:
        // a `32k` entry would otherwise keep echoing the typed form, which no
        // longer matches the row's canonical value. `1M` mode renders from the
        // toggle, so its draft is left alone.
        setState((current) => {
          const base = current.contextDrafts[key] ?? contextDraftFrom(item)
          const draft = contextDraft.touched && context.value !== undefined && contextDraft.oneMillion !== true
            ? { ...base, value: String(context.value), previousValue: String(context.value) }
            : current.contextDrafts[key]
          return {
            ...current,
            dirty: removeDirtyFields(current.dirty, key, ['levels', 'context', 'input']),
            contextDrafts: draft === undefined ? current.contextDrafts : { ...current.contextDrafts, [key]: draft },
          }
        })
      },
    })
  }

  const applyModelCompat = (item: InventoryItem): void => {
    const key = keyOf(item)
    const draft = state.modelCompatDrafts[key]
    const current = state.modelCompatViews[key]
    const dirty = state.modelCompatDirty[key]
    if (!draft || !current || !dirty) return
    const update: Partial<ModelGatewayCompatUpdate> = {}
    for (const field of GATEWAY_COMPAT_FIELD_KEYS) {
      if (dirty[field] === true && draft[field] !== current[field]) Object.assign(update, { [field]: draft[field] })
    }
    const editability = editableProviderCompatFields(settings.compatibilityProfile, state.namespace?.schema)
    const ops = item.inOverrides
      ? opsForModelCompat(item, update, editability)
      : opsForModelArrayCompat(state.inventory, item, update, editability)
    // An override writes leaf compat paths; a `models[]` entry rewrites the
    // whole array, so only that branch has to be rebuilt from fresh data.
    const rebuildOps = (fresh: SettingsNamespace): readonly SettingsOp[] => {
      if (!item.inOverrides) {
        const inventory = inventoryFrom(fresh)
        const rebased = rebaseItem(inventory, item)
        return rebased === undefined ? [] : opsForModelArrayCompat(inventory, rebased, update, editableProviderCompatFields(settings.compatibilityProfile, fresh.schema))
      }
      return opsForModelCompat(item, update, editableProviderCompatFields(settings.compatibilityProfile, fresh.schema))
    }
    if (ops.length === 0) {
      setState((currentState) => ({ ...currentState, modelCompatDirty: removeDirtyFields(currentState.modelCompatDirty, key, GATEWAY_COMPAT_FIELD_KEYS) }))
      return
    }
    runOps({
      ns: NS,
      revision: state.revision,
      ops,
      rebuildOps,
      successMessage: t('modelGatewayCompatSaved'),
      onSuccess: () => {
        setState((currentState) => ({ ...currentState, modelCompatDirty: removeDirtyFields(currentState.modelCompatDirty, key, GATEWAY_COMPAT_FIELD_KEYS) }))
      },
    })
  }

  const patchModelCompat = (item: InventoryItem, next: Partial<ModelGatewayCompatUpdate>): void => {
    const key = keyOf(item)
    setState((current) => {
      const draft = current.modelCompatDrafts[key] ?? current.modelCompatViews[key]
      if (!draft) return current
      const modelCompatDrafts = { ...current.modelCompatDrafts, [key]: { ...draft, ...next } }
      const nextDirty: ModelCompatDirtyFields = { ...current.modelCompatDirty[key] }
      for (const field of GATEWAY_COMPAT_FIELD_KEYS) {
        if (Object.prototype.hasOwnProperty.call(next, field)) Object.assign(nextDirty, { [field]: true })
      }
      const modelCompatDirty = { ...current.modelCompatDirty, [key]: nextDirty }
      return { ...current, notice: null, modelCompatDrafts, modelCompatDirty }
    })
  }

  const patchOpenCodeSession = (item: InventoryItem, enabled: boolean): void => {
    const key = keyOf(item)
    const namespace = state.pluginSection
    // The section the switch writes is the plugin's own; it is only addressable
    // when it carries a readable OpenCode session view, which is also what the
    // switch's availability is rendered from.
    if (namespace === null || !isOpenCodeSessionNamespace(namespace)) return
    const operation = openCodeSessionOp(item.route, item.model, enabled)
    if (operation === undefined) return
    // The switch saves immediately: the draft reflects the newly toggled value
    // right away, and the mutation persists it to the plugin namespace.
    setState((current) => ({
      ...current,
      notice: null,
      openCodeSessionDrafts: { ...current.openCodeSessionDrafts, [key]: enabled },
    }))
    runOps({
      ns: namespace.ns,
      revision: namespace.revision,
      ops: [operation],
      // Leaf write: the path addresses one model's flag, so replaying it lands
      // on whatever the document now holds.
      rebuildOps: () => [operation],
      successMessage: t('opencodeSessionSaved'),
      openCodeSessionSavedKey: key,
    })
  }

  const closeModelEditor = (item: InventoryItem): void => {
    const key = keyOf(item)
    setState((current) => clearModelEditorState(current, key))
  }

  const restoreReasoningDefaults = (item: InventoryItem): void => {
    const key = keyOf(item)
    runOps({
      ns: NS,
      revision: state.revision,
      ops: setOps(state.inventory, [{ item, levels: DEFAULT_LEVELS }]),
      rebuildOps: (fresh) => {
        const inventory = inventoryFrom(fresh)
        return setOps(inventory, rebaseUpdates(inventory, [{ item, levels: DEFAULT_LEVELS }]))
      },
      successMessage: t('restoreReasoning'),
      onSuccess: () => {
        setState((current) => ({ ...current, drafts: current.drafts[key] ? { ...current.drafts, [key]: draftFrom(DEFAULT_LEVELS) } : current.drafts, dirty: removeDirtyFields(current.dirty, key, ['levels']) }))
      },
    })
  }

  const restoreProviderDefaults = (item: InventoryItem): void => {
    runOps({
      ns: NS,
      revision: state.revision,
      ops: setOps(state.inventory, [{ item, contextWindow: undefined, contextWindowTouched: true, input: undefined, inputTouched: true }]),
      rebuildOps: (fresh) => {
        const inventory = inventoryFrom(fresh)
        const updates: ModelUpdate[] = [{ item, contextWindow: undefined, contextWindowTouched: true, input: undefined, inputTouched: true }]
        return setOps(inventory, rebaseUpdates(inventory, updates))
      },
      successMessage: t('restoreCapability'),
      onSuccess: () => closeModelEditor(item),
    })
  }

  const applyPreset = (levels: typeof PRESETS[number]['levels']): void => {
    runOps({
      ns: NS,
      revision: state.revision,
      ops: setOps(state.inventory, state.inventory.map((item): ModelUpdate => ({ item, levels }))),
      // Rebuilt from the fresh inventory, so a model another writer added keeps
      // its own settings instead of being dropped with the stale array.
      rebuildOps: (fresh) => {
        const inventory = inventoryFrom(fresh)
        const updates = inventory.map((item): ModelUpdate => ({ item, levels }))
        return setOps(inventory, updates)
      },
      successMessage: t('settingsUpdated'),
      onSuccess: () => {
        setState((current) => {
          let dirty = current.dirty
          const drafts = { ...current.drafts }
          current.inventory.forEach((item) => { const key = keyOf(item); if (drafts[key]) drafts[key] = draftFrom(levels); dirty = removeDirtyFields(dirty, key, ['levels']) })
          return { ...current, drafts, dirty }
        })
      },
    })
  }

  const applySubagentEffort = (): void => {
    const op = subagentEffortOp(state.subagentDraft, state.subagentCustom)
    if (op === undefined) { setState((current) => ({ ...current, notice: null, error: t('customEffortRequired') })); return }
    const ops: SettingsOp[] = [op]
    const target = subagentEffortTarget(isPluginEntrySection(state.pluginSection) ? state.pluginSection : null, state.revision)
    runOps({
      ns: target.ns,
      revision: target.revision,
      ops,
      rebuildOps: () => ops,
      successMessage: t('subagentSaved'),
      entrySectionWrite: target.ownSection,
    })
  }

  const applyAutoFillDefaults = (enabled: boolean): void => {
    const section = state.pluginSection
    if (section === null) return
    const ops: SettingsOp[] = [{ op: 'set', path: ['autoFillDefaults'], value: enabled }]
    runOps({
      ns: section.ns,
      revision: revisionOf(section),
      ops,
      rebuildOps: () => ops,
      successMessage: t('settingsUpdated'),
      entrySectionWrite: true,
    })
  }

  /**
   * Persist one model's compaction override.
   *
   * The policy leaf is a DIFFERENT settings path from the model array the rest
   * of this editor rewrites, so it takes its own mutation rather than riding
   * `setOps`: rebuilding `providers[route].models` from this panel's inventory
   * to change a ratio would write a stale container. A leaf write replays
   * verbatim, which is what `rebuildOps: () => ops` claims.
   */
  const applyModelCompaction = (item: InventoryItem, pending?: CompactionDraft): void => {
    const section = state.pluginSection
    if (section === null) return
    const key = keyOf(item)
    const policy = compactionPolicyOf(section)
    const draft = pending ?? state.compactionDrafts[key] ?? compactionDraftFrom(policy, item.route, item.model)
    const check = checkCompactionDraft(policy, item.route, item.model, draft)
    if (!check.ok) {
      setState((current) => ({ ...current, notice: null, error: compactionProblemText(check.problem, t) }))
      return
    }
    const ops = compactionOps(item.route, item.model, check)
    runOps({
      ns: section.ns,
      revision: revisionOf(section),
      ops,
      rebuildOps: () => ops,
      successMessage: t('compactionSaved'),
      entrySectionWrite: true,
      onSuccess: () => {
        setState((current) => ({ ...current, compactionDrafts: { ...current.compactionDrafts, [key]: { ...draft, touched: false } } }))
      },
    })
  }

  const patchCompactionDraft = (item: InventoryItem, patch: Partial<Pick<CompactionDraft, 'threshold' | 'retain'>>): void => {
    const key = keyOf(item)
    setState((current) => {
      const policy = compactionPolicyOf(current.pluginSection)
      const draft = current.compactionDrafts[key] ?? compactionDraftFrom(policy, item.route, item.model)
      return { ...current, notice: null, compactionDrafts: { ...current.compactionDrafts, [key]: { ...draft, ...patch, touched: true } } }
    })
  }

  /**
   * Persist the subagent default route.
   *
   * Both halves are written in ONE batch because a provider without a model
   * names no route: persisting them separately would leave a half-configured
   * pair visible to the Host in between. Clearing unsets both fields rather
   * than writing empty strings — the schema treats `''` as unset either way, but
   * an `unset` leaves no residue in the user document, which is what lets the
   * shipped inheritance default own the value.
   */
  const applySubagentModel = (): void => {
    const draft = state.subagentModelDraft
    const provider = draft.provider.trim()
    const model = draft.model.trim()
    const clearing = provider.length === 0 || model.length === 0
    const ops: SettingsOp[] = clearing
      ? [{ op: 'unset', path: ['subagentModel', 'provider'] }, { op: 'unset', path: ['subagentModel', 'model'] }]
      : [{ op: 'set', path: ['subagentModel', 'provider'], value: provider }, { op: 'set', path: ['subagentModel', 'model'], value: model }]
    const section = state.pluginSection
    if (section === null) return
    runOps({
      ns: section.ns,
      revision: revisionOf(section),
      ops,
      // Two leaf writes that name their exact paths, so replaying them lands on
      // whatever the document now holds.
      rebuildOps: () => ops,
      successMessage: t('subagentModelSaved'),
      entrySectionWrite: true,
      onSuccess: () => {
        setState((current) => ({
          ...current,
          subagentModelDraft: clearing
            ? { provider: '', model: '', touched: false }
            : { provider, model, touched: false },
        }))
      },
    })
  }

  const applyProviderCompat = (route: string): void => {
    const draft = state.providerDrafts[route]
    const current = state.providerViews[route]
    const dirtyFields = state.providerCompatDirty[route]
    if (!draft || !current) return
    const update: Partial<ProviderGatewayCompatUpdate> = {}
    for (const field of GATEWAY_COMPAT_FIELD_KEYS) {
      if (dirtyFields?.[field] === true && draft[field] !== current[field]) Object.assign(update, { [field]: draft[field] })
    }
    const ops = opsForProviderCompat(route, update, editableProviderCompatFields(settings.compatibilityProfile, state.namespace?.schema) as Partial<Pick<GatewayCompatEditability, GatewayCompatFieldKey>>)
    const clearProviderDirty = (currentState: EditorState): EditorState => {
      const providerDirty = { ...currentState.providerDirty }
      delete providerDirty[route]
      const providerCompatDirty = { ...currentState.providerCompatDirty }
      delete providerCompatDirty[route]
      return { ...currentState, providerDirty, providerCompatDirty }
    }
    if (ops.length === 0) {
      setState((currentState) => clearProviderDirty(currentState))
      return
    }
    runOps({
      ns: NS,
      revision: state.revision,
      ops,
      rebuildOps: () => ops,
      successMessage: t('gatewayCompatSaved'),
      onSuccess: () => {
        setState((currentState) => clearProviderDirty(currentState))
      },
    })
  }

  const patchProviderCompat = (route: string, next: ProviderGatewayCompatView): void => {
    setState((current) => {
      const draft = current.providerDrafts[route] ?? current.providerViews[route]
      if (!draft) return { ...current, notice: null, providerDrafts: { ...current.providerDrafts, [route]: next }, providerDirty: { ...current.providerDirty, [route]: true } }
      const keysChanged = GATEWAY_COMPAT_FIELD_KEYS.filter((key) => next[key] !== draft[key])
      const nextDirtyFields: Partial<Record<GatewayCompatFieldKey, boolean>> = { ...current.providerCompatDirty[route] }
      for (const field of keysChanged) Object.assign(nextDirtyFields, { [field]: true })
      return {
        ...current,
        notice: null,
        providerDrafts: { ...current.providerDrafts, [route]: next },
        providerCompatDirty: { ...current.providerCompatDirty, [route]: nextDirtyFields },
        providerDirty: { ...current.providerDirty, [route]: true },
      }
    })
  }

  const toggleProviderCompatExpanded = (route: string): void => setState((current) => ({ ...current, providerCompatExpanded: { ...current.providerCompatExpanded, [route]: current.providerCompatExpanded[route] !== true } }))
  const toggleModelCompatExpanded = (key: string): void => setState((current) => ({ ...current, modelCompatExpanded: { ...current.modelCompatExpanded, [key]: current.modelCompatExpanded[key] !== true } }))
  const toggleProvider = (route: string): void => setState((current) => ({ ...current, expandedProviders: { ...current.expandedProviders, [route]: current.expandedProviders[route] !== true } }))
  const toggleExpand = (item: InventoryItem): void => {
    const key = keyOf(item)
    setState((current) => {
      if (current.expanded[key]) {
        const expanded = { ...current.expanded }; delete expanded[key]
        return { ...clearOpenCodeSessionState(current, key), expanded }
      }
      return { ...current, expanded: { ...current.expanded, [key]: true }, drafts: current.drafts[key] ? current.drafts : { ...current.drafts, [key]: draftFrom(item.levels) }, contextDrafts: current.contextDrafts[key] ? current.contextDrafts : { ...current.contextDrafts, [key]: contextDraftFrom(item) }, inputDrafts: current.inputDrafts[key] ? current.inputDrafts : { ...current.inputDrafts, [key]: inputDraftFrom(item) } }
    })
  }
  const patchDraft = (item: InventoryItem, level: typeof ALL_LEVELS[number], patch: Partial<DraftCell>): void => {
    const key = keyOf(item)
    setState((current) => {
      const cell = { ...(current.drafts[key]?.[level] ?? { on: false, wire: '' }), ...patch }
      if (level !== 'off' && patch.on === true && cell.wire.trim() === '') cell.wire = level
      return { ...current, notice: null, dirty: { ...current.dirty, [key]: { ...current.dirty[key], levels: true } }, drafts: { ...current.drafts, [key]: { ...current.drafts[key], [level]: cell } } }
    })
  }
  const patchContextValue = (item: InventoryItem, value: string): void => {
    const key = keyOf(item)
    setState((current) => { const draft = current.contextDrafts[key] ?? contextDraftFrom(item); return { ...current, notice: null, dirty: { ...current.dirty, [key]: { ...current.dirty[key], context: true } }, contextDrafts: { ...current.contextDrafts, [key]: { ...draft, value, previousValue: value, oneMillion: false, touched: true } } } })
  }
  const setOneMillion = (item: InventoryItem, enabled: boolean): void => {
    const key = keyOf(item)
    setState((current) => { const draft = current.contextDrafts[key] ?? contextDraftFrom(item); const previous = enabled ? (draft.oneMillion ? draft.previousValue : draft.value) : draft.previousValue; return { ...current, notice: null, dirty: { ...current.dirty, [key]: { ...current.dirty[key], context: true } }, contextDrafts: { ...current.contextDrafts, [key]: { ...draft, oneMillion: enabled, previousValue: previous || '', value: enabled ? String(CONTEXT_1M) : previous || '', touched: true } } } })
  }
  const patchInputCapability = (item: InventoryItem, modality: 'text' | 'image', enabled: boolean): void => {
    const key = keyOf(item)
    setState((current) => { const draft = current.inputDrafts[key] ?? inputDraftFrom(item); const other = modality === 'text' ? 'image' : 'text'; if (!enabled && !draft[other]) return { ...current, notice: null, error: t('inputCapabilityMinimum') }; return { ...current, error: null, notice: null, dirty: { ...current.dirty, [key]: { ...current.dirty[key], input: true } }, inputDrafts: { ...current.inputDrafts, [key]: { ...draft, [modality]: enabled, touched: true } } } })
  }

  const query = state.query.trim().toLowerCase()
  const visible = query === '' ? state.inventory : state.inventory.filter((item) => item.model.toLowerCase().includes(query) || item.name.toLowerCase().includes(query))
  const routes = [...new Set(visible.map((item) => item.route))]
  const expandedCount = visible.filter((item) => state.expanded[keyOf(item)] && (query !== '' || state.expandedProviders[item.route])).length
  const snapshot = locale.getSnapshot?.() ?? {}
  const available = new Set(snapshot.locales?.map((entry) => entry.id).filter((id): id is string => typeof id === 'string') ?? ['zh', 'en', 'ja', 'ko'])
  const languageOptions: Array<[string, string]> = [['zh', 'languageChinese'], ['en', 'languageEnglish'], ['ja', 'languageJapanese'], ['ko', 'languageKorean']]

    // The plugin's own section is the only place a compaction override or a
  // subagent route can live, so both blocks disappear while it is unread.
  const compactionPolicy = compactionPolicyOf(state.pluginSection)
  const compactionPlaceholders = {
    threshold: t('compactionFollowGlobal', { percent: formatRatioPercent(compactionPolicy.thresholdRatio) }),
    retain: t('compactionFollowGlobal', { percent: formatRatioPercent(compactionPolicy.retainRatio) }),
  }
  const compactionControlsFor = (item: InventoryItem): ModelCompactionControls | undefined => {
    // No compaction row means no host pass, so the card would offer ratios that
    // nothing reads.
    if (!compactionOn) return undefined
    if (state.pluginSection === null) return undefined
    const key = keyOf(item)
    const draft = state.compactionDrafts[key] ?? compactionDraftFrom(compactionPolicy, item.route, item.model)
    const check = checkCompactionDraft(compactionPolicy, item.route, item.model, draft)
    return {
      draft,
      thresholdPlaceholder: compactionPlaceholders.threshold,
      retainPlaceholder: compactionPlaceholders.retain,
      problem: check.ok ? null : compactionProblemText(check.problem, t),
      onThresholdChange: (value) => patchCompactionDraft(item, { threshold: value }),
      onRetainChange: (value) => patchCompactionDraft(item, { retain: value }),
      // The idle timer fires this with no argument, so the draft is read at
      // commit time from the state the fields are rendering.
      onCommit: () => applyModelCompaction(item),
    }
  }

  const subagentModelRoutes: SubagentModelRoute[] = React.useMemo(() => {
    const byProvider = new Map<string, string[]>()
    for (const item of state.inventory) {
      const models = byProvider.get(item.route)
      if (models === undefined) byProvider.set(item.route, [item.model])
      else if (!models.includes(item.model)) models.push(item.model)
    }
    return [...byProvider].map(([provider, models]) => ({ provider, models })).sort((a, b) => a.provider.localeCompare(b.provider))
  }, [state.inventory])

  const subagentModelPicker: SubagentModelPicker = {
    draft: state.subagentModelDraft,
    routes: subagentModelRoutes,
    // The saved pair is unavailable when the inventory no longer carries it —
    // the model was renamed or removed. The control still shows it so the panel
    // never claims "inherit" for a route the Host would actually apply.
    savedUnavailable: state.subagentModelDraft.provider.length > 0
      && state.subagentModelDraft.model.length > 0
      && !subagentModelRoutes.some((route) => route.provider === state.subagentModelDraft.provider && route.models.includes(state.subagentModelDraft.model)),
    onProviderChange: (provider) => setState((current) => ({ ...current, notice: null, subagentModelDraft: { ...current.subagentModelDraft, provider, touched: true } })),
    onModelChange: (model) => setState((current) => ({ ...current, notice: null, subagentModelDraft: { ...current.subagentModelDraft, model, touched: true } })),
    // Fired by the picker's idle timer, which reads the pair at commit time.
    onCommit: applySubagentModel,
  }

  // Placed after every hook so the order cannot change when the switch flips
  // while this panel is mounted.
  if (!settingsOn) return <></>

  return <div className={css.settingsRoot} style={{ color: palette.text, fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif' }}>
    {state.notice ? <div style={{ position: 'sticky', top: '8px', zIndex: 20, height: 0, pointerEvents: 'none' }}><div role="status" aria-live="polite" style={{ position: 'absolute', right: '8px', top: 0, pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px', maxWidth: 'calc(100% - 16px)', padding: '6px 10px', border: `1px solid ${palette.accentBorder}`, borderRadius: '8px', color: palette.accent, backgroundColor: palette.accentSoft, boxShadow: palette.shadow, fontSize: '12px', lineHeight: '16px', fontWeight: 650 }}><Icon name="check" size={13} />{state.notice}</div></div> : null}
    <label className={css.controlRowEnd} style={{ fontSize: '12px', marginBottom: '4px' }}>{t('languageLabel')}<select value={snapshot.active} onChange={(event) => locale.setLocale?.(event.currentTarget.value)} style={{ height: '26px', padding: '0 7px', border: `1px solid ${palette.border}`, borderRadius: '7px', backgroundColor: palette.field, color: palette.text, fontSize: '12px' }}>{languageOptions.map(([id, key]) => available.has(id) ? <option key={id} value={id}>{t(key)}</option> : null)}</select></label>
    <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '8px', rowGap: '4px', fontSize: '18px', lineHeight: '24px', fontWeight: 700, letterSpacing: 0, margin: '0 0 7px' }}><Icon name="sliders" size={19} /><span>{t('pageTitle')}</span></h3>
    {state.error ? <div role="alert" aria-live="assertive" style={{ fontSize: '12px', lineHeight: '18px', color: palette.danger, backgroundColor: palette.dangerBg, border: `1px solid ${palette.dangerBorder}`, borderRadius: '8px', padding: '6px 8px', margin: '0 0 8px' }}>{state.error}</div> : null}
    <div data-scope="auto-fill-defaults" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '8px', marginBottom: '8px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.group, boxShadow: palette.shadow }}>
      <div style={{ display: 'grid', gap: '2px' }}><span style={{ fontSize: '13px', fontWeight: 700 }}>{t('autoFillDefaultsTitle')}</span><span style={{ fontSize: '12px', color: palette.secondary }}>{t('autoFillDefaultsDescription')}</span></div>
      <SwitchControl checked={state.pluginSection?.value.autoFillDefaults !== false} disabled={state.busy || state.pluginSection === null} label={t('autoFillDefaultsTitle')} palette={palette} onChange={applyAutoFillDefaults} />
    </div>
    {subagentOn ? <SubagentSettings effort={state.subagent?.effort ?? null} namespaceFound={state.subagent !== null} draft={state.subagentDraft} custom={state.subagentCustom} busy={state.busy} palette={palette} t={t} onDraftChange={(value) => setState((current) => ({ ...current, notice: null, subagentDraft: value }))} onCustomChange={(value) => setState((current) => ({ ...current, notice: null, subagentCustom: value }))} onSave={applySubagentEffort} modelPicker={subagentModelPicker} /> : null}
    <ConfigBackupCard migrationEnabled={migrationOn} settings={settings} palette={palette} t={t} onApplied={load} />
    {opencodeOn ? <OpenCodeFormatCard settings={settings} palette={palette} t={t} revision={state.openCodeSessionReads} namespace={state.pluginSection?.ns ?? OPENCODE_SESSION_NS} onApplied={load} /> : null}
    {state.nsFound === false ? <p style={{ fontSize: '12px', opacity: 0.75 }}>{t('noNamespace')}</p> : <div>
      <div className={css.controlRow} style={{ marginBottom: state.quickSettingsOpen ? '4px' : '6px' }}><ActionButton text={t('quickSettings')} onClick={() => setState((current) => ({ ...current, quickSettingsOpen: !current.quickSettingsOpen }))} disabled={state.busy} palette={palette} icon={state.quickSettingsOpen ? 'chevronUp' : 'sliders'} />{state.quickSettingsOpen ? <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flexBasis: '100%', padding: '4px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.field }}>{PRESETS.map((preset) => <ActionButton key={preset.key} text={t(preset.labelKey)} onClick={() => { setState((current) => ({ ...current, quickSettingsOpen: false })); applyPreset(preset.levels) }} disabled={state.busy} palette={palette} icon={preset.key === 'official' ? 'sparkles' : 'sliders'} />)}</div> : null}</div>
      <div style={{ position: 'relative', marginBottom: '7px' }}><span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: palette.secondary, pointerEvents: 'none' }}><Icon name="search" size={15} /></span><input type="text" value={state.query} placeholder={t('searchPlaceholder')} onChange={(event) => { const value = event.currentTarget.value; setState((current) => ({ ...current, query: value })) }} style={{ boxSizing: 'border-box', width: '100%', height: '30px', padding: '0 10px 0 30px', border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '13px', backgroundColor: palette.field, color: palette.text, outline: 'none', boxShadow: palette.shadow }} /></div>
      {state.loading ? <div style={{ fontSize: '12px', opacity: 0.7 }}>{t('loading')}</div> : visible.length === 0 ? <div style={{ fontSize: '12px', opacity: 0.7 }}>{state.inventory.length === 0 ? t('noModels') : t('noMatches')}</div> :
         routes.map((route) => { const providerModels = visible.filter((item) => item.route === route); const providerOpen = query !== '' || state.expandedProviders[route] === true; return <div key={route} style={{ marginBottom: '6px' }}><div className={css.entityHeader} style={{ minHeight: '32px', padding: '4px 6px', marginBottom: '4px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.raised }}><span style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', minWidth: '22px', border: `1px solid ${palette.border}`, borderRadius: '7px', color: palette.secondary, backgroundColor: palette.group }}><Icon name="layers" size={14} /></span><span style={{ display: 'grid', gap: '1px', minWidth: 0 }}><span style={{ color: palette.text, fontSize: '12px', fontWeight: 700, overflowWrap: 'anywhere' }}>{route}</span><span style={{ color: palette.accent, fontSize: '10px', lineHeight: '11px', fontWeight: 700 }}>{t('vendor')}</span></span></span><span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: palette.secondary, whiteSpace: 'nowrap' }}><span>{t('modelCount', { count: providerModels.length })}</span>{query !== '' ? <span>{t('searchResults')}</span> : <ActionButton text="" onClick={() => toggleProvider(route)} palette={palette} tone="ghost" icon={providerOpen ? 'chevronUp' : 'chevronDown'} label={providerOpen ? t('collapseProvider') : t('expandProvider')} />}</span></div>{providerOpen && state.providerDrafts[route] ? <>
          {renderGatewayCompatControls({ view: state.providerDrafts[route], onChange: (next) => patchProviderCompat(route, next), disabled: state.busy, expanded: state.providerCompatExpanded[route] === true, onToggleExpanded: () => toggleProviderCompatExpanded(route), availableCount: availableCompatFieldCount(state.providerDrafts[route]) }, { palette, t })}{state.providerDirty[route] ? <ActionButton text={t('saveGatewayCompat')} onClick={() => applyProviderCompat(route)} disabled={state.busy} tone="primary" palette={palette} icon="check" /> : null}</> : null}{providerOpen ? providerModels.map((item) => { const key = keyOf(item); const dirty = state.dirty[key] ?? {}; const compatAvailable = state.modelCompatViews[key] !== undefined; const openCodeSessionEditable = opencodeOn && state.openCodeSessionAvailable && item.modelSourceConflict !== true; return <ModelRow key={`${key}-${item.inOverrides ? 'override' : item.index}`} item={item} open={state.expanded[key] === true} draft={state.drafts[key]} contextDraft={state.contextDrafts[key] ?? contextDraftFrom(item)} inputDraft={state.inputDrafts[key] ?? inputDraftFrom(item)} dirty={dirty.levels === true || dirty.context === true || dirty.input === true} busy={state.busy} palette={palette} t={t} onToggle={() => toggleExpand(item)} onLevelChange={(level, patch) => patchDraft(item, level, patch)} onContextChange={(value) => patchContextValue(item, value)} onOneMillionChange={(enabled) => setOneMillion(item, enabled)} onInputChange={(modality, enabled) => patchInputCapability(item, modality, enabled)} onSave={() => applyModel(item)} blockedReason={modelSaveBlockedReason(buildLevels(state.drafts[key] ?? {}), state.contextDrafts[key] ?? contextDraftFrom(item), state.inputDrafts[key] ?? inputDraftFrom(item), t)} onRestoreReasoning={() => restoreReasoningDefaults(item)} onRestoreCapability={() => restoreProviderDefaults(item)}
                         compatView={compatAvailable ? state.modelCompatDrafts[key] : undefined}
                          compatExpanded={state.modelCompatExpanded[key] === true}
                          onToggleCompatExpanded={compatAvailable ? () => toggleModelCompatExpanded(key) : undefined}
                          compatDirty={state.modelCompatDirty[key]} onCompatChange={compatAvailable ? (next) => patchModelCompat(item, next) : undefined} onSaveCompat={compatAvailable ? () => applyModelCompat(item) : undefined} openCodeSession={state.openCodeSessionDrafts[key]} openCodeSessionAvailable={openCodeSessionEditable} onOpenCodeSessionChange={(enabled) => patchOpenCodeSession(item, enabled)} compaction={compactionControlsFor(item)} /> }) : null}</div> })}
      {expandedCount > 0 ? <div style={{ fontSize: '12px', color: palette.secondary, margin: '4px 2px 0' }}>{t('expandedSettings', { count: expandedCount })}</div> : null}
    </div>}
    <span aria-label={t('versionLabel')} style={{ position: 'absolute', right: '12px', bottom: '8px', fontSize: '10px', lineHeight: '14px', opacity: 0.45, pointerEvents: 'none', userSelect: 'none' }}>v{PLUGIN_VERSION}</span>
  </div>
}
