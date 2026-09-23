import {
  LLM_NAMESPACE,
  PLUGIN_NAMESPACE,
  RESERVED_PATH_KEYS,
  SNAPSHOT_KIND,
  SNAPSHOT_MAX_BYTES,
  SNAPSHOT_VERSION,
} from './types.js'
import type { ConfigSnapshot, ParseResult, ParsedSnapshot, SnapshotSection } from './types.js'
import { isRecord } from './snapshot.js'
import { isOpenCodeSessionSectionId } from '../../compat/opencode-session.js'

function byteLength(text: string): number {
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(text).length : text.length
}

/**
 * Nesting levels the reserved-key walk descends before refusing the section. A
 * snapshot holds a handful of levels of settings objects, so the bound never
 * rejects real configuration — it keeps the walk's recursion finite instead of
 * leaving it to whatever stack the host happens to have.
 */
const MAX_SECTION_DEPTH = 100

/** Walk result for a value nested `MAX_SECTION_DEPTH` levels or deeper. */
const DEPTH_EXCEEDED = Symbol('sectionDepthExceeded')

/**
 * First reserved path segment found anywhere in the value, if any, or
 * `DEPTH_EXCEEDED` when the value nests `MAX_SECTION_DEPTH` levels or deeper.
 */
function findReservedKey(value: unknown, depth = 0): string | typeof DEPTH_EXCEEDED | undefined {
  if (depth >= MAX_SECTION_DEPTH) return DEPTH_EXCEEDED
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findReservedKey(entry, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (!isRecord(value)) return undefined
  for (const [key, entry] of Object.entries(value)) {
    if ((RESERVED_PATH_KEYS as readonly string[]).includes(key)) return key
    const found = findReservedKey(entry, depth + 1)
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
    // Both settings models' ids are this plugin's own section: the registered
    // `dsh-thinking-effort` before 0.1.7, and the Loader entry id under the
    // entry-config model. Accepting only the legacy id would make a file this
    // plugin itself exported on 0.1.7 re-import as an ignored namespace, with
    // its configuration replaced by `{}`.
    if (ns !== LLM_NAMESPACE && !isOpenCodeSessionSectionId(ns)) {
      ignoredNamespaces.push(ns)
      continue
    }
    const reserved = findReservedKey(section)
    if (reserved === DEPTH_EXCEEDED) {
      return { ok: false, error: { code: 'invalidSection', params: { ns, maxDepth: MAX_SECTION_DEPTH } } }
    }
    if (reserved !== undefined) return { ok: false, error: { code: 'reservedKey', params: { key: reserved, ns } } }
    sections[ns] = section
  }

  // Normalise the shape callers read: the model namespace is always present,
  // and the plugin's own section falls back to the legacy id only when the file
  // carried neither id — a file from before either model existed, or one whose
  // plugin half is a reset. Which id the file actually carries is preserved
  // rather than rewritten, so the model that exported it stays legible.
  sections[LLM_NAMESPACE] ??= {}
  if (!Object.keys(sections).some((ns) => isOpenCodeSessionSectionId(ns))) sections[PLUGIN_NAMESPACE] = {}

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
