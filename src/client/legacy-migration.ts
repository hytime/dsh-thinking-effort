import { isLegacyMigrationPending, legacyDecisionOf, legacyMigrationOf, type LegacyDecision } from '../compat/legacy-migration.js'
import { pluginSection } from './subagent-section.js'
import type { SettingsApi, SettingsOp } from './types.js'

/** The plugin section and the control object it publishes, when either exists. */
export interface LegacyMigrationRead {
  readonly ns: string
  readonly revision: number
  readonly user: Record<string, unknown>
}

/**
 * Read the migration control object from whichever section the running host
 * published. The Client cannot tell the settings model apart (its bridge only
 * answers `describe`/`mutate`), so it resolves the section id the way every
 * other plugin setting does, through `pluginSection`.
 *
 * A describe that reports an error, or a host that publishes no such section,
 * both read as "nothing to ask about" — the caller has nothing to render either
 * way, and the next poll retries.
 */
export async function readLegacyMigration(settings: SettingsApi): Promise<LegacyMigrationRead | undefined> {
  const response = await settings.describe()
  if (!response.ok) return undefined
  const section = pluginSection(response.value.namespaces)
  if (section === undefined) return undefined
  return {
    ns: section.ns,
    revision: typeof section.revision === 'number' ? section.revision : 0,
    user: (section.user ?? {}) as Record<string, unknown>,
  }
}

/** Whether the host is asking, from one already-read control object. */
export function pendingMigrationOf(user: unknown): boolean {
  return isLegacyMigrationPending(user)
}

/** The decision the host already recorded, if any. */
export function recordedDecisionOf(user: unknown): LegacyDecision | undefined {
  return legacyDecisionOf(user)
}

/** The `lastResult` of one already-read control object. */
export function lastResultOf(user: unknown): string {
  const result = legacyMigrationOf(user)?.lastResult
  return typeof result === 'string' ? result : ''
}

/** One decision write into the plugin's own section. */
export function decisionOps(decision: LegacyDecision): SettingsOp[] {
  return [{ op: 'set', path: ['legacyMigration', 'decision'], value: decision }]
}

/**
 * Write one decision.
 *
 * The host returns a `ClientResult`, so a refusal arrives as `ok: false` rather
 * than a rejection; it is rethrown as an `Error` so the component has one
 * failure path to render.
 */
export async function writeLegacyDecision(
  settings: SettingsApi,
  target: LegacyMigrationRead,
  decision: LegacyDecision,
): Promise<void> {
  const response = await settings.mutate(target.ns, decisionOps(decision), target.revision)
  if (!response.ok) throw new Error(response.error.message)
}
