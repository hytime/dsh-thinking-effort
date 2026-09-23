/**
 * The control object the Host keeps in the plugin's own settings section to
 * drive the legacy-data migration prompt, and the accessors both halves read it
 * through.
 *
 * The Client cannot read files and this plugin exposes no Remote, so the
 * Settings section is the only channel between the two halves: the Host scans
 * the legacy documents and writes this object, the Client renders the prompt
 * from it and writes back one decision, and the Host performs the migration.
 *
 * Every field is optional because a hand-written section may omit any of them
 * and the schema supplies the defaults on resolution.
 */

/** The decisions the Client may write into `decision`; the Host acts on each. */
export const LEGACY_DECISIONS = ['migrate', 'dismiss', 'scan'] as const
export type LegacyDecision = (typeof LEGACY_DECISIONS)[number]

/** `lastResult` after a successful migration. */
export const LEGACY_RESULT_APPLIED = 'applied'
/** `lastResult` after the user chose not to be asked again. */
export const LEGACY_RESULT_DISMISSED = 'dismissed'
/**
 * `lastResult` after a rescan the user asked for that found nothing left to
 * migrate. The Client renders its "nothing pending" message from this value;
 * without it a completed scan recorded an empty string, which reads as "no
 * result yet" and left that message unreachable.
 */
export const LEGACY_RESULT_NOTHING_PENDING = 'nothing-pending'
/** Prefix of `lastResult` when the write was refused; the reason follows. */
export const LEGACY_FAILED_PREFIX = 'failed:'

/**
 * One leaf the legacy document states and the plugin's own section does not.
 * `path` addresses the plugin section's own schema, never the legacy document's.
 *
 * The array members are deliberately MUTABLE, unlike the rest of this file's
 * style. `PLUGIN_SETTINGS_SCHEMA` and `Config` are annotated `z<PluginSettings>`,
 * and schemastery's inferred object types are mutable, so a `readonly` array
 * cannot be assigned into the declared output type (`TS2322` on both roots).
 * Every consumer only reads, so nothing is lost by leaving them open.
 */
export interface LegacyCandidate {
  readonly path: string[]
  /**
   * A leaf of the plugin's schema: an effort level or mode name (string), a
   * model toggle (boolean), or a numeric option. Never a subtree — the host
   * maps whole subtrees leaf by leaf so one already-set sibling cannot block
   * the rest.
   */
  readonly value: string | boolean | number
  /** Which document stated it, for the prompt's provenance line. */
  readonly source: string
}

/** The published `legacyMigration` object, as far as either half reads it. */
export interface LegacyMigrationState {
  readonly pending?: boolean
  /** Mutable for the same `z<PluginSettings>` reason as {@link LegacyCandidate.path}. */
  readonly candidates?: LegacyCandidate[]
  readonly signature?: string
  readonly dismissedSignature?: string
  readonly decision?: string
  readonly lastResult?: string
  readonly scannedAt?: string
  readonly decidedAt?: string
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** The `legacyMigration` object of one published section's `user` layer. */
export function legacyMigrationOf(user: unknown): LegacyMigrationState | undefined {
  return record(record(user)?.legacyMigration) as LegacyMigrationState | undefined
}

/** The candidates a prompt lists; empty when none was ever written. */
export function legacyCandidatesOf(user: unknown): readonly LegacyCandidate[] {
  const candidates = legacyMigrationOf(user)?.candidates
  return Array.isArray(candidates) ? candidates as readonly LegacyCandidate[] : []
}

/**
 * Whether the Host is asking the user to decide. `pending` alone is not enough:
 * a section mid-write can carry the flag before its candidates land, and a
 * prompt with nothing to show would be an empty dialog.
 */
export function isLegacyMigrationPending(user: unknown): boolean {
  return legacyMigrationOf(user)?.pending === true && legacyCandidatesOf(user).length > 0
}

/** The decision the Client last wrote, when it is one the Host acts on. */
export function legacyDecisionOf(user: unknown): LegacyDecision | undefined {
  const decision = legacyMigrationOf(user)?.decision
  return typeof decision === 'string' && (LEGACY_DECISIONS as readonly string[]).includes(decision)
    ? decision as LegacyDecision
    : undefined
}
