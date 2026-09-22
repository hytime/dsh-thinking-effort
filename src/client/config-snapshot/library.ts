import {
  MAX_PROFILE_NAME,
  PLUGIN_NAMESPACE,
  RESERVED_PATH_KEYS,
  SNAPSHOT_KIND,
  SNAPSHOT_VERSION,
} from './types.js'
import type { ConfigSnapshot, ProfileNameResult } from './types.js'
import { isRecord, userSectionOf } from './snapshot.js'
import type { SettingsNamespace, SettingsOp } from '../types.js'

export const PROFILES_PATH = ['profiles'] as const
export const AUTO_BACKUP_PATH = ['autoBackup'] as const

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/

/** Whether a stored value has the shape of a snapshot this build can apply. */
function isStoredSnapshot(value: unknown): value is ConfigSnapshot {
  return isRecord(value)
    && value.kind === SNAPSHOT_KIND
    && value.version === SNAPSHOT_VERSION
    && isRecord(value.sections)
}

/**
 * Read the profile library defensively: `settings.yaml` is user-editable, so a
 * hand-written entry must be dropped rather than crash the settings page.
 *
 * `pluginNamespace` is the id the running host addresses the plugin section by
 * — the Loader entry under the 0.1.7 entry-config model, and the legacy
 * registered namespace on older releases. The library and the rest of the
 * plugin's settings live in the same section, so keying it by a constant would
 * read the library as absent on 0.1.7.
 */
export function profilesFromNamespaces(
  namespaces: readonly SettingsNamespace[],
  pluginNamespace: string = PLUGIN_NAMESPACE,
): Record<string, ConfigSnapshot> {
  const user = userSectionOf(namespaces, pluginNamespace)
  const raw = user.profiles
  if (!isRecord(raw)) return {}

  const profiles: Record<string, ConfigSnapshot> = {}
  for (const [name, value] of Object.entries(raw)) {
    // The save side refuses these names, so the read side must too: a hand-edited
    // `profiles.__proto__` entry would otherwise go through [[Set]] and rewrite
    // this accumulator's prototype instead of becoming a key, while
    // `constructor`/`prototype` entries would be offered as real profiles.
    if ((RESERVED_PATH_KEYS as readonly string[]).includes(name)) continue
    if (isStoredSnapshot(value)) profiles[name] = value
  }
  return profiles
}

/** The auto backup written before a destructive apply; absent until one is written. */
export function autoBackupFromNamespaces(
  namespaces: readonly SettingsNamespace[],
  pluginNamespace: string = PLUGIN_NAMESPACE,
): ConfigSnapshot | undefined {
  const value = userSectionOf(namespaces, pluginNamespace).autoBackup
  if (!isStoredSnapshot(value) || value.createdAt === '') return undefined
  return value
}

export function validateProfileName(name: string, existing: readonly string[]): ProfileNameResult {
  const trimmed = name.trim()
  if (trimmed.length === 0) return { ok: false, error: 'required' }
  if (trimmed.length > MAX_PROFILE_NAME) return { ok: false, error: 'tooLong' }
  if ((RESERVED_PATH_KEYS as readonly string[]).includes(trimmed)) return { ok: false, error: 'reserved' }
  if (CONTROL_CHARACTERS.test(trimmed)) return { ok: false, error: 'invalid' }
  if (existing.includes(trimmed)) return { ok: false, error: 'taken' }
  return { ok: true, value: trimmed }
}

export function saveProfileOps(name: string, snapshot: ConfigSnapshot): SettingsOp[] {
  return [{ op: 'set', path: [...PROFILES_PATH, name], value: snapshot }]
}

export function deleteProfileOps(name: string): SettingsOp[] {
  return [{ op: 'unset', path: [...PROFILES_PATH, name] }]
}

export function autoBackupOps(snapshot: ConfigSnapshot): SettingsOp[] {
  return [{ op: 'set', path: [...AUTO_BACKUP_PATH], value: snapshot }]
}
