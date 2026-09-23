import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { parse } from 'yaml'
import type { LegacyCandidate } from '../compat/legacy-migration.js'
import { LEGACY_LLM_SHAPE, LEGACY_OWN_SHAPE, leavesOf, type LegacyLeaf } from './legacy-shape.js'

/** Where one candidate came from, as the prompt reports it. */
export const LEGACY_MIGRATION_SOURCES = {
  live: 'llm-pi-ai',
  document: 'settings.yaml',
  imported: 'settings.yaml.imported',
} as const

/** The two documents DSH's 0.1.7 rename touched. */
const LEGACY_DOCUMENTS = [LEGACY_MIGRATION_SOURCES.document, LEGACY_MIGRATION_SOURCES.imported] as const

/** One scan's result: what to offer, and an identity for that offer. */
export interface LegacyScan {
  readonly candidates: readonly LegacyCandidate[]
  readonly signature: string
  /** Document paths that were opened, in order; diagnostics only. */
  readonly readPaths: readonly string[]
}

export interface LegacyScanInput {
  /** The DSH home the legacy documents live under. */
  readonly home: string
  /** Reads one document; rejects when it does not exist or cannot be read. */
  readonly read: (path: string) => Promise<string>
  /** The plugin's own settings section user layer, as published. */
  readonly ownUser: unknown
  /** The live `llm-pi-ai` user layer, as published. */
  readonly llmPiAiUser: unknown
  /** Base name of the current document; tests override it. */
  readonly documentName?: string
  readonly importedName?: string
}

/** The `subagentEffort` one section's user layer states, when it states one. */
function liveSubagentEffort(llmPiAiUser: unknown): LegacyLeaf | undefined {
  return leavesOf(LEGACY_LLM_SHAPE, llmPiAiUser)[0]
}

/** Whether a dotted path is already declared in the plugin's own user layer. */
function declared(ownUser: unknown, path: readonly string[]): boolean {
  let node: unknown = ownUser
  for (const key of path) {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) return false
    if (!Object.prototype.hasOwnProperty.call(node, key)) return false
    node = (node as Record<string, unknown>)[key]
  }
  return true
}

function parseDocument(text: string): unknown {
  try {
    return parse(text)
  } catch {
    // A document this plugin cannot parse is one it cannot migrate from. The
    // scan keeps going: the other source may still be intact, and a settings
    // import that fails must never take plugin activation with it.
    return undefined
  }
}

function sectionOf(document: unknown, key: string): unknown {
  if (typeof document !== 'object' || document === null || Array.isArray(document)) return undefined
  return (document as Record<string, unknown>)[key]
}

/**
 * Every legacy leaf worth offering for migration.
 *
 * Sources are consulted in priority order and the first statement of a path
 * wins, so a document that is still live (`settings.yaml`) outranks the renamed
 * one, and the live `llm-pi-ai` layer outranks both. A path the plugin's own
 * section already declares is dropped: the migration only ever fills in values
 * the user has not set, so it cannot overwrite anything.
 *
 * @param input - the home, a document reader and both live user layers.
 * @returns the candidates and their signature; never throws.
 */
export async function scanLegacyData(input: LegacyScanInput): Promise<LegacyScan> {
  const documentName = input.documentName ?? LEGACY_MIGRATION_SOURCES.document
  const importedName = input.importedName ?? LEGACY_MIGRATION_SOURCES.imported
  const readPaths: string[] = []
  const found = new Map<string, LegacyCandidate>()

  const offer = (leaf: LegacyLeaf, source: string): void => {
    const key = leaf.path.join('\u0000')
    if (found.has(key) || declared(input.ownUser, leaf.path)) return
    // `LegacyLeaf.path` is readonly and `LegacyCandidate.path` is not (task 1's
    // `z<PluginSettings>` constraint), so the array is copied rather than shared.
    found.set(key, { path: [...leaf.path], value: leaf.value, source })
  }

  const live = liveSubagentEffort(input.llmPiAiUser)
  if (live !== undefined) offer(live, LEGACY_MIGRATION_SOURCES.live)

  for (const [name, source] of [[documentName, LEGACY_MIGRATION_SOURCES.document], [importedName, LEGACY_MIGRATION_SOURCES.imported]] as const) {
    const path = join(input.home, name)
    readPaths.push(path)
    let text: string
    try {
      text = await input.read(path)
    } catch {
      continue
    }
    const document = parseDocument(text)
    for (const leaf of leavesOf(LEGACY_OWN_SHAPE, sectionOf(document, 'dsh-thinking-effort'))) offer(leaf, source)
    for (const leaf of leavesOf(LEGACY_LLM_SHAPE, sectionOf(document, 'llm-pi-ai'))) offer(leaf, source)
  }

  const candidates = [...found.values()].sort((left, right) => (
    left.path.join('.').localeCompare(right.path.join('.'))
  ))
  return { candidates, signature: signatureOf(candidates), readPaths }
}

/**
 * A stable identity for one offer. Sorted by path, so document key order and
 * source order cannot change it; used to tell "the user already declined this
 * exact offer" from "the legacy data changed since they declined".
 */
export function signatureOf(candidates: readonly LegacyCandidate[]): string {
  const sorted = [...candidates].sort((left, right) => left.path.join('.').localeCompare(right.path.join('.')))
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
}
