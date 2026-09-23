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
import { ActionButton } from './Controls.js'
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
      // ONLY `idle` may open the prompt from a read.
      //
      // `submitting` must not return here. The read that runs the moment the
      // user clicks happens before the Host has acted, so it still sees
      // `pending: true` with the candidates intact; reopening the prompt would
      // strand the phase at `asking`, which is not a polling phase, and the
      // dialog would never observe the Host's result — it stayed on screen after
      // a successful migration, with stale candidates and live buttons.
      // `later` and `failed` are settled states a late read must not disturb.
      setPhase((previous) => (previous.kind === 'idle' ? { kind: 'asking', target } : previous))
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
        padding: '24px',
        // The shell's own modal mask is rgba(0,0,0,0.24) with a 2px backdrop
        // blur, raised for dark themes. `iosPalette` carries no mask token, so
        // one value between the two covers both.
        background: 'rgba(0,0,0,0.32)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('legacyMigrationTitle')}
        style={{
          display: 'flex', flexDirection: 'column', gap: '16px',
          width: 'min(560px, 100%)', maxHeight: '100%', overflow: 'hidden',
          // The shell's modal card is a 24px radius on the layer-2 fill with a
          // prominent elevation shadow and no border. The border is the one
          // addition: this card can open over an arbitrary page, and the raised
          // fill sits close enough to the mask in dark themes to need an edge.
          background: palette.raised, color: palette.text,
          border: `1px solid ${palette.border}`,
          borderRadius: '24px', padding: '22px 0 20px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.42)',
        }}
      >
        <div style={{ padding: '0 24px', fontSize: '16px', lineHeight: '24px', fontWeight: 500 }}>
          {t('legacyMigrationTitle')}
        </div>
        {/* Header and footer stay put; a long candidate list scrolls between them. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0, overflow: 'auto', padding: '0 24px' }}>
          <div style={{ fontSize: '13px', lineHeight: '19px', color: palette.secondary }}>
            {t('legacyMigrationBody', { count: candidates.length })}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '4px' }}>
            {candidates.map((candidate) => (
              <li
                key={candidate.path.join('.')}
                data-testid="legacy-candidate"
                style={{
                  display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px',
                  padding: '6px 8px', border: `1px solid ${palette.border}`, borderRadius: '8px',
                  backgroundColor: palette.field,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: '11.5px', lineHeight: '16px',
                }}
              >
                <span style={{ color: palette.text, overflowWrap: 'anywhere' }}>{candidate.path.join('.')}</span>
                <span style={{ color: palette.secondary }}>=</span>
                <strong style={{ color: palette.accent, fontWeight: 700 }}>{String(candidate.value)}</strong>
                {/* The source flows after the value rather than being pushed to
                    the right edge: a long path wraps, and right-alignment then
                    stranded the label on a second line across a wide empty gap. */}
                <span style={{ padding: '0 6px', border: `1px solid ${palette.border}`, borderRadius: '999px', color: palette.secondary, fontFamily: 'inherit', fontSize: '10.5px', whiteSpace: 'nowrap' }}>
                  {sourceLabel(candidate.source)}
                </span>
              </li>
            ))}
          </ul>
          {phase.kind === 'failed' ? (
            <div
              role="alert"
              style={{
                padding: '6px 8px', border: `1px solid ${palette.dangerBorder}`, borderRadius: '8px',
                backgroundColor: palette.dangerBg, color: palette.danger,
                fontSize: '12px', lineHeight: '18px',
              }}
            >
              {t('legacyMigrationFailed', { reason: phase.reason })}
            </div>
          ) : null}
        </div>
        {/* One primary action, rightmost: the question is "migrate or not", so
            postponing and refusing carry less weight than accepting. */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '0 24px' }}>
          <ActionButton text={t('legacyMigrationLater')} onClick={() => { setPhase({ kind: 'later' }) }} disabled={busy} tone="ghost" palette={palette} testId="legacy-later" />
          <ActionButton text={t('legacyMigrationDismiss')} onClick={() => { void commit(target, 'dismiss') }} disabled={busy} palette={palette} testId="legacy-dismiss" />
          <ActionButton text={t('legacyMigrationApply')} onClick={() => { void commit(target, 'migrate') }} disabled={busy} tone="primary" palette={palette} icon="check" testId="legacy-apply" />
        </div>
      </div>
    </div>
  )
}
