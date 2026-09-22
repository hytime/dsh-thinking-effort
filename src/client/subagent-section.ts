import { PLUGIN_ENTRY_ID } from '../compat/settings-model.js'
import { OPENCODE_SESSION_NAMESPACE } from '../compat/opencode-session.js'
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

/**
 * The one section this plugin's configuration lives in under whichever model
 * the running host exposes.
 *
 * The Client cannot detect the model itself: its settings bridge exposes only
 * `describe`/`mutate`, so `settingsModelOf` always answers `entry-config`
 * there. The published section ids are the only discriminator, so they are
 * read once here rather than as an `ns === …` comparison at every call site:
 * the entry section when the host published one (0.1.7 and later), and the
 * registered `dsh-thinking-effort` namespace otherwise (rc.7 … 0.1.6), which
 * is also the answer when neither exists — a missing section reads as
 * unconfigured either way.
 */
export function pluginSection(
  namespaces: readonly SettingsNamespace[],
): SettingsNamespace | undefined {
  return pluginEntrySection(namespaces) ?? namespaces.find((entry) => entry.ns === OPENCODE_SESSION_NAMESPACE)
}

/** The id of `pluginSection`, resolved the same way and falling back to the legacy namespace id. */
export function pluginSectionId(namespaces: readonly SettingsNamespace[]): string {
  return pluginSection(namespaces)?.ns ?? OPENCODE_SESSION_NAMESPACE
}

/**
 * Whether `section` is the plugin's own Loader entry section — the one the
 * 0.1.7 entry-config model derives from this plugin's exported `Config`.
 *
 * The published section id is the only discriminator the Client has, so this is
 * the one place that compares it. Callers hold the plugin's section in a single
 * field and ask this when the answer decides where a setting is written: a
 * section that is not the entry section is the legacy registered namespace, and
 * `subagentEffort` may only be written into the entry section.
 */
export function isPluginEntrySection(section: SettingsNamespace | null | undefined): boolean {
  return section !== null && section !== undefined && section.ns === PLUGIN_ENTRY_ID
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
