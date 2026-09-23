import React from 'react'
import packageJson from '@hytime/dsh-thinking-effort/package.json' with { type: 'json' }
import { LEGACY_FAILED_PREFIX, legacyMigrationOf } from '../../compat/legacy-migration.js'
import { downloadJson as browserDownloadJson, type DownloadJson } from '../browser-download.js'
import { applySnapshot } from '../config-snapshot/apply.js'
import {
  autoBackupFromNamespaces,
  deleteProfileOps,
  profilesFromNamespaces,
  saveProfileOps,
  validateProfileName,
} from '../config-snapshot/library.js'
import { parseSnapshot, serializeSnapshot } from '../config-snapshot/parse.js'
import { planImport } from '../config-snapshot/plan.js'
import { isSnapshotLibraryKey, pluginSectionKey, snapshotFileName, snapshotFromNamespaces } from '../config-snapshot/snapshot.js'
import { pluginSection, pluginSectionId } from '../subagent-section.js'
import {
  MAX_PROFILES,
  MAX_PROFILE_NAME,
  type ApplyOutcome,
  type ConfigSnapshot,
  type ImportMode,
  type ParseFailure,
  type ProfileNameError,
  type SnapshotMeta,
} from '../config-snapshot/types.js'
import { ActionButton, Icon } from './Controls.js'
import type { Palette } from '../theme.js'
import type { SettingsApi, SettingsDescribeValue, SettingsNamespace, Translation } from '../types.js'

const PLUGIN_VERSION = packageJson.version

const PARSE_ERROR_KEYS: Record<ParseFailure['code'], string> = {
  tooLarge: 'backupParseTooLarge',
  invalidJson: 'backupParseInvalidJson',
  notObject: 'backupParseNotObject',
  kindMismatch: 'backupParseKindMismatch',
  unsupportedVersion: 'backupParseVersion',
  missingSections: 'backupParseSections',
  invalidSection: 'backupParseSection',
  reservedKey: 'backupParseReserved',
}

const NAME_ERROR_KEYS: Record<ProfileNameError, string> = {
  required: 'backupNameRequired',
  tooLong: 'backupNameTooLong',
  reserved: 'backupNameReserved',
  invalid: 'backupNameInvalid',
  taken: 'backupNameTaken',
}

export interface ConfigBackupCardProps {
  readonly settings: SettingsApi
  readonly palette: Palette
  readonly t: Translation
  readonly onApplied: () => void
  readonly download?: DownloadJson
  readonly now?: () => Date
}

interface PendingImport {
  readonly snapshot: ConfigSnapshot
  readonly label: string
  readonly ignored: readonly string[]
}

interface FreshSettings {
  readonly snapshot: ConfigSnapshot
  /** The plugin namespace's revision in the same read, so a write is guarded with the data it was built from. */
  readonly revision: number
}

interface CardState {
  open: boolean
  namespaces: readonly SettingsNamespace[]
  writable: boolean
  profiles: Record<string, ConfigSnapshot>
  profileNames: readonly string[]
  autoBackupAt: string | null
  nameDraft: string
  pendingDelete: string | null
  preview: PendingImport | null
  mode: ImportMode
  /** Opt-in to importing endpoint / credential / script wiring. Never sticky. */
  importWiring: boolean
  busy: boolean
  error: string | null
  /** Lines shown in the status block: the apply result, plus any warning that came with it. */
  notice: readonly string[]
}

const initialState: CardState = {
  open: false, namespaces: [], writable: true, profiles: {}, profileNames: [],
  autoBackupAt: null, nameDraft: '', pendingDelete: null, preview: null, mode: 'merge', importWiring: false,
  busy: false, error: null, notice: [],
}

export function ConfigBackupCard({ settings, palette, t, onApplied, download = browserDownloadJson, now }: ConfigBackupCardProps): React.ReactElement {
  const [state, setState] = React.useState<CardState>(initialState)
  const fileInput = React.useRef<HTMLInputElement>(null)
  /**
   * Ordinal of the newest file read. Two selections in quick succession can
   * resolve out of order, and the slower earlier read would otherwise install
   * its preview over the file the user chose last — and confirmation writes the
   * preview, so the token is what keeps consent attached to the last choice.
   */
  const readToken = React.useRef(0)
  const clock = (): Date => (now ?? (() => new Date()))()

  // One describe answer is the whole registry, and three consumers read it —
  // the profile library, the export snapshot and the import summary — so they
  // all take it through this mapping and cannot disagree about what the
  // settings hold. The library readers resolve the plugin section's id from
  // this same read, so under the 0.1.7 entry-config model they key on the
  // Loader entry rather than the legacy registered namespace.
  const withNamespaces = (current: CardState, value: SettingsDescribeValue): CardState => {
    const namespaces = value.namespaces
    const profiles = profilesFromNamespaces(namespaces)
    return {
      ...current,
      namespaces,
      writable: value.writable !== false,
      profiles,
      profileNames: Object.keys(profiles).sort(),
      autoBackupAt: autoBackupFromNamespaces(namespaces)?.createdAt ?? null,
    }
  }

  /**
   * Re-read the registry into the card. The refresh writes only the fields it
   * read, and never the error slot: every caller that means to clear a failure
   * clears it on the way into its own action, while a partial apply installs its
   * report and refreshes in one step — a refresh that cleared the error there
   * would erase the only message naming the namespace that was not written.
   */
  const load = (): void => {
    settings.describe().then((response) => {
      if (!response.ok) {
        setState((current) => ({ ...current, busy: false, error: response.error.message }))
        return
      }
      setState((current) => ({ ...withNamespaces(current, response.value), busy: false }))
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      setState((current) => ({ ...current, busy: false, error: message }))
    })
  }

  React.useEffect(() => { load() }, [])

  const revisionOf = (namespaces: readonly SettingsNamespace[], ns: string): number => namespaces.find((entry) => entry.ns === ns)?.revision ?? 0
  /**
   * The id this host addresses the plugin section by, resolved from the read
   * the caller is working with and falling back to the legacy registered
   * namespace. Every write and every snapshot key uses it.
   */
  const pluginId = (namespaces: readonly SettingsNamespace[] = state.namespaces): string => pluginSectionId(namespaces)
  const fail = (message: string): void => setState((current) => ({ ...current, busy: false, notice: [], error: message }))
  // Import failures drop the preview: a confirmation must never apply a snapshot
  // other than the file the user just chose.
  const failImport = (message: string): void => setState((current) => ({ ...current, busy: false, notice: [], error: message, preview: null }))

  const snapshotMeta = (): SnapshotMeta => ({
    createdAt: clock().toISOString(),
    pluginVersion: PLUGIN_VERSION,
    sourceProfile: settings.compatibilityProfile,
  })

  // An editor-side save elsewhere on the page changes the namespaces without
  // remounting this card, so every snapshot the user asks for is described
  // again: the mount-time copy is only a view of the profile library. The
  // revision rides along from that same read, so a write is guarded against the
  // configuration it was built from — the Header's OpenCode session switch
  // writes this namespace too. `async` is load-bearing: a describe that throws
  // instead of rejecting must be caught here, or `busy` would never clear.
  const freshSnapshot = async (): Promise<FreshSettings | undefined> => {
    setState((current) => ({ ...current, busy: true, error: null, notice: [] }))
    try {
      const response = await settings.describe()
      if (!response.ok) {
        fail(response.error.message)
        return undefined
      }
      const namespaces = response.value.namespaces
      const fresh: FreshSettings = {
        snapshot: snapshotFromNamespaces(namespaces, snapshotMeta(), pluginId(namespaces)),
        revision: revisionOf(namespaces, pluginId(namespaces)),
      }
      setState((current) => ({ ...current, busy: false }))
      return fresh
    } catch (error: unknown) {
      fail(error instanceof Error ? error.message : String(error))
      return undefined
    }
  }

  const exportCurrent = (): void => {
    void freshSnapshot().then((fresh) => {
      if (fresh === undefined) return
      download(snapshotFileName(clock()), serializeSnapshot(fresh.snapshot))
    })
  }

  const exportProfile = (name: string): void => {
    const stored = state.profiles[name]
    if (stored === undefined) return
    download(snapshotFileName(clock()), serializeSnapshot(stored))
  }

  const saveProfile = (): void => {
    if (state.profileNames.length >= MAX_PROFILES) {
      fail(t('backupProfileLimit', { max: MAX_PROFILES }))
      return
    }
    const validated = validateProfileName(state.nameDraft, state.profileNames)
    if (!validated.ok) {
      fail(t(NAME_ERROR_KEYS[validated.error], { max: MAX_PROFILE_NAME }))
      return
    }
    const name = validated.value
    void freshSnapshot().then((fresh) => {
      if (fresh === undefined) return
      setState((current) => ({ ...current, busy: true, error: null, notice: [] }))
      settings.mutate(pluginId(), saveProfileOps(name, fresh.snapshot), fresh.revision).then((response) => {
        if (!response.ok) {
          fail(t('backupSaveProfileFailed', { message: response.error.message }))
          return
        }
        setState((current) => ({ ...current, busy: false, nameDraft: '', notice: [t('backupSavedProfile', { name })] }))
        load()
      }).catch((error: unknown) => {
        fail(t('backupSaveProfileFailed', { message: error instanceof Error ? error.message : String(error) }))
      })
    })
  }

  const removeProfile = (name: string): void => {
    // The delete rewrites the namespace the profile list came from, so it needs
    // the revision read now for the same reason the save does: anything that
    // bumped this namespace since mount would otherwise be refused as a
    // conflict. Only the revision is used here.
    void freshSnapshot().then((fresh) => {
      if (fresh === undefined) return
      setState((current) => ({ ...current, busy: true, error: null, notice: [] }))
      settings.mutate(pluginId(), deleteProfileOps(name), fresh.revision).then((response) => {
        if (!response.ok) {
          fail(t('backupDeleteProfileFailed', { message: response.error.message }))
          return
        }
        setState((current) => ({ ...current, busy: false, pendingDelete: null }))
        load()
      }).catch((error: unknown) => {
        fail(t('backupDeleteProfileFailed', { message: error instanceof Error ? error.message : String(error) }))
      })
    })
  }

  // The summary is the only thing the user reads before consenting to a
  // replace, so it is diffed against the settings read when the preview opens
  // rather than the mount copy, which can under-report how many entries that
  // removes. A failed refresh must not block the preview: the summary already
  // on screen stays, and confirmation is still safe because `applySnapshot`
  // describes again before writing.
  const refreshNamespaces = async (): Promise<void> => {
    try {
      const response = await settings.describe()
      if (!response.ok) return
      setState((current) => withNamespaces(current, response.value))
    } catch {
      // Keeping the stale summary beats blocking the preview on a failed read.
    }
  }

  /**
   * The manual entry point into the legacy-data migration. The startup prompt
   * renders into the shell's overlay slot, which DSH lines before 0.1.7 do not
   * publish, so on those hosts this card is the only way to ask for a scan.
   *
   * The write is the one decision the prompt makes, and `scan` rather than
   * `migrate`: the host answers it by scanning again even after a previous
   * "don't ask again", and it decides what to offer from that fresh scan — this
   * card cannot see the legacy documents, so it must not offer to write them.
   *
   * The result line reads the same published control object the prompt does,
   * through the plugin section `describe` already answered for the rest of the
   * card, so there is no second read path to keep in step.
   */
  const ownSection = pluginSection(state.namespaces)
  const legacyState = legacyMigrationOf(ownSection?.user)
  const legacyResult = typeof legacyState?.lastResult === 'string' ? legacyState.lastResult : ''
  const legacyCandidateCount = Array.isArray(legacyState?.candidates) ? legacyState.candidates.length : 0
  /**
   * A refused write is not a result to celebrate. The host keeps `pending` with
   * its candidates in that case, so the nothing-pending sentence would state the
   * opposite of what the section holds; the reason is what has to be read.
   */
  const legacyFailed = legacyResult.startsWith(LEGACY_FAILED_PREFIX)
  const [legacyBusy, setLegacyBusy] = React.useState(false)

  const rescanLegacyData = async (): Promise<void> => {
    if (ownSection === undefined) return
    setLegacyBusy(true)
    try {
      await settings.mutate(ownSection.ns, [
        { op: 'set', path: ['legacyMigration', 'decision'], value: 'scan' },
      ], typeof ownSection.revision === 'number' ? ownSection.revision : 0)
      await refreshNamespaces()
    } finally {
      setLegacyBusy(false)
    }
  }

  const openPreview = (snapshot: ConfigSnapshot, label: string, ignored: readonly string[] = []): void => {
    setState((current) => ({ ...current, error: null, notice: [], mode: 'merge', importWiring: false, preview: { snapshot, label, ignored } }))
    void refreshNamespaces()
  }

  /**
   * Preview the stored rollback copy, keyed by the same resolved plugin id as
   * every other read. The copy is re-read here rather than passed down from the
   * header, which only renders the timestamp: an id that disagreed with the one
   * the library used would hand `openPreview` `undefined`, and the preview
   * dereferences the snapshot. Returning without a preview is the whole failure
   * mode — a refresh can legitimately drop a copy the mount read still saw.
   */
  const openAutoBackupPreview = (): void => {
    const backup = autoBackupFromNamespaces(state.namespaces, pluginId())
    if (backup === undefined) return
    openPreview(backup, t('backupSourceAutoBackup'))
  }

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (file === undefined) return
    readToken.current += 1
    const token = readToken.current
    // A superseded read reports nothing at all — neither a preview nor a
    // failure: its error would otherwise clear the preview a newer read just
    // installed, which is the same consent defect in the other direction.
    const current = (): boolean => readToken.current === token
    file.text().then((content) => {
      if (!current()) return
      const parsed = parseSnapshot(content)
      if (!parsed.ok) {
        failImport(t(PARSE_ERROR_KEYS[parsed.error.code], parsed.error.params ?? {}))
        return
      }
      openPreview(parsed.value.snapshot, t('backupSourceFile'), parsed.value.ignoredNamespaces)
    }).catch((error: unknown) => {
      if (!current()) return
      failImport(t('backupReadFailed', { message: error instanceof Error ? error.message : String(error) }))
    }).finally(() => { input.value = '' })
  }

  const appliedNamespaces = (outcome: ApplyOutcome): readonly string[] =>
    outcome.outcomes.filter((entry) => entry.ok).map((entry) => entry.ns)

  /**
   * The outcomes of the writes themselves, reported beside the apply result
   * rather than inside it: a copy that could not be written is not a failed
   * write, and a namespace that needs a restart is not a failure either. These
   * are true of every apply that reached the writes, so a half-applied plan
   * reports them too — a namespace that failed does not unsay a namespace that
   * landed.
   */
  const applyWarnings = (outcome: ApplyOutcome): string[] => {
    const warnings: string[] = []
    if (outcome.restartRequired.length > 0) warnings.push(t('backupRestartRequired', { namespaces: outcome.restartRequired.join(', ') }))
    if (outcome.autoBackupError !== undefined) warnings.push(t('backupAutoBackupFailed', { message: outcome.autoBackupError }))
    return warnings
  }

  const confirmImport = (): void => {
    const pending = state.preview
    if (pending === null) return
    setState((current) => ({ ...current, busy: true, error: null, notice: [] }))
    void applySnapshot({
      snapshot: pending.snapshot,
      mode: state.mode,
      importWiring: state.importWiring,
      settings,
      autoBackup: true,
      now: clock,
      pluginVersion: PLUGIN_VERSION,
    }).then((outcome) => {
      if (outcome.skipped) {
        setState((current) => ({ ...current, busy: false, preview: null, notice: [t('backupSkipped')] }))
        return
      }
      const failed = outcome.outcomes.filter((entry) => !entry.ok)
      if (failed.length > 0) {
        const detail = failed.map((entry) => `${entry.ns}: ${entry.error ?? ''}`).join('; ')
        const partial = t('backupAppliedPartial', { detail })
        const conflicted = failed.some((entry) => entry.conflict === true)
        // The failure belongs in the error block, but the half that applied —
        // and what it costs — is still true and still has to be readable.
        const applied = appliedNamespaces(outcome)
        const notice = [
          ...applied.length === 0 ? [] : [t('backupAppliedPartial', { detail: applied.join(', ') })],
          ...applyWarnings(outcome),
        ]
        setState((current) => ({ ...current, busy: false, preview: null, notice, error: conflicted ? `${t('backupConflict')} — ${partial}` : partial }))
        load()
        return
      }
      // The apply itself succeeded, so the warnings ride in the status block
      // rather than the error block: a copy that could not be written is not a
      // failed write, and a namespace that needs a restart is not a failure
      // either. Both are reported from the outcome, after the writes ran.
      const notice = [t('backupApplied'), ...applyWarnings(outcome)]
      setState((current) => ({ ...current, busy: false, preview: null, notice }))
      onApplied()
      load()
    }).catch((error: unknown) => {
      setState((current) => ({ ...current, busy: false, preview: null, error: t('backupImportFailed', { message: error instanceof Error ? error.message : String(error) }) }))
    })
  }

  const previewPlan = state.preview === null ? null : planImport(state.preview.snapshot, state.namespaces, state.mode, { importWiring: state.importWiring })
  // An empty plan has two very different causes. When the file's plugin section
  // held nothing but the snapshot library's own keys — the profile library and
  // the rollback copy — the payload was discarded wholesale, and "already
  // matches this configuration" would assert an equivalence the file never
  // expressed. `previewPlan.empty` covers a file that agrees with the settings;
  // this flag covers a file with nothing left to agree about.
  // The file may carry the other model's id for the plugin section, so the key
  // is resolved from the file itself: reading only the host's id would call a
  // library-only file empty instead.
  const previewPluginKey = state.preview === null
    ? pluginId()
    : pluginSectionKey(state.preview.snapshot.sections, pluginId())
  const previewKeys = state.preview === null ? [] : Object.keys(state.preview.snapshot.sections[previewPluginKey] ?? {})
  const previewLibraryOnly = previewKeys.length > 0 && previewKeys.every((key) => isSnapshotLibraryKey(previewPluginKey, key))
  // Only an endpoint URL or a script path is ever shown. `apiKeyEnv` names a
  // credential and `headers` can hold a plaintext token, so both are reported
  // as counts and route names only. The string can therefore be empty while
  // `wiring.count` is not, which is why it is rendered as its own element: the
  // sentence around it names the change without a placeholder to leave a stray
  // separator when there is no detail to show.
  const wiringDetail = previewPlan === null
    ? ''
    : [
        ...previewPlan.wiring.endpoints.map((entry) => `${entry.provider} → ${entry.baseURL}`),
        ...previewPlan.wiring.script === undefined ? [] : [previewPlan.wiring.script],
      ].join(', ')
  const readOnly = !state.writable
  const profileCount = state.profileNames.length
  const hint = profileCount === 0 ? t('backupCollapsedHintEmpty') : t('backupCollapsedHint', { count: profileCount })

  const muted: React.CSSProperties = { color: palette.secondary, fontSize: '11px', lineHeight: '16px' }
  const sectionTitle: React.CSSProperties = { fontSize: '12px', fontWeight: 700, marginBottom: '3px' }
  const field: React.CSSProperties = { height: '28px', padding: '0 8px', border: `1px solid ${palette.border}`, borderRadius: '8px', fontSize: '12px', backgroundColor: palette.field, color: palette.text, outline: 'none' }

  return <div data-scope="config-backup" style={{ backgroundColor: palette.group, border: `1px solid ${palette.border}`, borderRadius: '8px', boxShadow: palette.shadow, overflow: 'hidden', marginBottom: '8px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 8px', fontSize: '13px', fontWeight: 700 }}>
      <Icon name="layers" size={15} />
      <button
        type="button"
        aria-label={t('backupCardTitle')}
        aria-expanded={state.open}
        onClick={() => setState((current) => ({ ...current, open: !current.open }))}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 auto', minWidth: 0, padding: 0, border: 'none', background: 'transparent', color: palette.text, font: 'inherit', letterSpacing: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <span>{t('backupCardTitle')}</span>
        <span style={{ marginLeft: 'auto', color: palette.secondary, fontSize: '11px', fontWeight: 600 }}>{hint}</span>
        <Icon name={state.open ? 'chevronUp' : 'chevronDown'} size={14} />
      </button>
    </div>
    {state.error ? <div role="alert" aria-live="assertive" style={{ fontSize: '12px', lineHeight: '18px', color: palette.danger, backgroundColor: palette.dangerBg, border: `1px solid ${palette.dangerBorder}`, borderRadius: '8px', padding: '6px 8px', margin: '0 8px 8px' }}>{state.error}</div> : null}
    {state.notice.length === 0 ? null : <div role="status" aria-live="polite" style={{ fontSize: '12px', lineHeight: '18px', color: palette.accent, backgroundColor: palette.accentSoft, border: `1px solid ${palette.accentBorder}`, borderRadius: '8px', padding: '6px 8px', margin: '0 8px 8px', whiteSpace: 'pre-line' }}>{state.notice.join('\n')}</div>}
    {state.open ? <div style={{ display: 'grid', gap: '9px', padding: '8px', borderTop: `1px solid ${palette.divider}` }}>
      <div>
        <div style={sectionTitle}>{t('backupProfilesTitle')}</div>
        {profileCount === 0 ? <div style={muted}>{t('backupProfilesEmpty')}</div> : state.profileNames.map((name) => <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
          <span style={{ flex: '1 1 auto', minWidth: 0, fontSize: '12px', overflowWrap: 'anywhere' }}>{name}</span>
          <span style={muted}>{(state.profiles[name]?.createdAt ?? '').slice(0, 10)}</span>
          <ActionButton text={t('backupApply')} onClick={() => openPreview(state.profiles[name]!, t('backupSourceProfile', { name }))} disabled={state.busy || readOnly} palette={palette} icon="check" />
          <ActionButton text={t('backupExportProfile')} onClick={() => exportProfile(name)} disabled={state.busy} palette={palette} />
          {state.pendingDelete === name
            ? <>
              <ActionButton text={t('backupDeleteConfirm')} onClick={() => removeProfile(name)} disabled={state.busy || readOnly} tone="danger" palette={palette} />
              <ActionButton text={t('backupCancel')} onClick={() => setState((current) => ({ ...current, pendingDelete: null }))} disabled={state.busy} palette={palette} />
            </>
            : <ActionButton text={t('backupDeleteProfile')} onClick={() => setState((current) => ({ ...current, pendingDelete: name }))} disabled={state.busy || readOnly} tone="danger" palette={palette} />}
        </div>)}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', paddingTop: '4px' }}>
          <input
            type="text"
            value={state.nameDraft}
            placeholder={t('backupProfileNamePlaceholder')}
            aria-label={t('backupProfileNamePlaceholder')}
            onChange={(event) => {
              const value = event.currentTarget.value
              setState((current) => ({ ...current, notice: [], nameDraft: value }))
            }}
            style={{ ...field, flex: '1 1 auto', minWidth: 0 }}
          />
          <ActionButton text={t('backupSaveCurrent')} onClick={saveProfile} disabled={state.busy || readOnly} tone="primary" palette={palette} icon="check" />
        </div>
      </div>
      <div>
        <div style={sectionTitle}>{t('backupExportCurrent')}</div>
        <ActionButton text={t('backupExportCurrent')} onClick={exportCurrent} disabled={state.busy} palette={palette} />
        <div style={{ ...muted, paddingTop: '3px' }}>{t('backupExportHint')}</div>
      </div>
      <div>
        <div style={sectionTitle}>{t('backupImportTitle')}</div>
        <input ref={fileInput} type="file" accept="application/json,.json" onChange={onFileChange} style={{ display: 'none' }} />
        <ActionButton text={t('backupImportChoose')} onClick={() => fileInput.current?.click()} disabled={state.busy || readOnly} palette={palette} />
      </div>
      {readOnly ? <div style={muted}>{t('backupReadOnly')}</div> : null}
      <div>
        <div style={sectionTitle}>{t('backupAutoBackupTitle')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={muted}>{state.autoBackupAt === null ? t('backupAutoBackupNone') : state.autoBackupAt}</span>
          {state.autoBackupAt === null ? null : <ActionButton text={t('backupAutoBackupRestore')} onClick={openAutoBackupPreview} disabled={state.busy || readOnly} palette={palette} icon="restore" />}
        </div>
      </div>
      {state.preview === null || previewPlan === null ? null : <div style={{ display: 'grid', gap: '6px', border: `1px solid ${palette.accentBorder}`, borderRadius: '8px', backgroundColor: palette.accentSoft, padding: '7px 8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700 }}>{t('backupPreviewTitle')}</div>
        <div style={muted}>{state.preview.label}{state.preview.snapshot.createdAt === '' ? '' : ` · ${state.preview.snapshot.createdAt.slice(0, 10)}`}</div>
        <select
          value={state.mode}
          aria-label={t('backupPreviewTitle')}
          onChange={(event) => {
            const value = event.currentTarget.value
            setState((current) => ({ ...current, mode: value === 'replace' ? 'replace' : 'merge' }))
          }}
          style={{ ...field, colorScheme: 'light dark' }}
        >
          <option value="merge">{t('backupModeMerge')}</option>
          <option value="replace">{t('backupModeReplace')}</option>
        </select>
        <div style={{ fontSize: '12px' }}>{previewPlan.empty
          ? t(previewLibraryOnly ? 'backupSummaryLibraryOnly' : 'backupSummaryEmpty')
          : t('backupSummary', { added: previewPlan.summary.added, overwritten: previewPlan.summary.overwritten, removed: previewPlan.summary.removed })}</div>
        {previewPlan.wiring.count === 0 ? null : <div style={{ display: 'grid', gap: '4px' }}>
          <div style={{ ...muted, color: palette.secondary }}>
            {state.importWiring
              ? t('backupWiringWarning')
              : t('backupWiringSkipped', { count: previewPlan.wiring.count })}
          </div>
          {!state.importWiring || wiringDetail === '' ? null : <div style={{ ...muted, color: palette.secondary }}>{wiringDetail}</div>}
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
            <input
              type="checkbox"
              checked={state.importWiring}
              onChange={(event) => {
                const checked = event.currentTarget.checked
                setState((current) => ({ ...current, importWiring: checked }))
              }}
            />
            {t('backupWiringInclude')}
          </label>
        </div>}
        {state.preview.ignored.length === 0 ? null : <div style={muted}>{t('backupIgnored', { count: state.preview.ignored.length })}</div>}
        <div style={{ display: 'flex', gap: '6px' }}>
          <ActionButton text={t('backupConfirmImport')} onClick={confirmImport} disabled={state.busy || readOnly || previewPlan.empty} tone="primary" palette={palette} icon="check" />
          <ActionButton text={t('backupCancel')} onClick={() => setState((current) => ({ ...current, preview: null }))} disabled={state.busy} palette={palette} />
        </div>
      </div>}
    </div> : null}
    <div style={{ marginTop: '12px', paddingTop: '12px', paddingLeft: '8px', paddingRight: '8px', borderTop: `1px solid ${palette.divider}` }}>
      <div style={{ fontSize: '13px', fontWeight: 600 }}>{t('legacyMigrationRescan')}</div>
      <div style={{ fontSize: '12px', color: palette.secondary, margin: '4px 0 8px' }}>
        {t('legacyMigrationRescanHint')}
      </div>
      {legacyResult !== '' ? (
        <div style={{ fontSize: '12px', color: palette.secondary, marginBottom: '8px' }}>
          {legacyFailed
            ? t('legacyMigrationFailed', { reason: legacyResult.slice(LEGACY_FAILED_PREFIX.length).trim() })
            : legacyResult === 'applied'
              ? t('legacyMigrationApplied', { count: legacyCandidateCount })
              : legacyResult === 'dismissed'
                ? t('legacyMigrationDismissed')
                : t('legacyMigrationNothingPending')}
        </div>
      ) : null}
      <button
        type="button"
        data-testid="legacy-rescan"
        disabled={legacyBusy}
        onClick={() => { void rescanLegacyData() }}
      >
        {t('legacyMigrationRescan')}
      </button>
    </div>
  </div>
}