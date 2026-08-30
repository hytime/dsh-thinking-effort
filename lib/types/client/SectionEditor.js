import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from 'react';
import { DEFAULT_LEVELS, NS, PRESETS, ALL_LEVELS, CONTEXT_1M } from './constants.js';
import { inventoryFrom } from './model-inventory.js';
import { setOps } from './model-ops.js';
import { buildInput, buildLevels, contextDraftFrom, draftFrom, inputDraftFrom, validateContextWindow, validateLevels } from './validation.js';
import { iosPalette } from './theme.js';
import { ActionButton, Icon } from './components/Controls.js';
import { ModelRow } from './components/ModelRow.js';
import { SubagentSettings } from './components/SubagentSettings.js';
const PLUGIN_VERSION = '0.1.10';
const initialState = {
    loading: true, inventory: [], revision: 0, expanded: {}, expandedProviders: {}, drafts: {}, contextDrafts: {}, inputDrafts: {}, dirty: {}, busy: false, error: null, notice: null, query: '', nsFound: true, subagent: null, subagentDraft: 'default', subagentCustom: '', quickSettingsOpen: false,
};
function keyOf(item) { return `${item.route}/${item.model}`; }
function revisionOf(namespace) { return typeof namespace.revision === 'number' ? namespace.revision : 0; }
function removeDirtyFields(dirty, key, fields) {
    const next = { ...dirty };
    const entry = { ...(next[key] ?? {}) };
    fields.forEach((field) => { delete entry[field]; });
    if (Object.keys(entry).length === 0)
        delete next[key];
    else
        next[key] = entry;
    return next;
}
function subagentView(namespace) {
    if (!namespace)
        return { subagent: null, draft: 'default', custom: '', revision: 0 };
    const revision = revisionOf(namespace);
    const user = namespace.user ?? {};
    const effort = typeof user.subagentEffort === 'string' && user.subagentEffort.length > 0 ? user.subagentEffort : null;
    const draft = effort === null ? 'default' : ALL_LEVELS.includes(effort) ? effort : 'custom';
    return { subagent: { effort, revision }, draft, custom: draft === 'custom' ? effort ?? '' : '', revision };
}
export function SectionEditor({ settings, locale, t, palette = iosPalette() }) {
    const [state, setState] = React.useState(initialState);
    const applyNamespaceView = (current, nextNamespace, notice) => {
        const view = subagentView(nextNamespace);
        return { ...current, loading: false, busy: false, nsFound: true, inventory: inventoryFrom(nextNamespace), revision: revisionOf(nextNamespace), subagent: view.subagent, subagentDraft: view.draft, subagentCustom: view.custom, notice };
    };
    const load = () => {
        setState((current) => ({ ...current, loading: true, error: null }));
        settings.describe().then((response) => {
            if (!response.ok) {
                setState((current) => ({ ...current, loading: false, busy: false, error: response.error.message }));
                return;
            }
            const found = response.value.namespaces.find((entry) => entry.ns === NS);
            if (!found) {
                setState((current) => ({ ...current, loading: false, busy: false, nsFound: false, inventory: [], subagent: null }));
                return;
            }
            const view = subagentView(found);
            setState((current) => ({ ...current, loading: false, busy: false, nsFound: true, inventory: inventoryFrom(found), revision: revisionOf(found), subagent: view.subagent, subagentDraft: view.draft, subagentCustom: view.custom }));
        }).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            setState((current) => ({ ...current, loading: false, busy: false, error: t('readSettingsFailed', { message }) }));
        });
    };
    React.useEffect(() => { load(); }, []);
    const runOps = (ops, successMessage, onSuccess) => {
        setState((current) => ({ ...current, busy: true, error: null, notice: null }));
        settings.mutate(NS, ops, state.revision).then((response) => {
            if (!response.ok) {
                setState((current) => ({ ...current, busy: false, error: t('writeError', { message: response.error.message }) }));
                return;
            }
            if (!response.value || typeof response.value !== 'object') {
                setState((current) => ({ ...current, busy: false, error: t('saveMissingNamespace') }));
                return;
            }
            onSuccess?.();
            setState((current) => applyNamespaceView(current, response.value, successMessage));
        }).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            setState((current) => ({ ...current, busy: false, error: message.length > 0 ? t('writeError', { message }) : t('writeFailed') }));
        });
    };
    const applyModel = (item) => {
        const key = keyOf(item);
        const levels = buildLevels(state.drafts[key] ?? {});
        const levelError = validateLevels(levels, t);
        if (levelError) {
            setState((current) => ({ ...current, error: levelError }));
            return;
        }
        const contextDraft = state.contextDrafts[key] ?? contextDraftFrom(item);
        const context = contextDraft.touched ? validateContextWindow(contextDraft, t) : { value: undefined };
        if (context.error) {
            const error = context.error;
            setState((current) => ({ ...current, error }));
            return;
        }
        const inputDraft = state.inputDrafts[key] ?? inputDraftFrom(item);
        const input = inputDraft.touched ? buildInput(inputDraft, t) : { value: undefined };
        if (input.error) {
            const error = input.error;
            setState((current) => ({ ...current, error }));
            return;
        }
        const update = { item, levels, contextWindow: context.value, contextWindowTouched: contextDraft.touched, input: input.value, inputTouched: inputDraft.touched };
        runOps(setOps(state.inventory, [update]), t('modelSettingsSaved'), () => {
            setState((current) => ({ ...current, dirty: removeDirtyFields(current.dirty, key, ['levels', 'context', 'input']) }));
        });
    };
    const closeModelEditor = (item) => {
        const key = keyOf(item);
        setState((current) => {
            const expanded = { ...current.expanded };
            delete expanded[key];
            const drafts = { ...current.drafts };
            delete drafts[key];
            const contextDrafts = { ...current.contextDrafts };
            delete contextDrafts[key];
            const inputDrafts = { ...current.inputDrafts };
            delete inputDrafts[key];
            const dirty = { ...current.dirty };
            delete dirty[key];
            return { ...current, expanded, drafts, contextDrafts, inputDrafts, dirty };
        });
    };
    const restoreReasoningDefaults = (item) => {
        const key = keyOf(item);
        runOps(setOps(state.inventory, [{ item, levels: DEFAULT_LEVELS }]), t('restoreReasoning'), () => {
            setState((current) => ({ ...current, drafts: current.drafts[key] ? { ...current.drafts, [key]: draftFrom(DEFAULT_LEVELS) } : current.drafts, dirty: removeDirtyFields(current.dirty, key, ['levels']) }));
        });
    };
    const restoreProviderDefaults = (item) => {
        runOps(setOps(state.inventory, [{ item, contextWindow: undefined, contextWindowTouched: true, input: undefined, inputTouched: true }]), t('restoreCapability'), () => closeModelEditor(item));
    };
    const applyPreset = (levels) => {
        runOps(setOps(state.inventory, state.inventory.map((item) => ({ item, levels }))), t('settingsUpdated'), () => {
            setState((current) => {
                let dirty = current.dirty;
                const drafts = { ...current.drafts };
                current.inventory.forEach((item) => { const key = keyOf(item); if (drafts[key])
                    drafts[key] = draftFrom(levels); dirty = removeDirtyFields(dirty, key, ['levels']); });
                return { ...current, drafts, dirty };
            });
        });
    };
    const applySubagentEffort = () => {
        const value = state.subagentDraft === 'default' ? undefined : state.subagentDraft === 'custom' ? state.subagentCustom.trim() : state.subagentDraft;
        if (state.subagentDraft !== 'default' && !value) {
            setState((current) => ({ ...current, notice: null, error: t('customEffortRequired') }));
            return;
        }
        const ops = state.subagentDraft === 'default' ? [{ op: 'unset', path: ['subagentEffort'] }] : [{ op: 'set', path: ['subagentEffort'], value }];
        runOps(ops, t('subagentSaved'));
    };
    const toggleProvider = (route) => setState((current) => ({ ...current, expandedProviders: { ...current.expandedProviders, [route]: current.expandedProviders[route] !== true } }));
    const toggleExpand = (item) => {
        const key = keyOf(item);
        setState((current) => {
            if (current.expanded[key]) {
                const expanded = { ...current.expanded };
                delete expanded[key];
                return { ...current, expanded };
            }
            return { ...current, expanded: { ...current.expanded, [key]: true }, drafts: current.drafts[key] ? current.drafts : { ...current.drafts, [key]: draftFrom(item.levels) }, contextDrafts: current.contextDrafts[key] ? current.contextDrafts : { ...current.contextDrafts, [key]: contextDraftFrom(item) }, inputDrafts: current.inputDrafts[key] ? current.inputDrafts : { ...current.inputDrafts, [key]: inputDraftFrom(item) } };
        });
    };
    const patchDraft = (item, level, patch) => {
        const key = keyOf(item);
        setState((current) => {
            const cell = { ...(current.drafts[key]?.[level] ?? { on: false, wire: '' }), ...patch };
            if (level !== 'off' && patch.on === true && cell.wire.trim() === '')
                cell.wire = level;
            return { ...current, notice: null, dirty: { ...current.dirty, [key]: { ...current.dirty[key], levels: true } }, drafts: { ...current.drafts, [key]: { ...current.drafts[key], [level]: cell } } };
        });
    };
    const patchContextValue = (item, value) => {
        const key = keyOf(item);
        setState((current) => { const draft = current.contextDrafts[key] ?? contextDraftFrom(item); return { ...current, notice: null, dirty: { ...current.dirty, [key]: { ...current.dirty[key], context: true } }, contextDrafts: { ...current.contextDrafts, [key]: { ...draft, value, previousValue: value, oneMillion: false, touched: true } } }; });
    };
    const setOneMillion = (item, enabled) => {
        const key = keyOf(item);
        setState((current) => { const draft = current.contextDrafts[key] ?? contextDraftFrom(item); const previous = enabled ? (draft.oneMillion ? draft.previousValue : draft.value) : draft.previousValue; return { ...current, notice: null, dirty: { ...current.dirty, [key]: { ...current.dirty[key], context: true } }, contextDrafts: { ...current.contextDrafts, [key]: { ...draft, oneMillion: enabled, previousValue: previous || '', value: enabled ? String(CONTEXT_1M) : previous || '', touched: true } } }; });
    };
    const patchInputCapability = (item, modality, enabled) => {
        const key = keyOf(item);
        setState((current) => { const draft = current.inputDrafts[key] ?? inputDraftFrom(item); const other = modality === 'text' ? 'image' : 'text'; if (!enabled && !draft[other])
            return { ...current, notice: null, error: t('inputCapabilityMinimum') }; return { ...current, error: null, notice: null, dirty: { ...current.dirty, [key]: { ...current.dirty[key], input: true } }, inputDrafts: { ...current.inputDrafts, [key]: { ...draft, [modality]: enabled, touched: true } } }; });
    };
    const query = state.query.trim().toLowerCase();
    const visible = query === '' ? state.inventory : state.inventory.filter((item) => item.model.toLowerCase().includes(query) || item.name.toLowerCase().includes(query));
    const routes = [...new Set(visible.map((item) => item.route))];
    const expandedCount = visible.filter((item) => state.expanded[keyOf(item)] && (query !== '' || state.expandedProviders[item.route])).length;
    const snapshot = locale.getSnapshot?.() ?? {};
    const available = new Set(snapshot.locales?.map((entry) => entry.id).filter((id) => typeof id === 'string') ?? ['zh', 'en', 'ja', 'ko']);
    const languageOptions = [['zh', 'languageChinese'], ['en', 'languageEnglish'], ['ja', 'languageJapanese'], ['ko', 'languageKorean']];
    return _jsxs("div", { style: { position: 'relative', maxWidth: '920px', margin: '0 auto', padding: '6px 8px 34px', color: palette.text, fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif' }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', fontSize: '12px', marginBottom: '4px' }, children: [t('languageLabel'), _jsx("select", { value: snapshot.active, onChange: (event) => locale.setLocale?.(event.currentTarget.value), style: { height: '26px', padding: '0 7px', border: `1px solid ${palette.border}`, borderRadius: '7px', backgroundColor: palette.field, color: palette.text, fontSize: '12px' }, children: languageOptions.map(([id, key]) => available.has(id) ? _jsx("option", { value: id, children: t(key) }, id) : null) })] }), _jsxs("h3", { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '8px', rowGap: '4px', fontSize: '18px', lineHeight: '24px', fontWeight: 700, letterSpacing: 0, margin: '0 0 7px' }, children: [_jsx(Icon, { name: "sliders", size: 19 }), _jsx("span", { children: t('pageTitle') }), state.notice ? _jsxs("span", { role: "status", "aria-live": "polite", style: { display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: 'auto', padding: '2px 6px', border: `1px solid ${palette.accentBorder}`, borderRadius: '6px', color: palette.accent, backgroundColor: palette.accentSoft, fontSize: '11px', lineHeight: '16px', fontWeight: 650 }, children: [_jsx(Icon, { name: "check", size: 12 }), state.notice] }) : null] }), state.error ? _jsx("div", { role: "alert", "aria-live": "assertive", style: { fontSize: '12px', lineHeight: '18px', color: palette.danger, backgroundColor: palette.dangerBg, border: `1px solid ${palette.dangerBorder}`, borderRadius: '8px', padding: '6px 8px', margin: '0 0 8px' }, children: state.error }) : null, _jsx(SubagentSettings, { effort: state.subagent?.effort ?? null, namespaceFound: state.subagent !== null, draft: state.subagentDraft, custom: state.subagentCustom, busy: state.busy, palette: palette, t: t, onDraftChange: (value) => setState((current) => ({ ...current, notice: null, subagentDraft: value })), onCustomChange: (value) => setState((current) => ({ ...current, notice: null, subagentCustom: value })), onSave: applySubagentEffort }), state.nsFound === false ? _jsx("p", { style: { fontSize: '12px', opacity: 0.75 }, children: t('noNamespace') }) : _jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: state.quickSettingsOpen ? '4px' : '6px' }, children: [_jsx(ActionButton, { text: t('quickSettings'), onClick: () => setState((current) => ({ ...current, quickSettingsOpen: !current.quickSettingsOpen })), disabled: state.busy, palette: palette, icon: state.quickSettingsOpen ? 'chevronUp' : 'sliders' }), state.quickSettingsOpen ? _jsx("div", { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', flexBasis: '100%', padding: '4px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.field }, children: PRESETS.map((preset) => _jsx(ActionButton, { text: t(preset.labelKey), onClick: () => { setState((current) => ({ ...current, quickSettingsOpen: false })); applyPreset(preset.levels); }, disabled: state.busy, palette: palette, icon: preset.key === 'official' ? 'sparkles' : 'sliders' }, preset.key)) }) : null] }), _jsxs("div", { style: { position: 'relative', marginBottom: '7px' }, children: [_jsx("span", { style: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: palette.secondary, pointerEvents: 'none' }, children: _jsx(Icon, { name: "search", size: 15 }) }), _jsx("input", { type: "text", value: state.query, placeholder: t('searchPlaceholder'), onChange: (event) => { const value = event.currentTarget.value; setState((current) => ({ ...current, query: value })); }, style: { boxSizing: 'border-box', width: '100%', height: '30px', padding: '0 10px 0 30px', border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '13px', backgroundColor: palette.field, color: palette.text, outline: 'none', boxShadow: palette.shadow } })] }), state.loading ? _jsx("div", { style: { fontSize: '12px', opacity: 0.7 }, children: t('loading') }) : visible.length === 0 ? _jsx("div", { style: { fontSize: '12px', opacity: 0.7 }, children: state.inventory.length === 0 ? t('noModels') : t('noMatches') }) : routes.map((route) => { const providerModels = visible.filter((item) => item.route === route); const providerOpen = query !== '' || state.expandedProviders[route] === true; return _jsxs("div", { style: { marginBottom: '6px' }, children: [_jsxs("div", { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: '8px', minHeight: '32px', padding: '4px 6px', marginBottom: '4px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.raised }, children: [_jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }, children: [_jsx("span", { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', minWidth: '22px', border: `1px solid ${palette.border}`, borderRadius: '7px', color: palette.secondary, backgroundColor: palette.group }, children: _jsx(Icon, { name: "layers", size: 14 }) }), _jsxs("span", { style: { display: 'grid', gap: '1px', minWidth: 0 }, children: [_jsx("span", { style: { color: palette.text, fontSize: '12px', fontWeight: 700, overflowWrap: 'anywhere' }, children: route }), _jsx("span", { style: { color: palette.accent, fontSize: '10px', lineHeight: '11px', fontWeight: 700 }, children: t('vendor') })] })] }), _jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: palette.secondary, whiteSpace: 'nowrap' }, children: [_jsx("span", { children: t('modelCount', { count: providerModels.length }) }), query !== '' ? _jsx("span", { children: t('searchResults') }) : _jsx(ActionButton, { text: "", onClick: () => toggleProvider(route), palette: palette, tone: "ghost", icon: providerOpen ? 'chevronUp' : 'chevronDown', label: providerOpen ? t('collapseProvider') : t('expandProvider') })] })] }), providerOpen ? providerModels.map((item) => { const key = keyOf(item); const dirty = state.dirty[key] ?? {}; return _jsx(ModelRow, { item: item, open: state.expanded[key] === true, draft: state.drafts[key], contextDraft: state.contextDrafts[key] ?? contextDraftFrom(item), inputDraft: state.inputDrafts[key] ?? inputDraftFrom(item), dirty: dirty.levels === true || dirty.context === true || dirty.input === true, busy: state.busy, palette: palette, t: t, onToggle: () => toggleExpand(item), onLevelChange: (level, patch) => patchDraft(item, level, patch), onContextChange: (value) => patchContextValue(item, value), onOneMillionChange: (enabled) => setOneMillion(item, enabled), onInputChange: (modality, enabled) => patchInputCapability(item, modality, enabled), onSave: () => applyModel(item), onRestoreReasoning: () => restoreReasoningDefaults(item), onRestoreCapability: () => restoreProviderDefaults(item) }, `${key}-${item.inOverrides ? 'override' : item.index}`); }) : null] }, route); }), expandedCount > 0 ? _jsx("div", { style: { fontSize: '12px', color: palette.secondary, margin: '4px 2px 0' }, children: t('expandedSettings', { count: expandedCount }) }) : null] }), _jsxs("span", { "aria-label": t('versionLabel'), style: { position: 'absolute', right: '12px', bottom: '8px', fontSize: '10px', lineHeight: '14px', opacity: 0.45, pointerEvents: 'none', userSelect: 'none' }, children: ["v", PLUGIN_VERSION] })] });
}
//# sourceMappingURL=SectionEditor.js.map