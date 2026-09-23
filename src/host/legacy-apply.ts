import { LEGACY_FAILED_PREFIX, LEGACY_RESULT_APPLIED, type LegacyCandidate } from '../compat/legacy-migration.js'
import type { HostSettings, SettingsPathOp } from './types.js'

/**
 * The snapshot kind and version the plugin's own snapshot schema declares.
 *
 * Duplicated as literals rather than imported from
 * `src/client/config-snapshot/types.ts`, because the Host bundle must not pull
 * client code in. `plugin-settings.ts` already duplicates the same `kind` for
 * the same reason, so these two stay next to it in spirit.
 */
const SNAPSHOT_KIND = 'dsh-thinking-effort/config-snapshot'
const SNAPSHOT_VERSION = 1

/**
 * Keys of the plugin's own section that must never ride inside a snapshot of
 * that section: `profiles` is the snapshot library itself and `autoBackup` is
 * the slot this snapshot is written to, so capturing either would nest one
 * rollback copy inside the next. `legacyMigration` is this feature's own
 * control object — a rollback copy of the user's *settings* has no business
 * resurrecting a stale prompt offer. The first two mirror the Client's
 * `PLUGIN_SNAPSHOT_EXCLUDED_KEYS`.
 */
const SNAPSHOT_EXCLUDED_KEYS = ['profiles', 'autoBackup', 'legacyMigration'] as const

/**
 * Keys that must never be copied into an accumulator, whatever a layer holds.
 * A parsed document can carry an own `__proto__` (see `legacy-shape.ts`), and
 * `copy[key] = value` on one would drop the entry and rewrite the accumulator's
 * prototype — the same risk the repo already blocks in
 * `src/client/config-snapshot/library.ts` and `parse.ts`.
 */
const RESERVED_PATH_KEYS = ['__proto__', 'constructor', 'prototype'] as const

/** One candidate as a path write into the plugin's own section. */
export function opsForCandidates(candidates: readonly LegacyCandidate[]): SettingsPathOp[] {
  return candidates.map((candidate) => ({
    op: 'set' as const,
    path: [...candidate.path],
    value: candidate.value,
  }))
}

export interface RollbackSnapshotInput {
  /** The section id the plugin owns on this host; its library keys are dropped. */
  readonly pluginNs: string
  /** The live user layers, keyed by the section id each was read from. */
  readonly sections: Readonly<Record<string, Record<string, unknown>>>
  readonly createdAt: string
}

/**
 * A rollback copy of the settings a migration is about to extend.
 *
 * Built from the user layers alone — never from a resolved section — so
 * restoring it cannot pin the schema defaults a resolved read would have
 * carried. `sourceProfile` reads `migration`, which is how the copy is told
 * apart from one the import feature took.
 *
 * @param input - the plugin's section id, the live user layers and a timestamp.
 * @returns the snapshot object, ready to be written to `autoBackup`.
 */
export function rollbackSnapshot(input: RollbackSnapshotInput): Record<string, unknown> {
  const sections: Record<string, unknown> = {}
  for (const [ns, user] of Object.entries(input.sections)) {
    const copy: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(user)) {
      if ((RESERVED_PATH_KEYS as readonly string[]).includes(key)) continue
      if (ns === input.pluginNs && (SNAPSHOT_EXCLUDED_KEYS as readonly string[]).includes(key)) continue
      copy[key] = value
    }
    sections[ns] = copy
  }
  return {
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    createdAt: input.createdAt,
    pluginVersion: '',
    sourceProfile: 'migration',
    sections,
  }
}

export interface ApplyLegacyMigrationInput {
  readonly settings: HostSettings
  /** The plugin's own settings section id on the running host. */
  readonly ns: string
  readonly candidates: readonly LegacyCandidate[]
  /** Builds the rollback snapshot; called once, before the batch is sent. */
  readonly snapshot: () => Record<string, unknown>
  /** Clears the control object once the values have landed. */
  readonly clear: () => Promise<void>
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Write the offered values into the plugin's own settings section, preceded by
 * a rollback snapshot of the settings they extend.
 *
 * Both halves ride ONE `mutate`: the snapshot is the batch's first op and the
 * values follow it. That ordering is what makes "a rollback copy exists" and
 * "the migration happened" the same fact — a batch the host refuses cannot
 * leave a snapshot of a migration that never ran, and it cannot half-apply.
 *
 * Every value op targets a path the plugin's schema declares and the user has
 * not set, so the batch never overwrites a value the user chose; the snapshot
 * is there because the migration does extend their document.
 *
 * Failures are reported as a `lastResult` string rather than thrown: a refused
 * write is a state the prompt has to show and offer to retry, not an error that
 * should escape into the settings event that triggered it.
 *
 * @param input - the service, section id, candidates, snapshot builder and clearer.
 * @returns `applied`, or `failed:<reason>`.
 */
export async function applyLegacyMigration(input: ApplyLegacyMigrationInput): Promise<string> {
  const ops = opsForCandidates(input.candidates)
  if (ops.length === 0) return LEGACY_RESULT_APPLIED

  const mutate = input.settings.mutate
  if (typeof mutate !== 'function') {
    // A merge carries whole subtrees, so the only other route would restate the
    // resolved section and pin every schema default it took on. Refuse instead.
    return `${LEGACY_FAILED_PREFIX} settings service cannot address paths (no mutate)`
  }

  try {
    // Built inside the `try` on purpose: this module promises never to throw, and
    // a snapshot builder the caller supplies is code it does not control.
    const batch: SettingsPathOp[] = [
      { op: 'set', path: ['autoBackup'], value: input.snapshot() },
      ...ops,
    ]
    await mutate.call(input.settings, input.ns, batch)
  } catch (error) {
    return `${LEGACY_FAILED_PREFIX} ${reason(error)}`
  }

  try {
    await input.clear()
  } catch {
    // Swallowed on purpose. The VALUES LANDED, so this must report `applied` and
    // never `failed:` — a `failed:` result makes the prompt offer a retry, and a
    // retry rebuilds the rollback snapshot from the now-migrated user layer,
    // overwriting the one pre-migration copy with a copy of the migration
    // itself. That is the opposite of what the snapshot is for. The control
    // object is reconciled by the next scan instead.
  }
  return LEGACY_RESULT_APPLIED
}
