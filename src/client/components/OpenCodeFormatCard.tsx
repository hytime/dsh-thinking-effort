import React from 'react'
import { ActionButton, Icon } from './Controls.js'
import {
  DEFAULT_FORMAT_DRAFT,
  draftFromSettings,
  FORMAT_INVALID_POLICIES,
  FORMAT_KEYS,
  FORMAT_MODES,
  FORMAT_TIMES,
  formatFieldErrors,
  formatOps,
  FORMAT_NAMESPACE,
} from '../opencode-format-validation.js'
import type { FormatDraft, FormatField, FormatFieldError } from '../opencode-format-validation.js'
import type { OpenCodeSessionFormatMode, OpenCodeSessionInvalidPolicy } from '../../compat/opencode-session.js'
import type { Palette } from '../theme.js'
import type { SettingsApi, SettingsDescribeValue, SettingsNamespace, Translation } from '../types.js'

/**
 * Localization keys for the five generator modes. Typed as a complete map over
 * the shared mode list, so adding a mode there without a label here is a type
 * error rather than an option that renders its raw key name.
 */
const MODE_LABEL_KEYS: Readonly<Record<OpenCodeSessionFormatMode, string>> = {
  'ses-derive': 'formatModeSesDerive',
  'passthrough': 'formatModePassthrough',
  'template': 'formatModeTemplate',
  'expression': 'formatModeExpression',
  'script': 'formatModeScript',
}

/** Localization key naming each enum field in the fallback notice. */
const ENUM_LABEL_KEYS: Readonly<Partial<Record<FormatField, string>>> = {
  mode: 'formatModeLabel',
  time: 'formatTimeLabel',
  onInvalid: 'formatOnInvalidLabel',
}

/** Localization keys for the three invalid policies, in `FORMAT_INVALID_POLICIES` order. */
const POLICY_LABEL_KEYS: Readonly<Record<OpenCodeSessionInvalidPolicy, string>> = {
  'warn': 'formatOnInvalidWarn',
  'drop': 'formatOnInvalidDrop',
  'send': 'formatOnInvalidSend',
}

/**
 * Localization key per validation problem.
 *
 * Every `FormatFieldError` needs an entry: the card has already refused the
 * write at this point, so an unmapped problem would show its raw key name and
 * leave the user without the reason the Apply button is dark.
 */
const ERROR_LABEL_KEYS: Readonly<Record<FormatFieldError, string>> = {
  validateRegex: 'formatErrValidateRegex',
  templateRequired: 'formatErrTemplateRequired',
  expressionRequired: 'formatErrExpressionRequired',
  expressionSyntax: 'formatErrExpressionSyntax',
  expressionUnknownName: 'formatErrExpressionUnknownName',
  scriptRequired: 'formatErrScriptRequired',
  scriptNotAbsolute: 'formatErrScriptNotAbsolute',
}

/** The hint key shown under each free-text field, keyed by field. */
const HINT_LABEL_KEYS: Readonly<Partial<Record<FormatField, string>>> = {
  template: 'formatTemplateHint',
  expression: 'formatExpressionHint',
  script: 'formatScriptHint',
  validate: 'formatValidateHint',
}

/**
 * The modes whose value consumes the timestamp source. Only `passthrough`
 * never does: it hands `request.sessionId` straight to validation, while
 * `ses-derive` derives from the source and `template`, `expression` and
 * `script` all read `hex12` through `context(request, session, config.time)` —
 * as does `derive(session, config.time)`, which each of them falls back to when
 * its source is empty or fails.
 *
 * Derived from the shared mode list rather than listed again, so a mode added
 * there is offered its timestamp source by default instead of silently losing
 * the control.
 */
const TIME_MODES: readonly OpenCodeSessionFormatMode[] =
  FORMAT_MODES.filter((mode) => mode !== 'passthrough')

export interface OpenCodeFormatCardProps {
  readonly settings: SettingsApi
  readonly palette: Palette
  readonly t: Translation
  /**
   * A value that changes on every read the surrounding editor performs for this
   * namespace — the backup card importing a snapshot, the model editor's
   * session switch, this card's own successful write. Every change re-reads the
   * stored draft, so the controls never keep a draft a page-mate has since
   * retired. It is compared for inequality only, so a read counter serves as
   * well as the namespace revision and does not miss a second read that lands
   * on the same revision.
   */
  readonly revision?: number
  /**
   * Called after a successful write. This card shares its namespace with the
   * model editor's session switch, so the surrounding editor has to re-read the
   * registry too or its next write goes out with the revision this one retired.
   */
  readonly onApplied?: () => void
}

interface CardState {
  open: boolean
  /** The stored draft the controls were populated from. */
  saved: FormatDraft
  /** The edited draft awaiting Apply. */
  draft: FormatDraft
  /** Stored enum values the Host would reject, and what it resolves them to. */
  unsupportedStored: readonly { field: FormatField; fallback: string }[]
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
  unsupportedStored: [],
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

/**
 * Stored enum values the Host would reject, with the value it resolves them to.
 *
 * All three enum fields are reported, not just `mode`: a hand-written document
 * can put garbage in any of them, and showing the resolved default without
 * saying so leaves the user unable to tell "stored as firstUse" from "stored as
 * garbage, resolved to firstUse".
 */
function unsupportedStoredEnums(stored: unknown): readonly { field: FormatField; fallback: string }[] {
  const format = ownRecord(ownRecord(stored, 'opencodeSession'), 'format')
  const found: { field: FormatField; fallback: string }[] = []
  const check = (field: FormatField, allowed: readonly string[], fallback: string): void => {
    const value = ownValue(format, field)
    if (value !== undefined && !allowed.includes(String(value))) found.push({ field, fallback })
  }
  check('mode', FORMAT_MODES, DEFAULT_FORMAT_DRAFT.mode)
  check('time', FORMAT_TIMES, DEFAULT_FORMAT_DRAFT.time)
  check('onInvalid', FORMAT_INVALID_POLICIES, DEFAULT_FORMAT_DRAFT.onInvalid)
  return found
}

/** Read one own property of a possibly-absent record. */
function ownValue(object: Record<string, unknown> | undefined, key: string): unknown {
  if (object === undefined || !Object.prototype.hasOwnProperty.call(object, key)) return undefined
  return object[key]
}

/** Read one own property that must itself be a record. */
function ownRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const object = value as Record<string, unknown>
  if (!Object.prototype.hasOwnProperty.call(object, key)) return undefined
  const nested = object[key]
  return typeof nested === 'object' && nested !== null && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : undefined
}

const isConflict = (message: string): boolean => /conflict/i.test(message)

export function OpenCodeFormatCard({ settings, palette, t, revision, onApplied }: OpenCodeFormatCardProps): React.ReactElement {
  const [state, setState] = React.useState<CardState>(initialState)
  /**
   * The latest state, for the async callbacks below. `apply` re-reads the
   * registry before writing, and by the time that read lands the user may have
   * typed into a field this card did not re-render for; the draft that gets
   * written has to be the one on screen at that moment, not the one captured
   * when Apply was clicked.
   */
  const stateRef = React.useRef(state)
  stateRef.current = state

  /**
   * Fold one read into the card's state.
   *
   * A field the user has already edited (`draft` differs from `saved`) keeps
   * its draft; every other field takes the freshly read value. That keeps the
   * card from writing back the values it read before a page-mate — the backup
   * card's import, the model editor's session switch — changed this namespace:
   * with the whole draft replaced, the next Apply would present those retired
   * values as edits and silently undo the other write. `saved` always advances
   * to the fresh read, so it stays the single reference for "unchanged".
   */
  const applyRead = (current: CardState, value: SettingsDescribeValue): CardState => {
    const user = userOf(value.namespaces)
    const fresh = draftFromSettings(user)
    let draft = current.draft
    for (const key of FORMAT_KEYS) {
      if (draft[key] === current.saved[key]) draft = { ...draft, [key]: fresh[key] }
    }
    return {
      ...current,
      saved: fresh,
      draft,
      unsupportedStored: unsupportedStoredEnums(user),
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

  React.useEffect(() => { load() }, [revision])

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
      const stored = draftFromSettings(userOf(response.value.namespaces))
      const ops = formatOps(stateRef.current.draft, stored)
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
        onApplied?.()
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

  const errorFor = (field: FormatField): FormatFieldError | undefined =>
    errors.find((problem) => problem.field === field)?.error

  /**
   * One free-text field with its hint and, when the draft has a problem, the
   * reason the write is refused. Defined below `errors` on purpose: it closes
   * over that value, and moving it above would read it before initialization.
   */
  const textField = (field: FormatField, labelKey: string): React.ReactElement => {
    const problem = errorFor(field)
    return <div style={{ display: 'grid', gap: '3px' }}>
      <label style={rowStyle}>
        <span style={labelStyle}>{t(labelKey)}</span>
        <input
          type="text"
          value={state.draft[field]}
          aria-label={t(labelKey)}
          aria-invalid={problem === undefined ? undefined : true}
          disabled={state.busy}
          onChange={(event) => patch(field, event.currentTarget.value)}
          // `color` and `borderColor` are assigned on every render, not only
          // while invalid: dropping either one makes React strip a longhand it
          // had set before, and it warns when a shorthand from `selectStyle`
          // (`border`) sits beside the longhand it is removing.
          style={{
            ...selectStyle(palette),
            borderColor: problem === undefined ? palette.border : palette.danger,
            color: problem === undefined ? palette.text : palette.danger,
          }}
        />
      </label>
      <span style={{ fontSize: '11px', color: palette.secondary, lineHeight: '15px' }}>{t(HINT_LABEL_KEYS[field]!)}</span>
      {problem === undefined ? null : <span role="alert" style={{ fontSize: '11px', color: palette.danger, lineHeight: '15px' }}>{t(ERROR_LABEL_KEYS[problem])}</span>}
    </div>
  }

  const modeSelect = (
    <select
      value={state.draft.mode}
      aria-label={t('formatModeLabel')}
      disabled={state.busy}
      onChange={(event) => patch('mode', event.currentTarget.value)}
      style={selectStyle(palette)}
    >
      {FORMAT_MODES.map((mode) => <option key={mode} value={mode}>{t(MODE_LABEL_KEYS[mode])}</option>)}
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
          {t('formatCardHint', { mode: t(MODE_LABEL_KEYS[state.saved.mode as OpenCodeSessionFormatMode] ?? 'formatModeSesDerive') })}
        </span>
        <Icon name={state.open ? 'chevronUp' : 'chevronDown'} size={14} />
      </button>
    </div>
    {state.error ? <div role="alert" aria-live="assertive" style={{ fontSize: '12px', lineHeight: '18px', color: palette.danger, backgroundColor: palette.dangerBg, border: `1px solid ${palette.dangerBorder}`, borderRadius: '8px', padding: '6px 8px', margin: '0 8px 8px' }}>{state.error}</div> : null}
    {state.notice === null ? null : <div role="status" aria-live="polite" style={{ fontSize: '12px', lineHeight: '18px', color: palette.accent, backgroundColor: palette.accentSoft, border: `1px solid ${palette.accentBorder}`, borderRadius: '8px', padding: '6px 8px', margin: '0 8px 8px' }}>{state.notice}</div>}
    {state.open ? <div style={{ display: 'grid', gap: '9px', padding: '8px', borderTop: `1px solid ${palette.divider}` }}>
      {state.unsupportedStored.length === 0 ? null : <div style={{ fontSize: '11px', color: palette.secondary }}>
        {t('formatUnsupportedStored', {
          detail: state.unsupportedStored.map((entry) => `${t(ENUM_LABEL_KEYS[entry.field]!)} → ${entry.fallback}`).join(', '),
        })}
      </div>}
      <label style={rowStyle}>
        <span style={labelStyle}>{t('formatModeLabel')}</span>
        {modeSelect}
      </label>
      {timeSelect === null ? null : <label style={rowStyle}>
        <span style={labelStyle}>{t('formatTimeLabel')}</span>
        {timeSelect}
      </label>}
      {state.draft.mode === 'template' ? textField('template', 'formatTemplateLabel') : null}
      {state.draft.mode === 'expression' ? textField('expression', 'formatExpressionLabel') : null}
      {state.draft.mode === 'script' ? textField('script', 'formatScriptLabel') : null}
      {textField('validate', 'formatValidateLabel')}
      {state.draft.validate.trim() === '' ? null : <label style={rowStyle}>
        <span style={labelStyle}>{t('formatOnInvalidLabel')}</span>
        <select
          value={state.draft.onInvalid}
          aria-label={t('formatOnInvalidLabel')}
          disabled={state.busy}
          onChange={(event) => patch('onInvalid', event.currentTarget.value)}
          style={selectStyle(palette)}
        >
          {FORMAT_INVALID_POLICIES.map((policy) => <option key={policy} value={policy}>{t(POLICY_LABEL_KEYS[policy])}</option>)}
        </select>
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
