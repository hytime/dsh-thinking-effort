import type { ApplyOutcome } from '../../config-snapshot/types.js'

import { isSnapshotLibraryKey, pluginSectionKey } from '../../config-snapshot/snapshot.js'
import type { Translation } from '../../types.js'
import type { PendingImport } from './card-state.js'

/** What a snapshot ask resolved to: the payload plus the revision it was built from. */
export interface PlanSummary {
  readonly added: number
  readonly overwritten: number
  readonly removed: number
}

/** The card's preview block, resolved from the pending import and the live state. */
export interface PreviewView {
  /** Keys in the file's plugin section, used to tell a library-only file from an empty one. */
  readonly libraryOnly: boolean
  /** The endpoint/script detail line; empty when there is nothing showable. */
  readonly wiringDetail: string
}

/**
 * Resolve the preview's derived facts.
 *
 * An empty plan has two very different causes. When the file's plugin section
 * held nothing but the snapshot library's own keys — the profile library and the
 * rollback copy — the payload was discarded wholesale, and "already matches this
 * configuration" would assert an equivalence the file never expressed.
 * `planImport(...).empty` covers a file that agrees with the settings; this flag
 * covers a file with nothing left to agree about.
 *
 * The file may carry the other model's id for the plugin section, so the key is
 * resolved from the FILE itself: reading only the host's id would call a
 * library-only file empty instead.
 *
 * Only an endpoint URL or a script path is ever shown. `apiKeyEnv` names a
 * credential and `headers` can hold a plaintext token, so both are reported as
 * counts and route names only — which is why the detail string can be empty
 * while the wiring count is not, and is rendered as its own element to avoid a
 * stray separator.
 */
export function previewView(
  pending: PendingImport | null,
  plan: { readonly wiring: { readonly endpoints: readonly { provider: string; baseURL: string }[]; readonly script?: string } } | null,
  hostPluginId: string,
): PreviewView {
  const pluginKey = pending === null
    ? hostPluginId
    : pluginSectionKey(pending.snapshot.sections, hostPluginId)
  const keys = pending === null ? [] : Object.keys(pending.snapshot.sections[pluginKey] ?? {})
  const libraryOnly = keys.length > 0 && keys.every((key) => isSnapshotLibraryKey(pluginKey, key))
  const wiringDetail = plan === null
    ? ''
    : [
        ...plan.wiring.endpoints.map((entry) => `${entry.provider} → ${entry.baseURL}`),
        ...plan.wiring.script === undefined ? [] : [plan.wiring.script],
      ].join(', ')
  return { libraryOnly, wiringDetail }
}

/**
 * The outcomes of the writes themselves, reported beside the apply result
 * rather than inside it: a copy that could not be written is not a failed
 * write, and a namespace that needs a restart is not a failure either. These
 * are true of every apply that reached the writes, so a half-applied plan
 * reports them too — a namespace that failed does not unsay a namespace that
 * landed.
 */
export function applyWarnings(outcome: ApplyOutcome, t: Translation): string[] {
  const warnings: string[] = []
  if (outcome.restartRequired.length > 0) warnings.push(t('backupRestartRequired', { namespaces: outcome.restartRequired.join(', ') }))
  if (outcome.autoBackupError !== undefined) warnings.push(t('backupAutoBackupFailed', { message: outcome.autoBackupError }))
  return warnings
}

/** The namespaces whose writes were accepted, in plan order. */
export function appliedNamespaces(outcome: ApplyOutcome): readonly string[] {
  return outcome.outcomes.filter((entry) => entry.ok).map((entry) => entry.ns)
}

/** The message for one refused or partial apply. */
export interface ApplyFailureLines {
  readonly error: string
  readonly notice: readonly string[]
}

/**
 * Split one apply result into the error line and the still-true status lines.
 *
 * The failure belongs in the error block, but the half that applied — and what
 * it costs — is still true and still has to be readable.
 */
export function applyFailureLines(outcome: ApplyOutcome, t: Translation): ApplyFailureLines {
  const failed = outcome.outcomes.filter((entry) => !entry.ok)
  const detail = failed.map((entry) => `${entry.ns}: ${entry.error ?? ''}`).join('; ')
  const partial = t('backupAppliedPartial', { detail })
  const conflicted = failed.some((entry) => entry.conflict === true)
  const applied = appliedNamespaces(outcome)
  return {
    error: conflicted ? `${t('backupConflict')} — ${partial}` : partial,
    notice: [
      ...applied.length === 0 ? [] : [t('backupAppliedPartial', { detail: applied.join(', ') })],
      ...applyWarnings(outcome, t),
    ],
  }
}
