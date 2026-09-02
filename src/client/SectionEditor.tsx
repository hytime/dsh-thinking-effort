import React from 'react'
import packageJson from '@hytime/dsh-thinking-effort/package.json' with { type: 'json' }
import { DEFAULT_LEVELS, INPUT_MODALITIES, LEVEL_LABEL_KEYS, NS, PRESETS, ALL_LEVELS, CONTEXT_1M } from './constants.js'
import { inventoryFrom, modelCompatKey, modelGatewayCompatViewsFrom, providerGatewayCompatViewsFrom } from './model-inventory.js'
import { emptyTakeoverRuntimeResolution } from './takeover-runtime.js'
import { opsForModelCompat, opsForProviderCompat, setOps } from './model-ops.js'
import { buildInput, buildLevels, contextDraftFrom, draftFrom, inputDraftFrom, validateContextWindow, validateLevels } from './validation.js'
import type { ClientLocale, ClientResult, ContextDraft, DraftCell, InputDraft, InventoryItem, ModelCompatDirtyFields, ModelGatewayCompatUpdate, ModelGatewayCompatView, ModelUpdate, ProviderGatewayCompatView, ReasoningDraft, SettingsApi, SettingsNamespace, SettingsOp, Translation } from './types.js'
import type { Palette } from './theme.js'
import type { TakeoverRuntimeStore } from './takeover-runtime.js'
import { iosPalette } from './theme.js'
import { ActionButton, Icon } from './components/Controls.js'
import { ModelRow } from './components/ModelRow.js'
import { SubagentSettings } from './components/SubagentSettings.js'
import { renderGatewayCompatControls } from './components/GatewayCompatControls.js'

const PLUGIN_VERSION = packageJson.version

type DirtyFields = { levels?: boolean; context?: boolean; input?: boolean }
interface SubagentState { effort: string | null; revision: number }
interface EditorState {
  loading: boolean
  namespace: SettingsNamespace | null
  inventory: InventoryItem[]
  providerViews: Record<string, ProviderGatewayCompatView>
  providerDrafts: Record<string, ProviderGatewayCompatView>
  providerDirty: Record<string, boolean>
  modelCompatViews: Record<string, ModelGatewayCompatView>
  modelCompatDrafts: Record<string, ModelGatewayCompatView>
  modelCompatDirty: Record<string, ModelCompatDirtyFields>
  revision: number
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
  subagent: SubagentState | null
  subagentDraft: string
  subagentCustom: string
  quickSettingsOpen: boolean
}

export interface SectionEditorProps {
  readonly settings: SettingsApi
  readonly locale: ClientLocale
  readonly t: Translation
  readonly palette?: Palette
  readonly takeoverRuntime?: TakeoverRuntimeStore
}

const initialState: EditorState = {
  loading: true, namespace: null, inventory: [], providerViews: {}, providerDrafts: {}, providerDirty: {}, modelCompatViews: {}, modelCompatDrafts: {}, modelCompatDirty: {}, revision: 0, expanded: {}, expandedProviders: {}, drafts: {}, contextDrafts: {}, inputDrafts: {}, dirty: {}, busy: false, error: null, notice: null, query: '', nsFound: true, subagent: null, subagentDraft: 'default', subagentCustom: '', quickSettingsOpen: false,
}

function keyOf(item: InventoryItem): string { return modelCompatKey(item.route, item.model) }
function revisionOf(namespace: SettingsNamespace): number { return typeof namespace.revision === 'number' ? namespace.revision : 0 }
function removeDirtyFields<T extends object>(dirty: Record<string, T>, key: string, fields: readonly (keyof T)[]): Record<string, T> {
  const next = { ...dirty }
  const entry = { ...(next[key] ?? {}) }
  fields.forEach((field) => { delete entry[field] })
  if (Object.keys(entry).length === 0) delete next[key]
  else next[key] = entry
  return next
}

function subagentView(namespace: SettingsNamespace | null): { subagent: SubagentState | null; draft: string; custom: string; revision: number } {
  if (!namespace) return { subagent: null, draft: 'default', custom: '', revision: 0 }
  const revision = revisionOf(namespace)
  const user = namespace.user ?? {}
  const effort = typeof user.subagentEffort === 'string' && user.subagentEffort.length > 0 ? user.subagentEffort : null
  const draft = effort === null ? 'default' : ALL_LEVELS.includes(effort as typeof ALL_LEVELS[number]) ? effort : 'custom'
  return { subagent: { effort, revision }, draft, custom: draft === 'custom' ? effort ?? '' : '', revision }
}

const noRuntimeSubscribe = (): (() => void) => () => undefined
const noRuntimeSnapshot = (): typeof emptyTakeoverRuntimeResolution => emptyTakeoverRuntimeResolution

export function SectionEditor({ settings, locale, t, palette = iosPalette(), takeoverRuntime }: SectionEditorProps): React.ReactElement {
  const [state, setState] = React.useState<EditorState>(initialState)
  const takeoverResolution = React.useSyncExternalStore(
    takeoverRuntime?.subscribe ?? noRuntimeSubscribe,
    takeoverRuntime?.getSnapshot ?? noRuntimeSnapshot,
    takeoverRuntime?.getSnapshot ?? noRuntimeSnapshot,
  )

  const applyNamespaceView = (current: EditorState, nextNamespace: SettingsNamespace, notice: string | null): EditorState => {
    const view = subagentView(nextNamespace)
    const nextInventory = inventoryFrom(nextNamespace)
    const providerViews = providerGatewayCompatViewsFrom(nextNamespace, settings.compatibilityProfile, takeoverResolution)
    const modelCompatViews = modelGatewayCompatViewsFrom(nextNamespace, nextInventory, settings.compatibilityProfile, takeoverResolution)
    const modelCompatDrafts = { ...current.modelCompatDrafts }
    for (const item of nextInventory) {
      const key = keyOf(item)
      const draft = modelCompatDrafts[key]
      const dirty = current.modelCompatDirty[key]
      if (!dirty) modelCompatDrafts[key] = modelCompatViews[key]!
      else if (draft) modelCompatDrafts[key] = {
        ...modelCompatViews[key],
        supportsDeveloperRole: draft.supportsDeveloperRole,
        maxTokensField: draft.maxTokensField,
      }
    }
    const providerDrafts = { ...current.providerDrafts }
    for (const [provider, providerView] of Object.entries(providerViews)) {
      if (current.providerDirty[provider] !== true) providerDrafts[provider] = providerView
    }
    return { ...current, loading: false, namespace: nextNamespace, busy: false, nsFound: true, inventory: nextInventory, providerViews, providerDrafts, modelCompatViews, modelCompatDrafts, revision: revisionOf(nextNamespace), subagent: view.subagent, subagentDraft: view.draft, subagentCustom: view.custom, notice }
  }

  const load = (): void => {
    setState((current) => ({ ...current, loading: true, error: null }))
    settings.describe().then((response) => {
      if (!response.ok) {
        setState((current) => ({ ...current, loading: false, busy: false, error: response.error.message }))
        return
      }
      const found = response.value.namespaces.find((entry) => entry.ns === NS)
      if (!found) {
        setState((current) => ({ ...current, loading: false, busy: false, nsFound: false, namespace: null, inventory: [], providerViews: {}, providerDrafts: {}, providerDirty: {}, modelCompatViews: {}, modelCompatDrafts: {}, modelCompatDirty: {}, subagent: null }))
        return
      }
      setState((current) => applyNamespaceView(current, found, null))
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setState((current) => ({ ...current, loading: false, busy: false, error: t('readSettingsFailed', { message }) }))
    })
  }

  React.useEffect(() => { load() }, [])

  React.useEffect(() => {
    setState((current) => {
      if (current.namespace === null) return current
      const providerViews = providerGatewayCompatViewsFrom(current.namespace, settings.compatibilityProfile, takeoverResolution)
      const providerDrafts = { ...current.providerDrafts }
      for (const [provider, view] of Object.entries(providerViews)) {
        if (current.providerDirty[provider] !== true) providerDrafts[provider] = view
      }
      const modelCompatViews = modelGatewayCompatViewsFrom(current.namespace, current.inventory, settings.compatibilityProfile, takeoverResolution)
      const modelCompatDrafts = { ...current.modelCompatDrafts }
      for (const item of current.inventory) {
        const key = keyOf(item)
        const draft = modelCompatDrafts[key]
        const dirty = current.modelCompatDirty[key]
        if (!dirty) modelCompatDrafts[key] = modelCompatViews[key]!
        else if (draft) modelCompatDrafts[key] = { ...modelCompatViews[key], supportsDeveloperRole: draft.supportsDeveloperRole, maxTokensField: draft.maxTokensField }
      }
      return { ...current, providerViews, providerDrafts, modelCompatViews, modelCompatDrafts }
    })
  }, [takeoverResolution])

  const runOps = (ops: readonly SettingsOp[], successMessage: string, onSuccess?: () => void): void => {
    setState((current) => ({ ...current, busy: true, error: null, notice: null }))
    settings.mutate(NS, ops, state.revision).then((response) => {
      if (!response.ok) {
        setState((current) => ({ ...current, busy: false, error: t('writeError', { message: response.error.message }) }))
        return
      }
      if (!response.value || typeof response.value !== 'object') {
        setState((current) => ({ ...current, busy: false, error: t('saveMissingNamespace') }))
        return
      }
      onSuccess?.()
      setState((current) => applyNamespaceView(current, response.value, successMessage))
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setState((current) => ({ ...current, busy: false, error: message.length > 0 ? t('writeError', { message }) : t('writeFailed') }))
    })
  }

  const applyModel = (item: InventoryItem): void => {
    const key = keyOf(item)
    const levels = buildLevels(state.drafts[key] ?? {})
    const levelError = validateLevels(levels, t)
    if (levelError) { setState((current) => ({ ...current, error: levelError })); return }
    const contextDraft = state.contextDrafts[key] ?? contextDraftFrom(item)
    const context = contextDraft.touched ? validateContextWindow(contextDraft, t) : { value: undefined }
    if (context.error) { const error = context.error; setState((current) => ({ ...current, error })); return }
    const inputDraft = state.inputDrafts[key] ?? inputDraftFrom(item)
    const input = inputDraft.touched ? buildInput(inputDraft, t) : { value: undefined }
    if (input.error) { const error = input.error; setState((current) => ({ ...current, error })); return }
    const update: ModelUpdate = { item, levels, contextWindow: context.value, contextWindowTouched: contextDraft.touched, input: input.value, inputTouched: inputDraft.touched }
    runOps(setOps(state.inventory, [update]), t('modelSettingsSaved'), () => {
      setState((current) => ({ ...current, dirty: removeDirtyFields(current.dirty, key, ['levels', 'context', 'input']) }))
    })
  }

  const applyModelCompat = (item: InventoryItem): void => {
    if (!item.inOverrides) return
    const key = keyOf(item)
    const draft = state.modelCompatDrafts[key]
    const current = state.modelCompatViews[key]
    const dirty = state.modelCompatDirty[key]
    if (!draft || !current || !dirty) return
    const update: { supportsDeveloperRole?: ModelGatewayCompatUpdate['supportsDeveloperRole']; maxTokensField?: ModelGatewayCompatUpdate['maxTokensField'] } = {}
    if (dirty.supportsDeveloperRole === true && draft.supportsDeveloperRole !== current.supportsDeveloperRole) update.supportsDeveloperRole = draft.supportsDeveloperRole
    if (dirty.maxTokensField === true && draft.maxTokensField !== current.maxTokensField) update.maxTokensField = draft.maxTokensField
    const ops = opsForModelCompat(item, update, {
      supportsDeveloperRole: draft.supportsDeveloperRoleAvailable,
      maxTokensField: draft.maxTokensFieldAvailable,
    })
    if (ops.length === 0) {
      setState((currentState) => ({ ...currentState, modelCompatDirty: removeDirtyFields(currentState.modelCompatDirty, key, ['supportsDeveloperRole', 'maxTokensField']) }))
      return
    }
    runOps(ops, t('modelGatewayCompatSaved'), () => {
      setState((currentState) => ({ ...currentState, modelCompatDirty: removeDirtyFields(currentState.modelCompatDirty, key, ['supportsDeveloperRole', 'maxTokensField']) }))
    })
  }

  const patchModelCompat = (item: InventoryItem, next: Partial<ModelGatewayCompatUpdate>): void => {
    if (!item.inOverrides) return
    const key = keyOf(item)
    setState((current) => {
      const draft = current.modelCompatDrafts[key] ?? current.modelCompatViews[key]
      if (!draft) return current
      const modelCompatDrafts = { ...current.modelCompatDrafts, [key]: { ...draft, ...next } }
      const modelCompatDirty = { ...current.modelCompatDirty, [key]: { ...current.modelCompatDirty[key], ...(Object.prototype.hasOwnProperty.call(next, 'supportsDeveloperRole') ? { supportsDeveloperRole: true } : {}), ...(Object.prototype.hasOwnProperty.call(next, 'maxTokensField') ? { maxTokensField: true } : {}) } }
      return { ...current, notice: null, modelCompatDrafts, modelCompatDirty }
    })
  }

  const closeModelEditor = (item: InventoryItem): void => {
    const key = keyOf(item)
    setState((current) => {
      const expanded = { ...current.expanded }; delete expanded[key]
      const drafts = { ...current.drafts }; delete drafts[key]
      const contextDrafts = { ...current.contextDrafts }; delete contextDrafts[key]
      const inputDrafts = { ...current.inputDrafts }; delete inputDrafts[key]
      const dirty = { ...current.dirty }; delete dirty[key]
      return { ...current, expanded, drafts, contextDrafts, inputDrafts, dirty }
    })
  }

  const restoreReasoningDefaults = (item: InventoryItem): void => {
    const key = keyOf(item)
    runOps(setOps(state.inventory, [{ item, levels: DEFAULT_LEVELS }]), t('restoreReasoning'), () => {
      setState((current) => ({ ...current, drafts: current.drafts[key] ? { ...current.drafts, [key]: draftFrom(DEFAULT_LEVELS) } : current.drafts, dirty: removeDirtyFields(current.dirty, key, ['levels']) }))
    })
  }

  const restoreProviderDefaults = (item: InventoryItem): void => {
    runOps(setOps(state.inventory, [{ item, contextWindow: undefined, contextWindowTouched: true, input: undefined, inputTouched: true }]), t('restoreCapability'), () => closeModelEditor(item))
  }

  const applyPreset = (levels: typeof PRESETS[number]['levels']): void => {
    runOps(setOps(state.inventory, state.inventory.map((item): ModelUpdate => ({ item, levels }))), t('settingsUpdated'), () => {
      setState((current) => {
        let dirty = current.dirty
        const drafts = { ...current.drafts }
        current.inventory.forEach((item) => { const key = keyOf(item); if (drafts[key]) drafts[key] = draftFrom(levels); dirty = removeDirtyFields(dirty, key, ['levels']) })
        return { ...current, drafts, dirty }
      })
    })
  }

  const applySubagentEffort = (): void => {
    const value = state.subagentDraft === 'default' ? undefined : state.subagentDraft === 'custom' ? state.subagentCustom.trim() : state.subagentDraft
    if (state.subagentDraft !== 'default' && !value) { setState((current) => ({ ...current, notice: null, error: t('customEffortRequired') })); return }
    const ops: SettingsOp[] = state.subagentDraft === 'default' ? [{ op: 'unset', path: ['subagentEffort'] }] : [{ op: 'set', path: ['subagentEffort'], value }]
    runOps(ops, t('subagentSaved'))
  }

  const applyProviderCompat = (route: string): void => {
    const draft = state.providerDrafts[route]
    const current = state.providerViews[route]
    if (!draft || !current) return
    const update: Partial<ProviderGatewayCompatView> = {}
    if (draft.supportsDeveloperRole !== current.supportsDeveloperRole) {
      update.supportsDeveloperRole = draft.supportsDeveloperRole
    }
    if (draft.maxTokensField !== current.maxTokensField) {
      update.maxTokensField = draft.maxTokensField
    }
    const ops = opsForProviderCompat(route, update, {
      supportsDeveloperRole: draft.supportsDeveloperRoleAvailable,
      maxTokensField: draft.maxTokensFieldAvailable,
    })
    if (ops.length === 0) {
      setState((state) => {
        const providerDirty = { ...state.providerDirty }
        delete providerDirty[route]
        return { ...state, providerDirty }
      })
      return
    }
    runOps(ops, t('gatewayCompatSaved'), () => {
      setState((current) => {
        const providerDirty = { ...current.providerDirty }
        delete providerDirty[route]
        return { ...current, providerDirty }
      })
    })
  }

  const patchProviderCompat = (route: string, next: ProviderGatewayCompatView): void => {
    setState((current) => ({
      ...current,
      notice: null,
      providerDrafts: { ...current.providerDrafts, [route]: next },
      providerDirty: { ...current.providerDirty, [route]: true },
    }))
  }

  const toggleProvider = (route: string): void => setState((current) => ({ ...current, expandedProviders: { ...current.expandedProviders, [route]: current.expandedProviders[route] !== true } }))
  const toggleExpand = (item: InventoryItem): void => {
    const key = keyOf(item)
    setState((current) => {
      if (current.expanded[key]) { const expanded = { ...current.expanded }; delete expanded[key]; return { ...current, expanded } }
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

  return <div style={{ position: 'relative', maxWidth: '920px', margin: '0 auto', padding: '6px 8px 34px', color: palette.text, fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif' }}>
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', fontSize: '12px', marginBottom: '4px' }}>{t('languageLabel')}<select value={snapshot.active} onChange={(event) => locale.setLocale?.(event.currentTarget.value)} style={{ height: '26px', padding: '0 7px', border: `1px solid ${palette.border}`, borderRadius: '7px', backgroundColor: palette.field, color: palette.text, fontSize: '12px' }}>{languageOptions.map(([id, key]) => available.has(id) ? <option key={id} value={id}>{t(key)}</option> : null)}</select></label>
    <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '8px', rowGap: '4px', fontSize: '18px', lineHeight: '24px', fontWeight: 700, letterSpacing: 0, margin: '0 0 7px' }}><Icon name="sliders" size={19} /><span>{t('pageTitle')}</span>{state.notice ? <span role="status" aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: 'auto', padding: '2px 6px', border: `1px solid ${palette.accentBorder}`, borderRadius: '6px', color: palette.accent, backgroundColor: palette.accentSoft, fontSize: '11px', lineHeight: '16px', fontWeight: 650 }}><Icon name="check" size={12} />{state.notice}</span> : null}</h3>
    {state.error ? <div role="alert" aria-live="assertive" style={{ fontSize: '12px', lineHeight: '18px', color: palette.danger, backgroundColor: palette.dangerBg, border: `1px solid ${palette.dangerBorder}`, borderRadius: '8px', padding: '6px 8px', margin: '0 0 8px' }}>{state.error}</div> : null}
    <SubagentSettings effort={state.subagent?.effort ?? null} namespaceFound={state.subagent !== null} draft={state.subagentDraft} custom={state.subagentCustom} busy={state.busy} palette={palette} t={t} onDraftChange={(value) => setState((current) => ({ ...current, notice: null, subagentDraft: value }))} onCustomChange={(value) => setState((current) => ({ ...current, notice: null, subagentCustom: value }))} onSave={applySubagentEffort} />
    {state.nsFound === false ? <p style={{ fontSize: '12px', opacity: 0.75 }}>{t('noNamespace')}</p> : <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: state.quickSettingsOpen ? '4px' : '6px' }}><ActionButton text={t('quickSettings')} onClick={() => setState((current) => ({ ...current, quickSettingsOpen: !current.quickSettingsOpen }))} disabled={state.busy} palette={palette} icon={state.quickSettingsOpen ? 'chevronUp' : 'sliders'} />{state.quickSettingsOpen ? <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flexBasis: '100%', padding: '4px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.field }}>{PRESETS.map((preset) => <ActionButton key={preset.key} text={t(preset.labelKey)} onClick={() => { setState((current) => ({ ...current, quickSettingsOpen: false })); applyPreset(preset.levels) }} disabled={state.busy} palette={palette} icon={preset.key === 'official' ? 'sparkles' : 'sliders'} />)}</div> : null}</div>
      <div style={{ position: 'relative', marginBottom: '7px' }}><span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: palette.secondary, pointerEvents: 'none' }}><Icon name="search" size={15} /></span><input type="text" value={state.query} placeholder={t('searchPlaceholder')} onChange={(event) => { const value = event.currentTarget.value; setState((current) => ({ ...current, query: value })) }} style={{ boxSizing: 'border-box', width: '100%', height: '30px', padding: '0 10px 0 30px', border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '13px', backgroundColor: palette.field, color: palette.text, outline: 'none', boxShadow: palette.shadow }} /></div>
      {state.loading ? <div style={{ fontSize: '12px', opacity: 0.7 }}>{t('loading')}</div> : visible.length === 0 ? <div style={{ fontSize: '12px', opacity: 0.7 }}>{state.inventory.length === 0 ? t('noModels') : t('noMatches')}</div> :
         routes.map((route) => { const providerModels = visible.filter((item) => item.route === route); const providerOpen = query !== '' || state.expandedProviders[route] === true; return <div key={route} style={{ marginBottom: '6px' }}><div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: '8px', minHeight: '32px', padding: '4px 6px', marginBottom: '4px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.raised }}><span style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', minWidth: '22px', border: `1px solid ${palette.border}`, borderRadius: '7px', color: palette.secondary, backgroundColor: palette.group }}><Icon name="layers" size={14} /></span><span style={{ display: 'grid', gap: '1px', minWidth: 0 }}><span style={{ color: palette.text, fontSize: '12px', fontWeight: 700, overflowWrap: 'anywhere' }}>{route}</span><span style={{ color: palette.accent, fontSize: '10px', lineHeight: '11px', fontWeight: 700 }}>{t('vendor')}</span></span></span><span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: palette.secondary, whiteSpace: 'nowrap' }}><span>{t('modelCount', { count: providerModels.length })}</span>{query !== '' ? <span>{t('searchResults')}</span> : <ActionButton text="" onClick={() => toggleProvider(route)} palette={palette} tone="ghost" icon={providerOpen ? 'chevronUp' : 'chevronDown'} label={providerOpen ? t('collapseProvider') : t('expandProvider')} />}</span></div>{state.providerDrafts[route] ? <>
          {renderGatewayCompatControls({ view: state.providerDrafts[route], onChange: (next) => patchProviderCompat(route, next), disabled: state.busy }, { palette, t })}{state.providerDirty[route] ? <ActionButton text={t('saveGatewayCompat')} onClick={() => applyProviderCompat(route)} disabled={state.busy} tone="primary" palette={palette} icon="check" /> : null}</> : null}{providerOpen ? providerModels.map((item) => { const key = keyOf(item); const dirty = state.dirty[key] ?? {}; return <ModelRow key={`${key}-${item.inOverrides ? 'override' : item.index}`} item={item} open={state.expanded[key] === true} draft={state.drafts[key]} contextDraft={state.contextDrafts[key] ?? contextDraftFrom(item)} inputDraft={state.inputDrafts[key] ?? inputDraftFrom(item)} dirty={dirty.levels === true || dirty.context === true || dirty.input === true} busy={state.busy} palette={palette} t={t} onToggle={() => toggleExpand(item)} onLevelChange={(level, patch) => patchDraft(item, level, patch)} onContextChange={(value) => patchContextValue(item, value)} onOneMillionChange={(enabled) => setOneMillion(item, enabled)} onInputChange={(modality, enabled) => patchInputCapability(item, modality, enabled)} onSave={() => applyModel(item)} onRestoreReasoning={() => restoreReasoningDefaults(item)} onRestoreCapability={() => restoreProviderDefaults(item)}
                         compatView={item.inOverrides ? state.modelCompatDrafts[keyOf(item)] : undefined} compatDirty={Boolean(state.modelCompatDirty[key]?.supportsDeveloperRole || state.modelCompatDirty[key]?.maxTokensField)} onCompatChange={(next) => patchModelCompat(item, next)} onSaveCompat={() => applyModelCompat(item)} /> }) : null}</div> })}
      {expandedCount > 0 ? <div style={{ fontSize: '12px', color: palette.secondary, margin: '4px 2px 0' }}>{t('expandedSettings', { count: expandedCount })}</div> : null}
    </div>}
    <span aria-label={t('versionLabel')} style={{ position: 'absolute', right: '12px', bottom: '8px', fontSize: '10px', lineHeight: '14px', opacity: 0.45, pointerEvents: 'none', userSelect: 'none' }}>v{PLUGIN_VERSION}</span>
  </div>
}
