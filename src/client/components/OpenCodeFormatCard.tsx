import React from 'react'
import { ActionButton, Icon } from './Controls.js'
import {
  DEFAULT_FORMAT_DRAFT,
  draftFromSettings,
  FORMAT_MODES,
  formatFieldErrors,
  formatOps,
  FORMAT_NAMESPACE,
} from '../opencode-format-validation.js'
import type { FormatDraft } from '../opencode-format-validation.js'
import type { Palette } from '../theme.js'
import type { SettingsApi, SettingsDescribeValue, SettingsNamespace, Translation } from '../types.js'

/** Localization keys for the five generator modes, in `FORMAT_MODES` order. */
const MODE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'ses-derive': 'formatModeSesDerive',
  'passthrough': 'formatModePassthrough',
  'template': 'formatModeTemplate',
  'expression': 'formatModeExpression',
  'script': 'formatModeScript',
}

/** The modes that read a timestamp source; the others never consult it. */
const TIME_MODES = ['ses-derive', 'template'] as const

export interface OpenCodeFormatCardProps {
  readonly settings: SettingsApi
  readonly palette: Palette
  readonly t: Translation
}

interface CardState {
  open: boolean
  /** The stored draft the controls were populated from. */
  saved: FormatDraft
  /** The edited draft awaiting Apply. */
  draft: FormatDraft
  /** True when the stored `mode` was not one this card offers. */
  unsupportedStored: boolean
  /**
   * Whether the active settings provider accepts writes. It lives on the
   * `describe()` result, not on `SettingsApi`, and is optional there.
   */
  writable: boolean
  busy: boolean
  error: string | null
  notice: string | null
}

const initialState: CardState = {
  open: false,
  saved: DEFAULT_FORMAT_DRAFT,
  draft: DEFAULT_FORMAT_DRAFT,
  unsupportedStored: false,
  writable: true,
  busy: false,
  error: null,
  notice: null,
}

function revisionOf(namespaces: readonly SettingsNamespace[]): number {
  return namespaces.find((entry) => entry.ns === FORMAT_NAMESPACE)?.revision ?? 0
}

function userOf(namespaces: readonly SettingsNamespace[]): Record<string, unknown> | undefined {
  return namespaces.find((entry) => entry.ns === FORMAT_NAMESPACE)?.user
}

/** Whether the stored mode was one this card can present. */
function storedModeUnsupported(stored: unknown): boolean {
  if (typeof stored !== 'object' || stored === null) return false
  const session = (stored as Record<string, unknown>)['opencodeSession']
  if (typeof session !== 'object' || session === null) return false
  const format = (session as Record<string, unknown>)['format']
  if (typeof format !== 'object' || format === null) return false
  const mode = (format as Record<string, unknown>)['mode']
  return mode !== undefined && !(FORMAT_MODES as readonly string[]).includes(String(mode))
}

const isConflict = (message: string): boolean => /conflict/i.test(message)

export function OpenCodeFormatCard({ settings, palette, t }: OpenCodeFormatCardProps): React.ReactElement {
  const [state, setState] = React.useState<CardState>(initialState)

  const applyRead = (current: CardState, value: SettingsDescribeValue): CardState => {
    const user = userOf(value.namespaces)
    const draft = draftFromSettings(user)
    return {
      ...current,
      saved: draft,
      draft,
      unsupportedStored: storedModeUnsupported(user),
      writable: value.writable !== false,
      busy: false,
      error: null,
    }
  }

  const load = (): void => {
    settings.describe().then((response) => {
      if (!response.ok) {
        setState((current) => ({ ...current, busy: false, error: response.error.message }))
        return
      }
      setState((current) => applyRead(current, response.value))
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setState((current) => ({ ...current, busy: false, error: message }))
    })
  }

  React.useEffect(() => { load() }, [])

  const patch = (field: keyof FormatDraft, value: string): void => {
    setState((current) => ({ ...current, notice: null, error: null, draft: { ...current.draft, [field]: value } }))
  }

  /**
   * Apply the draft. The registry is described again first: the model editor's
   * session switch and the backup card both write this namespace, so the
   * revision this card mounted with can already be stale, and a stale write is
   * refused by the host.
   */
  const apply = (): void => {
    setState((current) => ({ ...current, busy: true, error: null, notice: null }))
    settings.describe().then((response) => {
      if (!response.ok) {
        setState((current) => ({ ...current, busy: false, error: response.error.message }))
        return undefined
      }
      const ops = formatOps(state.draft, draftFromSettings(userOf(response.value.namespaces)))
      if (ops.length === 0) {
        setState((current) => ({ ...current, busy: false, saved: current.draft, notice: t('formatSaved') }))
        return undefined
      }
      return settings.mutate(FORMAT_NAMESPACE, ops, revisionOf(response.value.namespaces)).then((written) => {
        if (!written.ok) {
          const message = written.error.message
          setState((current) => ({
            ...current,
            busy: false,
            error: isConflict(message) ? t('formatConflict') : t('formatSaveFailed', { message }),
          }))
          return undefined
        }
        setState((current) => ({ ...current, busy: false, saved: current.draft, notice: t('formatSaved') }))
        load()
        return undefined
      })
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setState((current) => ({ ...current, busy: false, error: t('formatSaveFailed', { message }) }))
    })
  }

  /** Validation problems for the current draft; used by the disabled state and the field errors. */
  const errors = formatFieldErrors(state.draft)
  const dirty = formatOps(state.draft, state.saved).length > 0
  const blocked = dirty && errors.length > 0
  const readOnly = !state.writable

  const modeSelect = (
    <select
      value={state.draft.mode}
      aria-label={t('formatModeLabel')}
      disabled={state.busy}
      onChange={(event) => patch('mode', event.currentTarget.value)}
      style={selectStyle(palette)}
    >
      {FORMAT_MODES.map((mode) => <option key={mode} value={mode}>{t(MODE_LABEL_KEYS[mode]!)}</option>)}
    </select>
  )

  const timeSelect = (TIME_MODES as readonly string[]).includes(state.draft.mode)
    ? <select
        value={state.draft.time}
        aria-label={t('formatTimeLabel')}
        disabled={state.busy}
        onChange={(event) => patch('time', event.currentTarget.value)}
        style={selectStyle(palette)}
      >
        <option value="firstUse">{t('formatTimeFirstUse')}</option>
        <option value="hash">{t('formatTimeHash')}</option>
      </select>
    : null

  return <div style={{ backgroundColor: palette.group, border: `1px solid ${palette.border}`, borderRadius: '8px', boxShadow: palette.shadow, overflow: 'hidden', marginBottom: '8px' }} data-scope="opencode-format">
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 8px 6px' }}>
      <Icon name="sliders" size={15} />
      <button
        type="button"
        aria-label={t('formatCardTitle')}
        aria-expanded={state.open}
        onClick={() => setState((current) => ({ ...current, open: !current.open }))}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 auto', minWidth: 0, padding: 0, border: 'none', background: 'transparent', color: palette.text, font: 'inherit', fontSize: '13px', fontWeight: 700, letterSpacing: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <span>{t('formatCardTitle')}</span>
        <span style={{ marginLeft: 'auto', color: palette.secondary, fontSize: '11px', fontWeight: 600 }}>
          {t('formatCardHint', { mode: t(MODE_LABEL_KEYS[state.saved.mode] ?? 'formatModeSesDerive') })}
        </span>
        <Icon name={state.open ? 'chevronUp' : 'chevronDown'} size={14} />
      </button>
    </div>
    {state.error ? <div role="alert" aria-live="assertive" style={{ fontSize: '12px', lineHeight: '18px', color: palette.danger, backgroundColor: palette.dangerBg, border: `1px solid ${palette.dangerBorder}`, borderRadius: '8px', padding: '6px 8px', margin: '0 8px 8px' }}>{state.error}</div> : null}
    {state.notice === null ? null : <div role="status" aria-live="polite" style={{ fontSize: '12px', lineHeight: '18px', color: palette.accent, backgroundColor: palette.accentSoft, border: `1px solid ${palette.accentBorder}`, borderRadius: '8px', padding: '6px 8px', margin: '0 8px 8px' }}>{state.notice}</div>}
    {state.open ? <div style={{ display: 'grid', gap: '9px', padding: '8px', borderTop: `1px solid ${palette.divider}` }}>
      {state.unsupportedStored ? <div style={{ fontSize: '11px', color: palette.secondary }}>{t('formatUnsupportedStored')}</div> : null}
      <label style={rowStyle}>
        <span style={labelStyle}>{t('formatModeLabel')}</span>
        {modeSelect}
      </label>
      {timeSelect === null ? null : <label style={rowStyle}>
        <span style={labelStyle}>{t('formatTimeLabel')}</span>
        {timeSelect}
      </label>}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <ActionButton text={t('formatApply')} onClick={apply} disabled={state.busy || readOnly || !dirty || blocked} tone="primary" palette={palette} icon="check" />
      </div>
    </div> : null}
  </div>
}

const rowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'center', gap: '8px' }
const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 600 }
const selectStyle = (palette: Palette): React.CSSProperties => ({
  height: '28px', minWidth: '180px', maxWidth: '100%', padding: '0 10px',
  border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '13px',
  backgroundColor: palette.field, color: palette.text, colorScheme: 'light dark', boxShadow: palette.shadow,
})
