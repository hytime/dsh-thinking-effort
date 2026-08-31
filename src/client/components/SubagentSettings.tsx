import React from 'react'
import { ALL_LEVELS, LEVEL_LABEL_KEYS } from '../constants.js'
import type { Translation } from '../types.js'
import type { Palette } from '../theme.js'
import { ActionButton, Icon } from './Controls.js'

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
}

export function SubagentSettings({ effort, namespaceFound, draft, custom, busy, palette, t, onDraftChange, onCustomChange, onSave }: SubagentSettingsProps): React.ReactElement {
  const options: Array<[string, string]> = [['default', t('providerDefault')], ...ALL_LEVELS.map((level) => [level, t(LEVEL_LABEL_KEYS[level])] as [string, string]), ['custom', t('customize')]]
  return <div style={{ backgroundColor: palette.group, border: `1px solid ${palette.border}`, borderRadius: '8px', boxShadow: palette.shadow, overflow: 'hidden', marginBottom: '8px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 8px 1px', fontSize: '13px', fontWeight: 700, letterSpacing: 0 }}><Icon name="sparkles" size={15} /><span>{t('subagentCardTitle')}</span></div>
    <div style={{ padding: '0 8px', fontSize: '12px', color: palette.secondary, marginBottom: '5px' }}>{namespaceFound ? t('currentDefault', { effort: effort ?? t('providerDefault') }) : t('unconfiguredSubagent')}</div>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '6px 8px 7px', borderTop: `1px solid ${palette.divider}` }}>
      <select value={draft} disabled={busy} onChange={(event) => onDraftChange(event.currentTarget.value)} style={{ height: '28px', minWidth: '136px', padding: '0 10px', border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '13px', fontWeight: 500, backgroundColor: palette.field, color: palette.text, colorScheme: 'light dark', boxShadow: palette.shadow }}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      {draft === 'custom' ? <input type="text" value={custom} placeholder={t('customPlaceholder')} aria-label={t('customPlaceholder')} onChange={(event) => onCustomChange(event.currentTarget.value)} style={{ flex: '1 1 160px', minWidth: '140px', height: '28px', padding: '0 8px', border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '13px', backgroundColor: palette.field, color: palette.text, outline: 'none' }} /> : null}
      <ActionButton text={t('apply')} onClick={onSave} disabled={busy} tone="primary" palette={palette} icon="check" />
    </div>
  </div>
}
