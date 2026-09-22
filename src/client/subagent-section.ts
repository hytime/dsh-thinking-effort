import { PLUGIN_ENTRY_ID } from '../compat/settings-model.js'
import { NS } from './constants.js'
import type { SettingsNamespace } from './types.js'

/**
 * The plugin's own settings section when the running host publishes one.
 *
 * Under the 0.1.7 entry-config model a Loader entry owns exactly one section,
 * addressed by the entry id, and every plugin setting — the OpenCode session
 * fields, the config snapshots and `subagentEffort` — lives in it. Legacy
 * releases register the `dsh-thinking-effort` namespace instead and never
 * publish an entry id, so this returns `undefined` there and callers keep the
 * `llm-pi-ai` path.
 */
export function pluginEntrySection(
  namespaces: readonly SettingsNamespace[],
): SettingsNamespace | undefined {
  return namespaces.find((entry) => entry.ns === PLUGIN_ENTRY_ID)
}

/** One resolved `subagentEffort` write: the section to address and its revision. */
export interface SubagentEffortTarget {
  readonly ns: string
  /**
   * The revision of `ns`'s raw user section, which is what the write has to
   * send back as `expectedRevision`. Revisions are per section, so the plugin's
   * own section cannot be written with the `llm-pi-ai` revision.
   */
  readonly revision: number
  /** True when the write lands in the plugin's own entry section. */
  readonly ownSection: boolean
}

/**
 * Where a `subagentEffort` write goes. Entry-config hosts store it in the
 * plugin's own section; legacy hosts keep writing the `llm-pi-ai` section they
 * already hold, so an existing user's setting stays where that host reads it.
 */
export function subagentEffortTarget(
  ownSection: SettingsNamespace | null | undefined,
  legacyRevision: number,
): SubagentEffortTarget {
  if (ownSection === null || ownSection === undefined) {
    return { ns: NS, revision: legacyRevision, ownSection: false }
  }
  return {
    ns: ownSection.ns,
    revision: typeof ownSection.revision === 'number' ? ownSection.revision : 0,
    ownSection: true,
  }
}
