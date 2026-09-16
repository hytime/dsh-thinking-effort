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
 * The caller's snapshot is the *source*, so it is read once up front; every
 * revision comes from a fresh `describe()`, which is what keeps a concurrent
 * edit in another window from being silently overwritten. A namespace that
 * fails does not roll back its siblings: a rollback is another write and can
 * fail the same way, so the outcome names exactly which half applied instead.
 */
export async function applySnapshot(request: ApplyRequest): Promise<ApplyOutcome> {
  const { settings, snapshot, mode } = request
  const fresh = await settings.describe()
  if (!fresh.ok) {
    return { ok: false, skipped: false, outcomes: [], restartRequired: [] }
  }

  const namespaces = fresh.value.namespaces
  const plan = planImport(snapshot, namespaces, mode)
  if (plan.empty) {
    return { ok: true, skipped: true, outcomes: [], restartRequired: [] }
  }

  const outcomes: NamespaceOutcome[] = []
  for (const namespacePlan of plan.namespaces) {
    const response = await settings.mutate(namespacePlan.ns, namespacePlan.ops, revisionOf(namespaces, namespacePlan.ns))
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

  let autoBackupError: string | undefined
  if (request.autoBackup && outcomes.some((outcome) => outcome.ok)) {
    autoBackupError = await writeAutoBackup(request, namespaces)
  }

  return {
    ok: outcomes.every((outcome) => outcome.ok),
    skipped: false,
    outcomes,
    ...autoBackupError === undefined ? {} : { autoBackupError },
    restartRequired: namespaces
      .filter((entry) => entry.applies === 'restart' && plan.namespaces.some((planned) => planned.ns === entry.ns))
      .map((entry) => entry.ns),
  }
}

/** Back up the pre-apply configuration; a failure here must not look like an apply failure. */
async function writeAutoBackup(request: ApplyRequest, preApply: readonly SettingsNamespace[]): Promise<string | undefined> {
  const { settings, now, pluginVersion } = request
  const backup = snapshotFromNamespaces(preApply, {
    createdAt: (now ?? (() => new Date()))().toISOString(),
    pluginVersion: pluginVersion ?? '',
    sourceProfile: 'unknown',
  })

  const fresh = await settings.describe()
  if (!fresh.ok) return fresh.error.message
  const revision = revisionOf(fresh.value.namespaces, PLUGIN_NAMESPACE)
  const response = await settings.mutate(PLUGIN_NAMESPACE, autoBackupOps(backup), revision)
  return response.ok ? undefined : response.error.message
}
