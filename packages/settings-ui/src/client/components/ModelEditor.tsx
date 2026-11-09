import React from 'react'
import { ALL_LEVELS, CONTEXT_1M, LEVEL_LABEL_KEYS } from '../constants.js'
import { GATEWAY_COMPAT_FIELD_KEYS, type GatewayCompatFieldKey } from '@hytime/dsh-plugin-kit'
import type { CompactionDraft, ContextDraft, DraftCell, InputDraft, InventoryItem, ModelCompatDirtyFields, ModelGatewayCompatUpdate, ModelGatewayCompatView, ReasoningDraft, Translation } from '@hytime/dsh-plugin-kit'
import type { Palette } from '../theme.js'
import { ActionButton, Icon, SwitchControl } from './Controls.js'
import { renderGatewayCompatControls } from './GatewayCompatControls.js'
import { useAutoSave } from '../section-editor/use-auto-save.js'
import css from '../settings.module.css'

/**
 * What the model editor needs to edit one model's compaction override.
 *
 * The placeholders carry the global percentage as text rather than the value
 * the field should hold: an empty input means "inherit the global ratio", and
 * rendering the inherited number inside it would turn that choice into a pinned
 * override the next time any other field on the model was saved.
 */
export interface ModelCompactionControls {
  readonly draft: CompactionDraft
  /** Placeholder for an unset threshold, already localized ("Follow global 60%"). */
  readonly thresholdPlaceholder: string
  /** Placeholder for an unset retain ratio, already localized. */
  readonly retainPlaceholder: string
  /** Why the current pair would be refused, or `null` when it is savable. */
  readonly problem: string | null
  /**
   * The ratios save themselves once typing pauses, so there is no Save button:
   * an accepted value and a stored one are the same state, and a button would
   * only be a second place for the two to disagree.
   */
  readonly onThresholdChange: (value: string) => void
  readonly onRetainChange: (value: string) => void
  /**
   * Write the pair currently in the fields.
   *
   * Called by the idle timer rather than a button, so it takes no argument: the
   * component that owns the draft is the same one that renders it, and reading
   * the draft at commit time is what makes the write match the visible text.
   */
  readonly onCommit: () => void
}

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
  /**
   * Why this model cannot be saved, or `null`/absent when it can. The Save
   * button is disabled on the same condition and the reason is rendered beside
   * it, so a refused save is explained where the user clicked rather than only
   * in the page-top banner.
   */
  readonly blockedReason?: string | null
  readonly onRestoreReasoning: () => void
  readonly onRestoreCapability: () => void
  readonly compatView?: ModelGatewayCompatView
  readonly onCompatChange?: (next: Partial<ModelGatewayCompatUpdate>) => void
  readonly onSaveCompat?: () => void
  readonly compatDirty?: ModelCompatDirtyFields
  readonly compatExpanded?: boolean
  readonly onToggleCompatExpanded?: () => void
  readonly openCodeSession?: boolean
  readonly openCodeSessionAvailable?: boolean
  readonly onOpenCodeSessionChange?: (enabled: boolean) => void
  /**
   * The per-model compaction override controls. Absent when the host publishes
   * no plugin section, in which case there is nowhere to write the override.
   */
  readonly compaction?: ModelCompactionControls
}

export function ModelEditor({ item, draft, contextDraft, inputDraft, dirty, busy, palette, t, onLevelChange, onContextChange, onOneMillionChange, onInputChange, onSave, blockedReason, onRestoreReasoning, onRestoreCapability, compatView, onCompatChange, onSaveCompat, compatDirty, compatExpanded, onToggleCompatExpanded, openCodeSession, openCodeSessionAvailable = false, onOpenCodeSessionChange, compaction }: ModelEditorProps): React.ReactElement {
  const levelLabel = (level: typeof ALL_LEVELS[number]): string => t(LEVEL_LABEL_KEYS[level])
  // The compaction ratios persist themselves once typing pauses. The pair is
  // written as one leaf, so it is only safe to send when BOTH fields parse and
  // the retain ratio stays below the threshold; an invalid pair keeps its text
  // in the fields and reports why instead of being written and rolled back.
  const compactionDraft = compaction?.draft
  useAutoSave(
    {
      text: compactionDraft === undefined ? '' : `${compactionDraft.threshold}\u0000${compactionDraft.retain}`,
      writable: compaction !== undefined && compaction.problem === null,
      touched: compactionDraft?.touched === true,
    },
    () => { compaction?.onCommit() },
  )
  const anyCompatDirty = compatDirty !== undefined && GATEWAY_COMPAT_FIELD_KEYS.some((key) => compatDirty[key] === true)
  const modelCompatControls = compatView !== undefined
    ? renderGatewayCompatControls({ scope: 'model', view: compatView, onChange: (next) => onCompatChange?.(next as Partial<ModelGatewayCompatUpdate>), disabled: busy || onCompatChange === undefined, expanded: compatExpanded === true, onToggleExpanded: onToggleCompatExpanded, availableCount: GATEWAY_COMPAT_FIELD_KEYS.filter((key) => key !== 'supportsDeveloperRole' && key !== 'maxTokensField' && compatView[`${key}Available` as keyof ModelGatewayCompatView] === true).length }, { palette, t })
    : null
  const modelCompat = modelCompatControls !== null ? <>
    {modelCompatControls}
    {!item.inOverrides ? <div style={{ color: palette.secondary, fontSize: '10px', marginBottom: '6px' }}>{t('modelsArrayCompatSaveNote')}</div> : null}
    {onSaveCompat ? <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}><ActionButton text={t('saveModelGatewayCompat')} onClick={onSaveCompat} disabled={busy || !anyCompatDirty} tone="primary" palette={palette} icon="check" /></div> : null}
  </> : null
  const openCodeSessionEditable = openCodeSessionAvailable && item.modelSourceConflict !== true
  const openCodeSessionControls = openCodeSessionEditable ? <div data-scope="opencode-session" style={{ display: 'grid', gap: '5px', marginBottom: '8px', padding: '8px', border: `0.5px solid ${palette.border}`, borderRadius: '6px', backgroundColor: palette.field }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
      <span style={{ fontSize: '13px', fontWeight: 650 }}>{t('opencodeSessionHeaderTitle')}</span>
      <SwitchControl checked={openCodeSession === true} onChange={(enabled) => onOpenCodeSessionChange?.(enabled)} disabled={busy || onOpenCodeSessionChange === undefined} label={t('opencodeSessionHeaderTitle')} palette={palette} />
    </div>
    <span style={{ color: palette.secondary, fontSize: '11px', lineHeight: '15px' }}>{t('opencodeSessionHeaderDescription')}</span>
  </div> : null
  return <div style={{ padding: '10px 12px 12px', borderTop: `0.5px solid ${palette.divider}`, backgroundColor: palette.canvas }}>
    {openCodeSessionControls}
    {modelCompat}
    <div className={css.pairGrid} style={{ marginBottom: '8px' }}>
      <div className={css.contextRow} style={{ padding: '8px', border: `0.5px solid ${palette.border}`, borderRadius: '6px', backgroundColor: palette.field }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 650 }}><Icon name="context" size={15} /><span>{t('contextLength')}</span></span>
        <input type="text" inputMode="text" value={contextDraft.oneMillion ? String(CONTEXT_1M) : contextDraft.value} disabled={busy || contextDraft.oneMillion} placeholder={t('providerDefaultShort')} aria-label={t('contextLength')} onChange={(event) => onContextChange(event.currentTarget.value)} style={{ boxSizing: 'border-box', width: '100%', minWidth: 0, height: '30px', padding: '0 8px', border: `0.5px solid ${palette.border}`, borderRadius: '6px', fontSize: '13px', backgroundColor: palette.group, color: palette.text, outline: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', minWidth: 0, fontSize: '12px', whiteSpace: 'nowrap' }}><span>{t('oneMillionMode')}</span><SwitchControl checked={contextDraft.oneMillion} onChange={onOneMillionChange} disabled={busy} label={t('oneMillionMode')} palette={palette} /></div>
      </div>
      <div className={css.capabilityRow} style={{ padding: '8px', border: `0.5px solid ${palette.border}`, borderRadius: '6px', backgroundColor: palette.field }}>
        <span style={{ fontSize: '13px', fontWeight: 650 }}>{t('inputCapabilities')}</span>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', minWidth: 0, fontSize: '12px', whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Icon name="text" size={14} /><span>{t('textInput')}</span></span><SwitchControl checked={inputDraft.text} onChange={(enabled) => onInputChange('text', enabled)} disabled={busy} label={t('textInput')} palette={palette} /></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', minWidth: 0, fontSize: '12px', whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Icon name="image" size={14} /><span>{t('imageInput')}</span></span><SwitchControl checked={inputDraft.image} onChange={(enabled) => onInputChange('image', enabled)} disabled={busy} label={t('imageInput')} palette={palette} /></div>
      </div>
    </div>
    <div style={{ fontSize: '12px', fontWeight: 700, color: palette.secondary, margin: '0 0 4px 2px' }}>{t('reasoningLevels')}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', marginBottom: '2px', border: `0.5px solid ${palette.border}`, borderRadius: '6px', backgroundColor: palette.field, overflow: 'hidden' }}>
      {ALL_LEVELS.map((level, index) => {
        const cell = draft[level] ?? { on: false, wire: '' }
        return <div key={level} className={css.levelRow} style={{ minHeight: '36px', padding: '4px 8px', borderBottom: index < ALL_LEVELS.length - 1 ? `0.5px solid ${palette.divider}` : 'none', backgroundColor: cell.on ? palette.raised : 'transparent', fontSize: '12px' }}>
          <SwitchControl checked={cell.on} onChange={(enabled) => onLevelChange(level, { on: enabled })} disabled={busy} label={`${levelLabel(level)}${t('levelSuffix')}`} palette={palette} />
          <span style={{ width: '58px', fontSize: '13px', fontWeight: 650 }}>{levelLabel(level)}</span>
          {cell.on ? <input type="text" value={cell.wire} disabled={busy} placeholder={level === 'off' ? t('offPlaceholder') : t('wirePlaceholder')} onChange={(event) => onLevelChange(level, { wire: event.currentTarget.value })} style={{ boxSizing: 'border-box', width: '100%', minWidth: 0, height: '26px', padding: '0 8px', border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '13px', backgroundColor: palette.group, color: palette.text, outline: 'none' }} /> : null}
        </div>
      })}
    </div>
    {compaction !== undefined ? <div data-scope="compaction" style={{ display: 'grid', gap: '5px', marginTop: '8px', padding: '8px', border: `0.5px solid ${palette.border}`, borderRadius: '6px', backgroundColor: palette.field }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 650 }}><Icon name="sparkles" size={15} /><span>{t('compactionSectionTitle')}</span></span>
      </div>
      {/* There is no on/off switch: the percentages are the configuration, and
          an unset field inherits the global ratio. A switch would have to mean
          "do not compact at all", which this plugin cannot offer — DSH runs its
          own automatic pass regardless of anything set here. */}
      <div data-scope="compaction-scope" style={{ color: palette.secondary, fontSize: '11px', lineHeight: '15px' }}>{t('compactionSectionHint')}</div>
      <label className={css.labelControlRow} style={{ fontSize: '12px', color: palette.text }}><span style={{ display: 'grid', gap: '1px', minWidth: 0 }}><span>{t('compactionThreshold')}</span><span style={{ color: palette.secondary, fontSize: '10px', lineHeight: '13px' }}>{t('compactionThresholdHint')}</span></span><span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}><input type="text" inputMode="decimal" value={compaction.draft.threshold} disabled={busy} placeholder={compaction.thresholdPlaceholder} aria-label={t('compactionThreshold')} onChange={(event) => compaction.onThresholdChange(event.currentTarget.value)} style={{ boxSizing: 'border-box', width: '100%', minWidth: 0, height: '28px', padding: '0 8px', border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '13px', backgroundColor: palette.group, color: palette.text, outline: 'none' }} /><span style={{ color: palette.secondary, fontSize: '11px' }}>%</span></span></label>
      <label className={css.labelControlRow} style={{ fontSize: '12px', color: palette.text }}><span style={{ display: 'grid', gap: '1px', minWidth: 0 }}><span>{t('compactionRetain')}</span><span style={{ color: palette.secondary, fontSize: '10px', lineHeight: '13px' }}>{t('compactionRetainHint')}</span></span><span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}><input type="text" inputMode="decimal" value={compaction.draft.retain} disabled={busy} placeholder={compaction.retainPlaceholder} aria-label={t('compactionRetain')} onChange={(event) => compaction.onRetainChange(event.currentTarget.value)} style={{ boxSizing: 'border-box', width: '100%', minWidth: 0, height: '28px', padding: '0 8px', border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '13px', backgroundColor: palette.group, color: palette.text, outline: 'none' }} /><span style={{ color: palette.secondary, fontSize: '11px' }}>%</span></span></label>
      {/* The refusal is rendered here rather than in the page-top banner so the
          reason sits beside the field the user is typing into. It is also what
          keeps the field unsaved: an invalid pair is never written, because a
          rejected write would roll the user's typing back under them. */}
      {compaction.problem !== null ? <div aria-live="polite" data-scope="compaction-problem" style={{ padding: '5px 8px', border: `1px solid ${palette.dangerBorder}`, borderRadius: '6px', color: palette.danger, backgroundColor: palette.dangerBg, fontSize: '11px', lineHeight: '15px' }}>{compaction.problem}</div> : <div data-scope="compaction-autosave" style={{ color: palette.secondary, fontSize: '10px', lineHeight: '14px' }}>{t('compactionAutoSave')}</div>}
    </div> : null}
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px', paddingTop: '6px', borderTop: `1px solid ${palette.divider}` }}>
      <ActionButton text={dirty ? t('saveChanges') : t('saved')} onClick={onSave} disabled={busy || !dirty || blockedReason != null} tone="primary" palette={palette} icon="check" label={dirty ? t('saveModelChanges') : t('noPendingChanges')} />
      <ActionButton text={t('restoreReasoning')} onClick={onRestoreReasoning} disabled={busy} tone="secondary" palette={palette} icon="restore" />
      <ActionButton text={t('restoreCapability')} onClick={onRestoreCapability} disabled={busy} tone="danger" palette={palette} icon="restore" />
    </div>
    {/* The reason sits under the row it blocks, so the user does not have to
        find the page-top banner to learn why Save is unavailable. It appears
        only once the model has pending changes: an untouched model that is
        already unsavable would otherwise wear a permanent warning the user
        never asked about. It is a polite live region rather than a second
        `role="alert"`, so a refusal is not announced twice. */}
    {dirty && blockedReason != null ? <div aria-live="polite" data-scope="model-save-blocked" style={{ marginTop: '6px', padding: '6px 8px', border: `1px solid ${palette.dangerBorder}`, borderRadius: '6px', color: palette.danger, backgroundColor: palette.dangerBg, fontSize: '12px', lineHeight: '18px' }}>{blockedReason}</div> : null}
  </div>
}
