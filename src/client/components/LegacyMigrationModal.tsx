import { useCallback, useEffect, useState } from 'react'
import {
  LEGACY_FAILED_PREFIX,
  legacyCandidatesOf,
} from '../../compat/legacy-migration.js'
import {
  lastResultOf,
  pendingMigrationOf,
  readLegacyMigration,
  writeLegacyDecision,
  type LegacyMigrationRead,
} from '../legacy-migration.js'
import { iosPalette, type Palette } from '../theme.js'
import type { SettingsApi, Translation } from '../types.js'

/** Boot-time reads before the prompt gives up for this page load. */
const POLL_ATTEMPTS = 15
/** Delay between those reads, in milliseconds. */
const POLL_INTERVAL_MS = 2000

interface Props {
  readonly settings: SettingsApi
  readonly t: Translation
  readonly palette?: Palette
}

/**
 * `idle` is waiting for the Host to offer something, `submitting` is waiting for
 * the Host to finish acting on the decision the user just made. Only those two
 * poll; every other phase is the user's to resolve.
 */
type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'asking'; readonly target: LegacyMigrationRead }
  | { readonly kind: 'submitting'; readonly target: LegacyMigrationRead }
  | { readonly kind: 'failed'; readonly target: LegacyMigrationRead; readonly reason: string }
  | { readonly kind: 'later' }

/**
 * The prompt for legacy data DSH's 0.1.7 settings rename stranded.
 *
 * It renders into the shell's overlay slot rather than into the plugin's
 * settings page, because the point is to ask before the user has any reason to
 * open Settings. It reads the control object the Host wrote into the plugin's
 * own section and writes back exactly one decision; the Host performs the
 * migration, so no file access happens here.
 *
 * The Client has no push channel for settings changes — its bridge answers
 * `describe`/`mutate` only — so the two waiting phases poll, bounded by
 * {@link POLL_ATTEMPTS}. `later` stops polling for this page load, which is what
 * keeps the dialog from reappearing the moment the user postpones it.
 */
export function LegacyMigrationModal({ settings, t, palette = iosPalette() }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  /**
   * One read. `current` is the phase this read belongs to, passed in rather than
   * read from state so the decision below is made against the phase the caller
   * scheduled it for.
   *
   * While `idle` a read that finds nothing must NOT settle: the Host arms the
   * prompt from its own `apply()`, which races the Client's mount, so "nothing
   * yet" and "nothing ever" are indistinguishable on a single read. Only the
   * attempt budget ends that wait. While `submitting` the Host is expected to
   * finish, so an outcome settles the phase.
   */
  const read = useCallback(async (current: Phase['kind']): Promise<void> => {
    let target: LegacyMigrationRead | undefined
    try {
      target = await readLegacyMigration(settings)
    } catch {
      return
    }
    if (target === undefined) return

    const result = lastResultOf(target.user)

    // The FAILURE is checked before `pending`, and that order is load-bearing:
    // when a write is refused the Host keeps `pending: true` WITH the candidates
    // intact, precisely so the prompt can show the reason and offer a retry.
    // Checking `pending` first would hide the reason forever and leave the dialog
    // stuck in a disabled submitting state.
    if (result.startsWith(LEGACY_FAILED_PREFIX)) {
      // `later` is sticky for this page load: a read already in flight when the
      // user postponed must not reopen the dialog.
      setPhase((previous) => (previous.kind === 'later'
        ? previous
        : { kind: 'failed', target, reason: result.slice(LEGACY_FAILED_PREFIX.length).trim() }))
      return
    }

    if (pendingMigrationOf(target.user) && legacyCandidatesOf(target.user).length > 0) {
      // Only the two waiting phases may open the prompt. A late read must not
      // pull the user back after they postponed it, nor interrupt a failure they
      // are reading.
      setPhase((previous) => (previous.kind === 'idle' || previous.kind === 'submitting'
        ? { kind: 'asking', target }
        : previous))
      return
    }

    // Nothing pending and nothing failed: if the Host was acting on a decision,
    // it is done. Otherwise keep waiting out the attempt budget.
    if (current === 'submitting') setPhase({ kind: 'later' })
  }, [settings])

  useEffect(() => {
    if (phase.kind !== 'idle' && phase.kind !== 'submitting') return undefined
    const scheduled = phase.kind
    let attempts = 0
    void read(scheduled)
    const timer = setInterval(() => {
      attempts += 1
      if (attempts >= POLL_ATTEMPTS) {
        clearInterval(timer)
        // A `submitting` phase that never settles — the host accepted the write
        // but stopped publishing its section, so nothing will ever confirm it —
        // must not leave every control disabled for the rest of the page load.
        // It becomes an actionable failure instead.
        if (scheduled === 'submitting') {
          setPhase((previous) => (previous.kind === 'submitting'
            ? { kind: 'failed', target: previous.target, reason: t('legacyMigrationTimedOut') }
            : previous))
        }
        return
      }
      void read(scheduled)
    }, POLL_INTERVAL_MS)
    return () => { clearInterval(timer) }
  }, [phase.kind, read, t])

  const commit = useCallback(async (
    target: LegacyMigrationRead,
    decision: 'migrate' | 'dismiss',
  ): Promise<void> => {
    setPhase({ kind: 'submitting', target })
    try {
      await writeLegacyDecision(settings, target, decision)
      // The host still has to act; `submitting` polls until it reports.
    } catch (error) {
      setPhase({
        kind: 'failed',
        target,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }, [settings])

  if (phase.kind === 'idle' || phase.kind === 'later') return null

  const { target } = phase
  const candidates = legacyCandidatesOf(target.user)
  const busy = phase.kind === 'submitting'
  const sourceLabel = (source: string): string => {
    if (source === 'llm-pi-ai') return t('legacyMigrationSourceLive')
    if (source === 'settings.yaml') return t('legacyMigrationSourceDocument')
    if (source === 'settings.yaml.imported') return t('legacyMigrationSourceImported')
    // An unknown source is shown verbatim rather than mislabelled as one of the
    // three this release knows about.
    return source
  }

  return (
    <div
      data-testid="legacy-migration-mask"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('legacyMigrationTitle')}
        style={{
          width: 'min(560px, 92vw)', maxHeight: '80vh', overflow: 'auto',
          background: palette.raised, color: palette.text,
          border: `1px solid ${palette.border}`,
          borderRadius: '12px', padding: '18px 20px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px' }}>
          {t('legacyMigrationTitle')}
        </div>
        <div style={{ fontSize: '13px', color: palette.secondary, marginBottom: '12px' }}>
          {t('legacyMigrationBody', { count: candidates.length })}
        </div>
        <ul style={{ listStyle: 'none', margin: '0 0 14px', padding: 0 }}>
          {candidates.map((candidate) => (
            <li
              key={candidate.path.join('.')}
              data-testid="legacy-candidate"
              style={{ fontSize: '12px', padding: '5px 0', borderBottom: `1px solid ${palette.divider}` }}
            >
              <code>{candidate.path.join('.')}</code>
              {' = '}
              <strong>{String(candidate.value)}</strong>
              <span style={{ color: palette.secondary }}>{`  (${sourceLabel(candidate.source)})`}</span>
            </li>
          ))}
        </ul>
        {phase.kind === 'failed' ? (
          <div style={{ fontSize: '12px', color: palette.danger, marginBottom: '10px' }}>
            {t('legacyMigrationFailed', { reason: phase.reason })}
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" data-testid="legacy-later" disabled={busy} onClick={() => { setPhase({ kind: 'later' }) }}>
            {t('legacyMigrationLater')}
          </button>
          <button type="button" data-testid="legacy-dismiss" disabled={busy} onClick={() => { void commit(target, 'dismiss') }}>
            {t('legacyMigrationDismiss')}
          </button>
          <button type="button" data-testid="legacy-apply" disabled={busy} onClick={() => { void commit(target, 'migrate') }}>
            {t('legacyMigrationApply')}
          </button>
        </div>
      </div>
    </div>
  )
}
