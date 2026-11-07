import packageJson from '@hytime/dsh-thinking-effort/package.json' with { type: 'json' }
import type { ConfigSnapshot, ImportMode, ParseFailure, ProfileNameError, SnapshotMeta } from '../../config-snapshot/types.js'
import type { CompatibilityProfile, SettingsNamespace } from '@hytime/dsh-plugin-kit'
import { autoBackupFromNamespaces, profilesFromNamespaces } from '../../config-snapshot/library.js'

/** The version stamped into every snapshot this panel writes. */
export const PLUGIN_VERSION = packageJson.version

/**
 * The parser failure codes the card can display, mapped to their copy.
 *
 * Kept as an exhaustive record rather than a `switch` so a new code added to
 * `ParseFailure` fails the type check here instead of silently rendering
 * nothing.
 */
export const PARSE_ERROR_KEYS: Record<ParseFailure['code'], string> = {
  tooLarge: 'backupParseTooLarge',
  invalidJson: 'backupParseInvalidJson',
  notObject: 'backupParseNotObject',
  kindMismatch: 'backupParseKindMismatch',
  unsupportedVersion: 'backupParseVersion',
  missingSections: 'backupParseSections',
  invalidSection: 'backupParseSection',
  reservedKey: 'backupParseReserved',
}

/** The profile-name validation failures, mapped to their copy the same way. */
export const NAME_ERROR_KEYS: Record<ProfileNameError, string> = {
  required: 'backupNameRequired',
  tooLong: 'backupNameTooLong',
  reserved: 'backupNameReserved',
  invalid: 'backupNameInvalid',
  taken: 'backupNameTaken',
}

/** One snapshot waiting for the user's confirmation, with where it came from. */
export interface PendingImport {
  readonly snapshot: ConfigSnapshot
  readonly label: string
  readonly ignored: readonly string[]
}

/** A snapshot plus the revision of the section it was built from. */
export interface FreshSettings {
  readonly snapshot: ConfigSnapshot
  /** The plugin namespace's revision in the same read, so a write is guarded with the data it was built from. */
  readonly revision: number
}

/** Everything the card renders, in one value. */
export interface CardState {
  open: boolean
  namespaces: readonly SettingsNamespace[]
  writable: boolean
  profiles: Record<string, ConfigSnapshot>
  profileNames: readonly string[]
  autoBackupAt: string | null
  nameDraft: string
  pendingDelete: string | null
  preview: PendingImport | null
  mode: ImportMode
  /** Opt-in to importing endpoint / credential / script wiring. Never sticky. */
  importWiring: boolean
  busy: boolean
  error: string | null
  /** Lines shown in the status block: the apply result, plus any warning that came with it. */
  notice: readonly string[]
}

export const initialState: CardState = {
  open: false, namespaces: [], writable: true, profiles: {}, profileNames: [],
  autoBackupAt: null, nameDraft: '', pendingDelete: null, preview: null, mode: 'merge', importWiring: false,
  busy: false, error: null, notice: [],
}

/**
 * Fold one `describe` answer into the card state.
 *
 * One describe answer is the whole registry, and three consumers read it — the
 * profile library, the export snapshot and the import summary — so they all take
 * it through this mapping and cannot disagree about what the settings hold. The
 * library readers resolve the plugin section's id from this same read, so under
 * the 0.1.7 entry-config model they key on the Loader entry rather than the
 * legacy registered namespace.
 */
export function withNamespaces(current: CardState, value: { namespaces: readonly SettingsNamespace[]; writable?: boolean }): CardState {
  const namespaces = value.namespaces
  const profiles = profilesFromNamespaces(namespaces)
  return {
    ...current,
    namespaces,
    writable: value.writable !== false,
    profiles,
    profileNames: Object.keys(profiles).sort(),
    autoBackupAt: autoBackupFromNamespaces(namespaces)?.createdAt ?? null,
  }
}

/** The snapshot metadata stamped onto every export this card produces. */
export function snapshotMeta(now: () => Date, profile: CompatibilityProfile): SnapshotMeta {
  return {
    createdAt: now().toISOString(),
    pluginVersion: PLUGIN_VERSION,
    sourceProfile: profile,
  }
}
