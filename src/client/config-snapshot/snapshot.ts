import {
  CONFIG_NAMESPACES,
  PLUGIN_NAMESPACE,
  PLUGIN_SNAPSHOT_EXCLUDED_KEYS,
  SNAPSHOT_KIND,
  SNAPSHOT_VERSION,
} from './types.js'
import type { ConfigSnapshot, SnapshotMeta, SnapshotSection } from './types.js'
import { isOpenCodeSessionSectionId, PLUGIN_ENTRY_ID } from '../../compat/opencode-session.js'
import type { SettingsNamespace } from '../types.js'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The namespace's RAW user layer — what `settings.yaml` actually stores, with
 * schema defaults and the composition base left out. Reading `value` instead
 * would bake derived data into the snapshot and turn it into user config on
 * import.
 */
export function userSectionOf(namespaces: readonly SettingsNamespace[], ns: string): SnapshotSection {
  const found = namespaces.find((entry) => entry.ns === ns)
  const user = found === undefined ? undefined : found.user
  return isRecord(user) ? { ...user } : {}
}

/**
 * Which of a snapshot's sections holds this plugin's own configuration.
 *
 * `resolved` is the id the running host addresses that section by — the entry
 * id under the 0.1.7 entry-config model, `dsh-thinking-effort` on legacy
 * releases. A file exported by the other model carries the other id, so the
 * section is keyed by whichever of the two the file actually holds rather than
 * by a constant: reading the wrong key would silently snapshot the plugin's
 * settings as `{}` and write them back nowhere.
 *
 * Content decides, not mere presence. An exporter always writes both of
 * `CONFIG_NAMESPACES`, so a file at the other model's id carries one empty
 * plugin key and one populated one; keying on presence alone would pick the
 * empty one whenever it happens to be the host's own id.
 */
export function pluginSectionKey(
  sections: Readonly<Record<string, unknown>>,
  resolved: string,
): string {
  const alternate = resolved === PLUGIN_NAMESPACE ? PLUGIN_ENTRY_ID : PLUGIN_NAMESPACE
  const populated = (key: string): boolean => {
    const section = sections[key]
    return isRecord(section) && Object.keys(section).length > 0
  }
  if (populated(resolved)) return resolved
  if (populated(alternate)) return alternate
  return Object.prototype.hasOwnProperty.call(sections, resolved) ? resolved : alternate
}

/**
 * Whether a key of `ns` belongs to the snapshot library itself — the profile
 * library and the rollback copy — rather than to the configuration a snapshot
 * carries. Both directions of a snapshot ask this one question: the export
 * leaves these keys out of a file, and an import must never write them back. A
 * hand-edited file that carries them would otherwise replace the user's profile
 * library, or the rollback copy written moments before the apply.
 *
 * This is a property of the plugin's own section, which the 0.1.7 entry-config
 * model addresses by entry id, so the id is accepted rather than compared.
 */
export function isSnapshotLibraryKey(ns: string, key: string): boolean {
  return isOpenCodeSessionSectionId(ns) && (PLUGIN_SNAPSHOT_EXCLUDED_KEYS as readonly string[]).includes(key)
}

/** The plugin section minus the snapshot library itself, which cannot nest inside its own entries. */
export function pluginSectionOf(user: SnapshotSection): SnapshotSection {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(user)) {
    if (isSnapshotLibraryKey(PLUGIN_NAMESPACE, key)) continue
    next[key] = value
  }
  return next
}

export function snapshotFromNamespaces(
  namespaces: readonly SettingsNamespace[],
  meta: SnapshotMeta,
  /** The id this host addresses the plugin section by; defaults to the legacy registered namespace. */
  pluginNamespace: string = PLUGIN_NAMESPACE,
): ConfigSnapshot {
  const sections: Record<string, SnapshotSection> = {}
  for (const ns of CONFIG_NAMESPACES) {
    const target = ns === PLUGIN_NAMESPACE ? pluginNamespace : ns
    const user = userSectionOf(namespaces, target)
    sections[target] = target === pluginNamespace ? pluginSectionOf(user) : user
  }
  return {
    kind: SNAPSHOT_KIND,
    version: SNAPSHOT_VERSION,
    createdAt: meta.createdAt,
    pluginVersion: meta.pluginVersion,
    sourceProfile: meta.sourceProfile,
    sections,
  }
}

/** `dsh-config-YYYYMMDD-HHmm.json` in local time. */
export function snapshotFileName(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `dsh-config-${stamp}.json`
}

/**
 * Structural JSON equality. Lives here rather than beside `planImport` because
 * both the planner and the wiring rules compare values, and a planner that
 * imports the wiring module must not import back into itself.
 */
export function deepEqualJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((entry, index) => deepEqualJson(entry, right[index]))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqualJson(left[key], right[key]))
}
