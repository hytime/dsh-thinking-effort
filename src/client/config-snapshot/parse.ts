import {
  CONFIG_NAMESPACES,
  RESERVED_PATH_KEYS,
  SNAPSHOT_KIND,
  SNAPSHOT_MAX_BYTES,
  SNAPSHOT_VERSION,
} from './types.js'
import type { ConfigSnapshot, ParseResult, ParsedSnapshot, SnapshotSection } from './types.js'
import { isRecord } from './snapshot.js'

function byteLength(text: string): number {
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(text).length : text.length
}

/** First reserved path segment found anywhere in the value, if any. */
function findReservedKey(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findReservedKey(entry)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (!isRecord(value)) return undefined
  for (const [key, entry] of Object.entries(value)) {
    if ((RESERVED_PATH_KEYS as readonly string[]).includes(key)) return key
    const found = findReservedKey(entry)
    if (found !== undefined) return found
  }
  return undefined
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

/**
 * Validate an untrusted snapshot document. Every failure refuses the whole
 * file: a partial import would persist half a configuration while reporting
 * success. Unknown namespaces are the one tolerated deviation, because a
 * snapshot written by a newer plugin is otherwise still usable.
 */
export function parseSnapshot(input: string): ParseResult<ParsedSnapshot> {
  if (byteLength(input) > SNAPSHOT_MAX_BYTES) {
    return { ok: false, error: { code: 'tooLarge', params: { maxBytes: SNAPSHOT_MAX_BYTES } } }
  }

  let document: unknown
  try {
    document = JSON.parse(input)
  } catch {
    return { ok: false, error: { code: 'invalidJson' } }
  }

  if (!isRecord(document)) return { ok: false, error: { code: 'notObject' } }
  if (document.kind !== SNAPSHOT_KIND) return { ok: false, error: { code: 'kindMismatch', params: { kind: SNAPSHOT_KIND } } }
  if (document.version !== SNAPSHOT_VERSION) {
    return { ok: false, error: { code: 'unsupportedVersion', params: { version: document.version, supported: SNAPSHOT_VERSION } } }
  }

  const rawSections = document.sections
  if (!isRecord(rawSections)) return { ok: false, error: { code: 'missingSections' } }

  const ignoredNamespaces: string[] = []
  const sections: Record<string, SnapshotSection> = {}
  for (const [ns, section] of Object.entries(rawSections)) {
    if (!isRecord(section)) return { ok: false, error: { code: 'invalidSection', params: { ns } } }
    if (!(CONFIG_NAMESPACES as readonly string[]).includes(ns)) {
      ignoredNamespaces.push(ns)
      continue
    }
    const reserved = findReservedKey(section)
    if (reserved !== undefined) return { ok: false, error: { code: 'reservedKey', params: { key: reserved, ns } } }
    sections[ns] = section
  }

  for (const ns of CONFIG_NAMESPACES) sections[ns] ??= {}

  return {
    ok: true,
    value: {
      snapshot: {
        kind: SNAPSHOT_KIND,
        version: SNAPSHOT_VERSION,
        createdAt: text(document.createdAt, ''),
        pluginVersion: text(document.pluginVersion, ''),
        sourceProfile: text(document.sourceProfile, 'unknown'),
        sections,
      },
      ignoredNamespaces,
    },
  }
}

/** Pretty-printed with a trailing newline so the file diffs cleanly in version control. */
export function serializeSnapshot(snapshot: ConfigSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}
