import React from 'react'
import { ALL_LEVELS } from '../constants.js'
import type { ContextDraft, DraftCell, InputDraft, InventoryItem, ModelCompatDirtyFields, ModelGatewayCompatUpdate, ModelGatewayCompatView, ReasoningDraft, Translation } from '../types.js'
import type { Palette } from '../theme.js'
import { ActionButton, Icon } from './Controls.js'
import { ModelEditor } from './ModelEditor.js'

export interface ModelRowProps {
  readonly item: InventoryItem
  readonly open: boolean
  readonly draft?: ReasoningDraft
  readonly contextDraft: ContextDraft
  readonly inputDraft: InputDraft
  readonly dirty: boolean
  readonly busy: boolean
  readonly palette: Palette
  readonly t: Translation
  readonly onToggle: () => void
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
  readonly compatDirty?: ModelCompatDirtyFields
  readonly compatExpanded?: boolean
  readonly onToggleCompatExpanded?: () => void
}

function modelSummary(item: InventoryItem, t: Translation): { text: boolean; image: boolean; context?: { label: string; title: string } } {
  const input = item.input.length > 0 ? item.input : ['text']
  const value = item.contextWindow
  return {
    text: input.includes('text'),
    image: input.includes('image'),
    context: Number.isInteger(value)
      ? { label: value === 1000000 ? '1M' : value! >= 1024 ? `${Math.round(value! / 1024)}K` : String(value), title: t('contextTitle', { value }) }
      : undefined,
  }
}

export function ModelRow({ item, open, draft, contextDraft, inputDraft, dirty, busy, palette, t, onToggle, onLevelChange, onContextChange, onOneMillionChange, onInputChange, onSave, onRestoreReasoning, onRestoreCapability, compatView, onCompatChange, onSaveCompat, compatDirty, compatExpanded, onToggleCompatExpanded }: ModelRowProps): React.ReactElement {
  const summary = modelSummary(item, t)
  const hasCompatDirty = compatDirty !== undefined && Object.values(compatDirty).some((value) => value === true)
  return <div style={{ border: `1px solid ${open ? palette.accent : dirty || hasCompatDirty ? palette.accentBorder : palette.border}`, borderRadius: '8px', marginBottom: '4px', backgroundColor: open ? palette.raised : palette.group, boxShadow: palette.shadow, overflow: 'hidden', transition: 'background-color 160ms ease, border-color 160ms ease' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: '8px', minHeight: '42px', padding: '4px 6px 4px 8px' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', minWidth: '22px', borderRadius: '7px', color: palette.accent, backgroundColor: palette.field }}><Icon name="model" size={14} /></span><span style={{ display: 'grid', gap: '1px', minWidth: 0 }}><span style={{ minWidth: 0, fontSize: '13px', lineHeight: '15px', fontWeight: 700, overflowWrap: 'anywhere' }}>{item.model}</span><span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', lineHeight: '11px', color: palette.secondary }}><span>{t('model')}</span>{dirty || hasCompatDirty ? <span title={t('unsaved')} style={{ padding: '1px 4px', border: `1px solid ${palette.accentBorder}`, borderRadius: '5px', color: palette.accent, backgroundColor: palette.accentSoft, fontSize: '9px', lineHeight: '11px', fontWeight: 700 }}>{t('unsaved')}</span> : null}</span></span></span>
      <span style={{ display: 'grid', gridTemplateColumns: '154px 28px', columnGap: '8px', alignItems: 'center' }}><span style={{ display: 'grid', gridTemplateColumns: '22px 22px minmax(86px, 1fr)', columnGap: '8px', alignItems: 'center', color: palette.secondary }}><span title={summary.text ? t('textEnabled') : t('textDisabled')} aria-label={summary.text ? t('textEnabled') : t('textDisabled')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', color: summary.text ? palette.accent : palette.secondary, border: `1px solid ${summary.text ? palette.accentBorder : palette.border}`, borderRadius: '6px', backgroundColor: summary.text ? palette.accentSoft : palette.raised }}><Icon name="text" size={14} /></span><span title={summary.image ? t('imageEnabled') : t('imageDisabled')} aria-label={summary.image ? t('imageEnabled') : t('imageDisabled')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', color: summary.image ? palette.accent : palette.secondary, border: `1px solid ${summary.image ? palette.accentBorder : palette.border}`, borderRadius: '6px', backgroundColor: summary.image ? palette.accentSoft : palette.raised }}><Icon name="image" size={14} /></span><span title={summary.context?.title} aria-label={summary.context?.title} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minHeight: '22px', padding: summary.context ? '0 5px' : 0, border: summary.context ? `1px solid ${palette.border}` : '1px solid transparent', borderRadius: '6px', backgroundColor: summary.context ? palette.raised : 'transparent', whiteSpace: 'nowrap' }}>{summary.context ? <><Icon name="context" size={14} /><span style={{ fontSize: '11px', fontWeight: 700 }}>{t('contextLabel', { label: summary.context.label })}</span></> : null}</span></span><ActionButton text="" onClick={onToggle} palette={palette} tone="ghost" icon={open ? 'chevronUp' : 'settings'} label={open ? t('closeModelSettings') : t('openModelSettings')} /></span>
    </div>
    {open && draft ? <ModelEditor item={item} draft={draft} contextDraft={contextDraft} inputDraft={inputDraft} dirty={dirty} busy={busy} palette={palette} t={t} onLevelChange={onLevelChange} onContextChange={onContextChange} onOneMillionChange={onOneMillionChange} onInputChange={onInputChange} onSave={onSave} onRestoreReasoning={onRestoreReasoning} onRestoreCapability={onRestoreCapability} compatView={compatView} onCompatChange={onCompatChange} onSaveCompat={onSaveCompat} compatDirty={compatDirty} compatExpanded={compatExpanded} onToggleCompatExpanded={onToggleCompatExpanded} /> : null}
  </div>
}
