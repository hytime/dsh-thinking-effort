import React from 'react'
import { ALL_LEVELS, LEVEL_LABEL_KEYS } from '../constants.js'
import type { SubagentModelDraft, SubagentModelRoute, Translation } from '../types.js'
import type { Palette } from '../theme.js'
import { ActionButton, Icon } from './Controls.js'
import css from '../settings.module.css'

export interface SubagentSettingsProps {
  readonly effort: string | null
  readonly namespaceFound: boolean
  readonly draft: string
  readonly custom: string
  readonly busy: boolean
  readonly palette: Palette
  readonly t: Translation
  readonly onDraftChange: (value: string) => void
  readonly onCustomChange: (value: string) => void
  readonly onSave: () => void
  /**
   * The subagent default-route picker. Absent when the host publishes no
   * plugin section, because that is the only place the pair can be written.
   */
  readonly modelPicker?: SubagentModelPicker
}

/**
 * Everything the default-route picker needs.
 *
 * The draft carries the empty string for "inherit the parent session", which is
 * also how the stored pair spells unset — so the select values and the settings
 * values are the same vocabulary and no sentinel translation happens here.
 */
export interface SubagentModelPicker {
  readonly draft: SubagentModelDraft
  /** Selectable routes, grouped from the live inventory. */
  readonly routes: readonly SubagentModelRoute[]
  /**
   * The saved pair names a route the current inventory no longer carries, so it
   * cannot be selected. The picker still shows it — a value the user set must
   * not vanish from the control that owns it — and offers to clear it.
   */
  readonly savedUnavailable: boolean
  readonly onProviderChange: (provider: string) => void
  readonly onModelChange: (model: string) => void
  readonly onSave: () => void
}

const INHERIT = ''

export function SubagentSettings({ effort, namespaceFound, draft, custom, busy, palette, t, onDraftChange, onCustomChange, onSave, modelPicker }: SubagentSettingsProps): React.ReactElement {
  const options: Array<[string, string]> = [['default', t('providerDefault')], ...ALL_LEVELS.map((level) => [level, t(LEVEL_LABEL_KEYS[level])] as [string, string]), ['custom', t('customize')]]
  const picker = modelPicker
  const selectedProvider = picker === undefined || picker.draft.provider === INHERIT ? INHERIT : picker.draft.provider
  const knownProviders = picker?.routes.map((route) => route.provider) ?? []
  // A saved route the inventory dropped still gets an option of its own: a
  // select whose value matches no option collapses to the first one, which
  // would display "inherit" while the settings still name a route — the control
  // would then be lying about what is stored.
  const savedProviderMissing = picker !== undefined
    && picker.savedUnavailable
    && selectedProvider !== INHERIT
    && !knownProviders.includes(selectedProvider)
  const providerOptions = picker === undefined
    ? []
    : [INHERIT, ...knownProviders, ...savedProviderMissing ? [selectedProvider] : []]
  const modelsOfSelected = picker?.routes.find((route) => route.provider === selectedProvider)?.models ?? []
  const unavailableValue = picker !== undefined && picker.savedUnavailable ? picker.draft.model : ''
  const unavailableOption = unavailableValue.length === 0
    ? null
    : <option value={unavailableValue}>{t('subagentModelUnavailable', { route: picker!.draft.provider })}</option>
  const providerLabel = (provider: string): string => {
    if (provider === INHERIT) return t('subagentModelInherit')
    if (savedProviderMissing && provider === selectedProvider) return t('subagentModelUnavailable', { route: provider })
    return provider
  }
  return <div style={{ backgroundColor: palette.group, border: `1px solid ${palette.border}`, borderRadius: '8px', boxShadow: palette.shadow, overflow: 'hidden', marginBottom: '8px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 8px 1px', fontSize: '13px', fontWeight: 700, letterSpacing: 0 }}><Icon name="sparkles" size={15} /><span>{t('subagentCardTitle')}</span></div>
    <div style={{ padding: '0 8px', fontSize: '12px', color: palette.secondary, marginBottom: '5px' }}>{namespaceFound ? t('currentDefault', { effort: effort ?? t('providerDefault') }) : t('unconfiguredSubagent')}</div>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '6px 8px 7px', borderTop: `1px solid ${palette.divider}` }}>
      <select value={draft} disabled={busy} onChange={(event) => onDraftChange(event.currentTarget.value)} className={css.responsiveSelect} style={{ height: '28px', padding: '0 10px', border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '13px', fontWeight: 500, backgroundColor: palette.field, color: palette.text, colorScheme: 'light dark', boxShadow: palette.shadow }}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      {draft === 'custom' ? <input type="text" value={custom} placeholder={t('customPlaceholder')} aria-label={t('customPlaceholder')} onChange={(event) => onCustomChange(event.currentTarget.value)} className={css.responsiveCustomInput} style={{ height: '28px', padding: '0 8px', border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '13px', backgroundColor: palette.field, color: palette.text, outline: 'none' }} /> : null}
      <ActionButton text={t('apply')} onClick={onSave} disabled={busy} tone="primary" palette={palette} icon="check" />
    </div>
    {picker !== undefined ? <div data-scope="subagent-model" style={{ display: 'grid', gap: '5px', padding: '6px 8px 7px', borderTop: `1px solid ${palette.divider}` }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700 }}><Icon name="model" size={14} /><span>{t('subagentModelTitle')}</span></span>
      <div className={css.pairGridTight}>
        <label className={css.labelControlRow} style={{ fontSize: '12px', color: palette.text }}><span>{t('subagentModelProvider')}</span><select aria-label={t('subagentModelProvider')} value={selectedProvider} disabled={busy} onChange={(event) => picker.onProviderChange(event.currentTarget.value)} style={{ boxSizing: 'border-box', minWidth: 0, height: '28px', padding: '0 7px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.field, color: palette.text, fontSize: '12px', colorScheme: 'light dark' }}>{providerOptions.map((provider) => <option key={provider} value={provider}>{providerLabel(provider)}</option>)}</select></label>
        <label className={css.labelControlRow} style={{ fontSize: '12px', color: palette.text }}><span>{t('subagentModelModel')}</span><select aria-label={t('subagentModelModel')} value={picker.draft.model} disabled={busy || selectedProvider === INHERIT} onChange={(event) => picker.onModelChange(event.currentTarget.value)} style={{ boxSizing: 'border-box', minWidth: 0, height: '28px', padding: '0 7px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.field, color: palette.text, fontSize: '12px', colorScheme: 'light dark' }}>{selectedProvider === INHERIT ? <option value={INHERIT}>{t('subagentModelInherit')}</option> : <>{unavailableOption}{modelsOfSelected.map((model) => <option key={model} value={model}>{model}</option>)}</>}</select></label>
      </div>
      <span style={{ color: palette.secondary, fontSize: '10px', lineHeight: '14px' }}>{t('subagentModelHint')}</span>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}><ActionButton text={t('subagentModelSave')} onClick={picker.onSave} disabled={busy || !picker.draft.touched} tone="primary" palette={palette} icon="check" /></div>
    </div> : null}
  </div>
}
