import {
  LEGACY_FAILED_PREFIX,
  LEGACY_RESULT_APPLIED,
  LEGACY_RESULT_DISMISSED,
  LEGACY_RESULT_NOTHING_PENDING,
  legacyMigrationOf,
} from '../../../compat/legacy-migration.js'
import { isPluginEntrySection } from '../../subagent-section.js'
import type { SettingsNamespace, Translation } from '../../types.js'

/** What the manual legacy-rescan block reads off the published control object. */
export interface LegacyRescanView {
  /** Whether this host publishes the plugin's own Loader entry section. */
  readonly available: boolean
  /** The result sentence, or `null` when the section publishes no result. */
  readonly message: string | null
  /** A refused write is a failure, not a result to celebrate. */
  readonly failed: boolean
  /** The raw result string, so the caller can pick the colour. */
  readonly result: string
}

/**
 * Read the legacy-migration control object out of the plugin's own section.
 *
 * `available` is false on a host that does not publish the Loader entry section,
 * because `installLegacyMigration` only subscribes to that one: the button there
 * would write a `decision` nobody consumes or clears into the user's settings
 * document, so the whole block is withheld rather than shown inert.
 *
 * The result mapping is explicit rather than a catch-all: an unrecognized value —
 * a hand-edited section, or a result a later Host adds — is reported as nothing
 * rather than mislabelled as "nothing pending". A completed rescan that found
 * nothing is the Host's own `nothing-pending`, which is the one sentence this
 * manual entry point exists to show.
 */
export function legacyRescanView(ownSection: SettingsNamespace | undefined, t: Translation): LegacyRescanView {
  const state = legacyMigrationOf(ownSection?.user)
  const result = typeof state?.lastResult === 'string' ? state.lastResult : ''
  const failed = result.startsWith(LEGACY_FAILED_PREFIX)
  const message = ((): string | null => {
    if (result === '') return null
    if (failed) return t('legacyMigrationFailed', { reason: result.slice(LEGACY_FAILED_PREFIX.length).trim() })
    if (result === LEGACY_RESULT_APPLIED) return t('legacyMigrationApplied')
    if (result === LEGACY_RESULT_DISMISSED) return t('legacyMigrationDismissed')
    if (result === LEGACY_RESULT_NOTHING_PENDING) return t('legacyMigrationNothingPending')
    return null
  })()
  return { available: isPluginEntrySection(ownSection), message, failed, result }
}
