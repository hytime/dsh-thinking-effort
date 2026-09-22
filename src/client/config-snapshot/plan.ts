import { CONFIG_NAMESPACES, PLUGIN_NAMESPACE } from './types.js'
import type { ConfigSnapshot, ImportMode, ImportPlan, NamespacePlan, SnapshotSection, WiringReport } from './types.js'
import { userSectionOf, isRecord, isSnapshotLibraryKey, deepEqualJson, pluginSectionKey } from './snapshot.js'
import { adjustIncoming, mergeWiringReports } from './wiring.js'
import type { SettingsNamespace, SettingsOp } from '../types.js'

export { deepEqualJson } from './snapshot.js'

function has(object: SnapshotSection, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
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
   * The id the running host addresses the plugin section by — `pluginSectionId`
   * of the same `describe()` result. Writes are planned against it, while the
   * file's own section is looked up under whichever id it carries, so a
   * snapshot exported by the other settings model still applies.
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
  const pluginNamespace = options.pluginNamespace ?? PLUGIN_NAMESPACE
  const fileKey = pluginSectionKey(snapshot.sections, pluginNamespace)

  for (const ns of CONFIG_NAMESPACES) {
    // The plugin entry is written where THIS host keeps the plugin section,
    // which is the entry id under 0.1.7 and the registered namespace before it.
    const target = ns === PLUGIN_NAMESPACE ? pluginNamespace : ns
    const current = userSectionOf(namespaces, target)
    const fileSection = ns === PLUGIN_NAMESPACE ? snapshot.sections[fileKey] : snapshot.sections[ns]
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
