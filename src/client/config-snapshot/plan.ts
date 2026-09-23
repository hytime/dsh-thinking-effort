import { CONFIG_NAMESPACES, LLM_NAMESPACE, PLUGIN_NAMESPACE } from './types.js'
import type { ConfigSnapshot, ImportMode, ImportPlan, NamespacePlan, SnapshotSection, WiringReport } from './types.js'
import { userSectionOf, isRecord, isSnapshotLibraryKey, deepEqualJson, pluginSectionKey } from './snapshot.js'
import { adjustIncoming, mergeWiringReports } from './wiring.js'
import { pluginSectionId } from '../subagent-section.js'
import { PLUGIN_ENTRY_ID } from '../../compat/opencode-session.js'
import type { SettingsNamespace, SettingsOp } from '../types.js'

export { deepEqualJson } from './snapshot.js'

function has(object: SnapshotSection, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

/**
 * Plugin-owned keys the releases before 0.1.7 wrote into the `llm-pi-ai`
 * section and the entry-config model no longer declares there.
 *
 * The entry-config writer refuses a WHOLE batch when any op path is not
 * volatile, and `llm-pi-ai` declares only `providers`. A snapshot the plugin
 * exported before 0.1.7 — when it still wrote `subagentEffort` into
 * `llm-pi-ai` — therefore plans that `set` beside the `providers` `set`, and
 * the host rejects both: the user's providers do not import either. Both halves
 * are the plugin's to fix, because the key and the entry that supersedes it
 * belong to this plugin: the key is dropped from the plan for `llm-pi-ai` and,
 * when the file states a value, migrated into the plugin's own section, which
 * does declare it.
 */
const LEGACY_LLM_SECTION_KEYS = ['subagentEffort'] as const

/** `section` without the plugin keys the entry-config `llm-pi-ai` schema does not declare. */
function withoutLegacyLlmKeys(section: SnapshotSection): SnapshotSection {
  if (!LEGACY_LLM_SECTION_KEYS.some((key) => has(section, key))) return section
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(section)) {
    if (!(LEGACY_LLM_SECTION_KEYS as readonly string[]).includes(key)) next[key] = value
  }
  return next
}

/**
 * The file's sections as the entry-config host can accept them.
 *
 * `llm-pi-ai` loses the plugin keys that host does not declare, and the plugin
 * section gains the ones the file still states — the migration that keeps a
 * setting the user already chose. The plugin section wins when the file states
 * the key in both places, because that section is the model that wrote it
 * second. A value that is not a non-empty string is dropped rather than
 * migrated: the plugin's own schema spells "unset" as an empty string, and
 * there is nothing else a host could have written there.
 *
 * A file with no such key is returned untouched, so the only plans this
 * changes are the ones the entry-config writer would otherwise refuse.
 */
function sectionsForEntryConfig(
  snapshot: ConfigSnapshot,
  pluginKey: string,
): Readonly<Record<string, SnapshotSection>> {
  const sections = snapshot.sections
  const fileLlm = sections[LLM_NAMESPACE]
  if (!isRecord(fileLlm) || !LEGACY_LLM_SECTION_KEYS.some((key) => has(fileLlm, key))) return sections

  const rawPlugin = sections[pluginKey]
  const plugin: Record<string, unknown> = isRecord(rawPlugin) ? { ...rawPlugin } : {}
  const llm: Record<string, unknown> = { ...fileLlm }
  for (const key of LEGACY_LLM_SECTION_KEYS) {
    const value = llm[key]
    delete llm[key]
    if (!has(plugin, key) && typeof value === 'string' && value.length > 0) plugin[key] = value
  }
  return { ...sections, [pluginKey]: plugin, [LLM_NAMESPACE]: llm }
}

/**
 * Count one removed entry. A dict-valued entry counts its own first-level
 * items — the unit the user reasons about is a provider, not a key — but never
 * fewer than one: deleting a settings key is a user-visible change even when
 * the value it held was an empty dict, so the summary must not read zero.
 */
function countRemoved(value: unknown): number {
  return isRecord(value) ? Math.max(1, Object.keys(value).length) : 1
}

export interface PlanOptions {
  /** Apply the file's endpoint / credential / script wiring too. Defaults to false. */
  readonly importWiring?: boolean
  /**
   * The id the running host addresses the plugin section by, when the caller
   * already resolved it. Absent, it is resolved from `namespaces` — the same
   * `describe()` result the diff runs against — so a caller cannot silently
   * plan against the legacy id on an entry-config host.
   */
  readonly pluginNamespace?: string
}

/**
 * Compute the path ops that turn `current` into `snapshot`.
 *
 * Both modes merge at exactly one level: the first level of a dict-valued
 * entry is compared per key and each key is replaced wholesale, while
 * everything below it is written as one value. Whole-provider replacement is
 * deliberate — a field-level merge could never restore a field the snapshot
 * deliberately omits, which is what rollback needs.
 *
 * `merge` keeps top-level entries the snapshot omits; `replace` unsets them.
 * Deletions are emitted before writes so the op list reads the same way it is
 * summarized, and the summary counts only entries that actually differ — an
 * import whose file already matches reports zero across the board.
 *
 * The plugin namespace's own library keys are never planned, in either mode and
 * on either side: `isSnapshotLibraryKey` drops them from the key set entirely,
 * so no import can replace the profile library or the rollback copy, and a
 * `replace` cannot unset them either. The summary counts ops, and no op exists
 * for a key that never enters the loop.
 *
 * Provider wiring is withheld before the diff: `adjustIncoming` drops the
 * endpoint and credential fields the file supplies and writes this machine's
 * values back, so a snapshot cannot redirect traffic by default and `replace`
 * cannot delete the user's own endpoint either. The withholding happens here,
 * inside the planner, so the preview and the write share one rule —
 * `applySnapshot` re-runs this same function against a fresh read.
 *
 * A file exported before 0.1.7 also carries `subagentEffort` inside
 * `llm-pi-ai`, which the entry-config model does not declare there and refuses
 * wholesale. That key is migrated into the plugin's own section before the diff
 * (see `LEGACY_LLM_SECTION_KEYS`), so the providers beside it still import and
 * the user's choice survives the model change.
 */
export function planImport(
  snapshot: ConfigSnapshot,
  namespaces: readonly SettingsNamespace[],
  mode: ImportMode,
  options: PlanOptions = {},
): ImportPlan {
  const summary: { added: number; overwritten: number; removed: number } = { added: 0, overwritten: 0, removed: 0 }
  const plans: NamespacePlan[] = []
  const reports: WiringReport[] = []
  const pluginNamespace = options.pluginNamespace ?? pluginSectionId(namespaces)
  const fileKey = pluginSectionKey(snapshot.sections, pluginNamespace)
  // The entry-config model declares no plugin key inside `llm-pi-ai`, and it
  // refuses a batch that names one, so the file is read through the migration
  // that moves such a key into the section that does declare it.
  const entryConfig = pluginNamespace === PLUGIN_ENTRY_ID
  const sections = entryConfig ? sectionsForEntryConfig(snapshot, fileKey) : snapshot.sections

  for (const ns of CONFIG_NAMESPACES) {
    // The plugin entry is written where THIS host keeps the plugin section,
    // which is the entry id under 0.1.7 and the registered namespace before it.
    const target = ns === PLUGIN_NAMESPACE ? pluginNamespace : ns
    const currentSection = userSectionOf(namespaces, target)
    // A key the model does not declare can only reach the writer as a refusal,
    // so it is left out of the comparison too: a `replace` must not turn a
    // value this host cannot see into an `unset` op that loses the batch.
    const current = entryConfig && ns === LLM_NAMESPACE ? withoutLegacyLlmKeys(currentSection) : currentSection
    const fileSection = ns === PLUGIN_NAMESPACE ? sections[fileKey] : sections[ns]
    const adjusted = adjustIncoming(ns, fileSection ?? {}, current, options.importWiring ?? false)
    const incoming = adjusted.value
    reports.push(adjusted.report)
    const unsets: SettingsOp[] = []
    const sets: SettingsOp[] = []

    const keys = (mode === 'replace'
      ? [...new Set([...Object.keys(incoming), ...Object.keys(current)])]
      : Object.keys(incoming)
    ).filter((key) => !isSnapshotLibraryKey(ns, key))

    for (const key of keys) {
      const inFile = has(incoming, key)
      const inCurrent = has(current, key)
      const fileValue = incoming[key]
      const currentValue = current[key]

      if (!inFile) {
        summary.removed += countRemoved(currentValue)
        unsets.push({ op: 'unset', path: [key] })
        continue
      }

      if (isRecord(fileValue) && isRecord(currentValue)) {
        let changed = false
        if (mode === 'merge') {
          const merged: Record<string, unknown> = { ...currentValue }
          for (const [inner, innerValue] of Object.entries(fileValue)) {
            if (has(currentValue, inner)) {
              if (!deepEqualJson(currentValue[inner], innerValue)) {
                summary.overwritten += 1
                changed = true
              }
            } else {
              summary.added += 1
              changed = true
            }
            merged[inner] = innerValue
          }
          if (changed) sets.push({ op: 'set', path: [key], value: merged })
          continue
        }
        for (const inner of Object.keys(fileValue)) {
          if (has(currentValue, inner)) {
            if (!deepEqualJson(currentValue[inner], fileValue[inner])) {
              summary.overwritten += 1
              changed = true
            }
          } else {
            summary.added += 1
            changed = true
          }
        }
        for (const inner of Object.keys(currentValue)) {
          if (!has(fileValue, inner)) {
            summary.removed += countRemoved(currentValue[inner])
            changed = true
          }
        }
        if (changed) sets.push({ op: 'set', path: [key], value: fileValue })
        continue
      }

      if (!inCurrent) {
        summary.added += 1
        sets.push({ op: 'set', path: [key], value: fileValue })
        continue
      }
      if (!deepEqualJson(fileValue, currentValue)) {
        summary.overwritten += 1
        sets.push({ op: 'set', path: [key], value: fileValue })
      }
    }

    const ops = [...unsets, ...sets]
    if (ops.length > 0) plans.push({ ns: target, ops })
  }

  return { mode, summary, namespaces: plans, wiring: mergeWiringReports(reports), empty: plans.length === 0 }
}
