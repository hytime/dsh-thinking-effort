import {
  CONFIG_NAMESPACES,
  PLUGIN_NAMESPACE,
  PLUGIN_SNAPSHOT_EXCLUDED_KEYS,
  SNAPSHOT_KIND,
  SNAPSHOT_VERSION,
} from './types.js'
import type { ConfigSnapshot, SnapshotMeta, SnapshotSection } from './types.js'
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
 * Whether a key of `ns` belongs to the snapshot library itself — the profile
 * library and the rollback copy — rather than to the configuration a snapshot
 * carries. Both directions of a snapshot ask this one question: the export
 * leaves these keys out of a file, and an import must never write them back. A
 * hand-edited file that carries them would otherwise replace the user's profile
 * library, or the rollback copy written moments before the apply.
 */
export function isSnapshotLibraryKey(ns: string, key: string): boolean {
  return ns === PLUGIN_NAMESPACE && (PLUGIN_SNAPSHOT_EXCLUDED_KEYS as readonly string[]).includes(key)
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
): ConfigSnapshot {
  const sections: Record<string, SnapshotSection> = {}
  for (const ns of CONFIG_NAMESPACES) {
    const user = userSectionOf(namespaces, ns)
    sections[ns] = ns === PLUGIN_NAMESPACE ? pluginSectionOf(user) : user
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
