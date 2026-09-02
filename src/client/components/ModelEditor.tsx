import React from 'react'
import { ALL_LEVELS, CONTEXT_1M, CONTEXT_MAX, CONTEXT_MIN, LEVEL_LABEL_KEYS } from '../constants.js'
import type { ContextDraft, DraftCell, InputDraft, InventoryItem, ModelGatewayCompatUpdate, ModelGatewayCompatView, ReasoningDraft, Translation } from '../types.js'
import type { Palette } from '../theme.js'
import { ActionButton, Icon, SwitchControl } from './Controls.js'
import { renderGatewayCompatControls } from './GatewayCompatControls.js'

export interface ModelEditorProps {
  readonly item: InventoryItem
  readonly draft: ReasoningDraft
  readonly contextDraft: ContextDraft
  readonly inputDraft: InputDraft
  readonly dirty: boolean
  readonly busy: boolean
  readonly palette: Palette
  readonly t: Translation
  readonly onLevelChange: (level: typeof ALL_LEVELS[number], patch: Partial<DraftCell>) => void
  readonly onContextChange: (value: string) => void
  readonly onOneMillionChange: (enabled: boolean) => void
  readonly onInputChange: (modality: 'text' | 'image', enabled: boolean) => void
  readonly onSave: () => void
  readonly onRestoreReasoning: () => void
  readonly onRestoreCapability: () => void
  readonly compatView?: ModelGatewayCompatView
  readonly onCompatChange?: (next: Partial<ModelGatewayCompatUpdate>) => void
  readonly onSaveCompat?: () => void
  readonly compatDirty?: boolean
}

export function ModelEditor({ item, draft, contextDraft, inputDraft, dirty, busy, palette, t, onLevelChange, onContextChange, onOneMillionChange, onInputChange, onSave, onRestoreReasoning, onRestoreCapability, compatView, onCompatChange, onSaveCompat, compatDirty }: ModelEditorProps): React.ReactElement {
  const levelLabel = (level: typeof ALL_LEVELS[number]): string => t(LEVEL_LABEL_KEYS[level])
  const modelCompat = item.inOverrides && compatView !== undefined ? <>
    {renderGatewayCompatControls({ scope: 'model', view: compatView, onChange: (next) => onCompatChange?.(next as Partial<ModelGatewayCompatUpdate>), disabled: busy || onCompatChange === undefined }, { palette, t })}
    {onSaveCompat ? <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}><ActionButton text={t('saveModelGatewayCompat')} onClick={onSaveCompat} disabled={busy || compatDirty !== true} tone="primary" palette={palette} icon="check" /></div> : null}
  </> : null
  return <div style={{ padding: '8px', borderTop: `1px solid ${palette.divider}`, backgroundColor: palette.group }}>
    {modelCompat}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '6px', marginBottom: '6px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: '8px', minWidth: 0, padding: '7px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.field }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 650 }}><Icon name="context" size={15} /><span>{t('contextLength')}</span></span>
        <input type="number" inputMode="numeric" min={CONTEXT_MIN} max={CONTEXT_MAX} step={1} value={contextDraft.oneMillion ? String(CONTEXT_1M) : contextDraft.value} disabled={busy || contextDraft.oneMillion} placeholder={t('providerDefaultShort')} aria-label={t('contextLength')} onChange={(event) => onContextChange(event.currentTarget.value)} style={{ boxSizing: 'border-box', width: '100%', minWidth: 0, height: '28px', padding: '0 8px', border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '13px', backgroundColor: palette.group, color: palette.text, outline: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', minWidth: 0, fontSize: '12px', whiteSpace: 'nowrap' }}><span>{t('oneMillionMode')}</span><SwitchControl checked={contextDraft.oneMillion} onChange={onOneMillionChange} disabled={busy} label={t('oneMillionMode')} palette={palette} /></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'center', gap: '8px', minWidth: 0, padding: '7px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.field }}>
        <span style={{ fontSize: '13px', fontWeight: 650 }}>{t('inputCapabilities')}</span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', minWidth: 0, fontSize: '12px', whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Icon name="text" size={14} /><span>{t('textInput')}</span></span><SwitchControl checked={inputDraft.text} onChange={(enabled) => onInputChange('text', enabled)} disabled={busy} label={t('textInput')} palette={palette} /></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', minWidth: 0, fontSize: '12px', whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Icon name="image" size={14} /><span>{t('imageInput')}</span></span><SwitchControl checked={inputDraft.image} onChange={(enabled) => onInputChange('image', enabled)} disabled={busy} label={t('imageInput')} palette={palette} /></div>
      </div>
    </div>
    <div style={{ fontSize: '12px', fontWeight: 700, color: palette.secondary, margin: '0 0 4px 2px' }}>{t('reasoningLevels')}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', marginBottom: '2px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.field, overflow: 'hidden' }}>
      {ALL_LEVELS.map((level, index) => {
        const cell = draft[level] ?? { on: false, wire: '' }
        return <div key={level} style={{ display: 'grid', gridTemplateColumns: '44px 58px minmax(0, 1fr)', alignItems: 'center', gap: '8px', minHeight: '30px', padding: '2px 8px', borderBottom: index < ALL_LEVELS.length - 1 ? `1px solid ${palette.divider}` : 'none', backgroundColor: cell.on ? palette.raised : 'transparent', fontSize: '12px' }}>
          <SwitchControl checked={cell.on} onChange={(enabled) => onLevelChange(level, { on: enabled })} disabled={busy} label={`${levelLabel(level)}${t('levelSuffix')}`} palette={palette} />
          <span style={{ width: '58px', fontSize: '13px', fontWeight: 650 }}>{levelLabel(level)}</span>
          {cell.on ? <input type="text" value={cell.wire} disabled={busy} placeholder={level === 'off' ? t('offPlaceholder') : t('wirePlaceholder')} onChange={(event) => onLevelChange(level, { wire: event.currentTarget.value })} style={{ boxSizing: 'border-box', width: '100%', minWidth: 0, height: '26px', padding: '0 8px', border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '13px', backgroundColor: palette.group, color: palette.text, outline: 'none' }} /> : null}
        </div>
      })}
    </div>
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px', paddingTop: '6px', borderTop: `1px solid ${palette.divider}` }}>
      <ActionButton text={dirty ? t('saveChanges') : t('saved')} onClick={onSave} disabled={busy || !dirty} tone="primary" palette={palette} icon="check" label={dirty ? t('saveModelChanges') : t('noPendingChanges')} />
      <ActionButton text={t('restoreReasoning')} onClick={onRestoreReasoning} disabled={busy} tone="secondary" palette={palette} icon="restore" />
      <ActionButton text={t('restoreCapability')} onClick={onRestoreCapability} disabled={busy} tone="danger" palette={palette} icon="restore" />
    </div>
  </div>
}
