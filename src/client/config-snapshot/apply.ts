import { planImport } from './plan.js'
import { autoBackupOps } from './library.js'
import { snapshotFromNamespaces } from './snapshot.js'
import { PLUGIN_NAMESPACE } from './types.js'
import type { ApplyOutcome, ApplySettings, ConfigSnapshot, ImportMode, NamespaceOutcome } from './types.js'
import type { SettingsNamespace } from '../types.js'

export interface ApplyRequest {
  readonly snapshot: ConfigSnapshot
  readonly mode: ImportMode
  readonly settings: ApplySettings
  readonly autoBackup: boolean
  /** Apply the snapshot's endpoint / credential / script wiring too. Defaults to false. */
  readonly importWiring?: boolean
  /**
   * The id the running host addresses the plugin section by — `pluginSectionId`
   * of the fresh `describe()` below. The auto backup is written there and the
   * plugin half of the plan targets it; absent, the legacy registered namespace
   * is kept, which is what an older host publishes.
   */
  readonly pluginNamespace?: string
  /** Injected for tests; defaults to the real clock. */
  readonly now?: () => Date
  readonly pluginVersion?: string
}

/** The Remote classifies a stale revision as `settings/conflict`; older transports only carry the message. */
export function isConflictError(error: { readonly message: string; readonly [key: string]: unknown }): boolean {
  return error.code === 'settings/conflict' || /conflict/i.test(error.message)
}

function revisionOf(namespaces: readonly SettingsNamespace[], ns: string): number {
  const found = namespaces.find((entry) => entry.ns === ns)
  return found !== undefined && typeof found.revision === 'number' ? found.revision : 0
}

/**
 * Apply a snapshot to the live configuration.
 *
 * The caller's snapshot is the *source*, so it is read once up front, and every
 * write is fenced with the revision that read reported — or, when an earlier
 * write of this same apply moved that namespace, with the revision that write
 * returned. That is what keeps a concurrent edit in another window from being
 * silently overwritten. A namespace that fails does not roll back its siblings:
 * a rollback is another write and can fail the same way, so the outcome names
 * exactly which half applied instead.
 */
export async function applySnapshot(request: ApplyRequest): Promise<ApplyOutcome> {
  const { settings, snapshot, mode } = request
  const fresh = await settings.describe()
  if (!fresh.ok) {
    return { ok: false, skipped: false, outcomes: [], restartRequired: [] }
  }

  const namespaces = fresh.value.namespaces
  const pluginNamespace = request.pluginNamespace ?? PLUGIN_NAMESPACE
  const plan = planImport(snapshot, namespaces, mode, {
    importWiring: request.importWiring ?? false,
    pluginNamespace,
  })
  if (plan.empty) {
    return { ok: true, skipped: true, outcomes: [], restartRequired: [] }
  }

  // The rollback copy is written before the first namespace write. A copy taken
  // afterwards would not exist yet while the writes are failing or the page is
  // closing — exactly the states it has to roll back. Returning above on an
  // empty plan is what makes this conditional exact: reaching this point means
  // at least one namespace write is about to be attempted.
  let autoBackupError: string | undefined
  let backedUpNamespace: SettingsNamespace | undefined
  if (request.autoBackup) {
    const backup = await writeAutoBackup(request, namespaces, pluginNamespace)
    autoBackupError = backup.error
    backedUpNamespace = backup.namespace
  }

  // Revisions are per namespace, so the copy above moved the plugin namespace's
  // revision; a plan that writes that namespace too is fenced with what the copy
  // left behind. Every other write keeps the revision it was planned from. A
  // copy that reports no numeric revision falls back to that read rather than
  // passing `undefined` on: the Remote reads an absent revision as "write
  // unconditionally", so the guard is what keeps a non-conforming transport
  // failing closed instead of silently dropping the fence.
  const revisionFor = (ns: string): number => {
    if (backedUpNamespace !== undefined && backedUpNamespace.ns === ns && typeof backedUpNamespace.revision === 'number') {
      return backedUpNamespace.revision
    }
    return revisionOf(namespaces, ns)
  }

  const outcomes: NamespaceOutcome[] = []
  for (const namespacePlan of plan.namespaces) {
    const response = await settings.mutate(namespacePlan.ns, namespacePlan.ops, revisionFor(namespacePlan.ns))
    if (response.ok) {
      outcomes.push({ ns: namespacePlan.ns, ok: true, revision: response.value.revision })
      continue
    }
    outcomes.push({
      ns: namespacePlan.ns,
      ok: false,
      error: response.error.message,
      conflict: isConflictError(response.error),
    })
  }

  // Only a namespace whose write LANDED can need a restart: a namespace that was
  // planned but refused still runs its old configuration, so naming it would tell
  // the user to restart for a change that never happened.
  const applied = new Set(outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.ns))

  return {
    ok: outcomes.every((outcome) => outcome.ok),
    skipped: false,
    outcomes,
    ...autoBackupError === undefined ? {} : { autoBackupError },
    restartRequired: namespaces
      .filter((entry) => entry.applies === 'restart' && applied.has(entry.ns))
      .map((entry) => entry.ns),
  }
}

/** What the rollback copy left behind: its failure, or the plugin namespace it wrote. */
interface AutoBackupWrite {
  readonly error?: string
  readonly namespace?: SettingsNamespace
}

/**
 * Back up the pre-apply configuration; a failure here must not look like an
 * apply failure. The write is fenced with the plugin namespace revision from
 * the read at the top of the apply: nothing has written that namespace yet, so
 * that revision is still the current one, and a second `describe()` would only
 * read the same value back.
 */
async function writeAutoBackup(
  request: ApplyRequest,
  preApply: readonly SettingsNamespace[],
  pluginNamespace: string,
): Promise<AutoBackupWrite> {
  const { settings, now, pluginVersion } = request
  const backup = snapshotFromNamespaces(preApply, {
    createdAt: (now ?? (() => new Date()))().toISOString(),
    pluginVersion: pluginVersion ?? '',
    sourceProfile: 'unknown',
  }, pluginNamespace)

  const revision = revisionOf(preApply, pluginNamespace)
  const response = await settings.mutate(pluginNamespace, autoBackupOps(backup), revision)
  return response.ok ? { namespace: response.value } : { error: response.error.message }
}
