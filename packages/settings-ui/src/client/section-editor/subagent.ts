import { ALL_LEVELS } from '../constants.js'
import { revisionOf } from '@hytime/dsh-plugin-kit'
import type { SettingsNamespace } from '@hytime/dsh-plugin-kit'
import type { SubagentState } from './state.js'

/**
 * Project a section descriptor onto the subagent default-effort card.
 *
 * An absent `subagentEffort` reads as "follow the model default" (`'default'`),
 * a value naming one of the shipped levels selects it, and anything else is a
 * custom wire spelling the card edits as free text — the same three states the
 * card renders.
 */
export function subagentView(namespace: SettingsNamespace | null): { subagent: SubagentState | null; draft: string; custom: string; revision: number } {
  if (!namespace) return { subagent: null, draft: 'default', custom: '', revision: 0 }
  const revision = revisionOf(namespace)
  const user = namespace.user ?? {}
  const effort = typeof user.subagentEffort === 'string' && user.subagentEffort.length > 0 ? user.subagentEffort : null
  const draft = effort === null ? 'default' : ALL_LEVELS.includes(effort as typeof ALL_LEVELS[number]) ? effort : 'custom'
  return { subagent: { effort, revision }, draft, custom: draft === 'custom' ? effort ?? '' : '', revision }
}

/**
 * The op one subagent-card draft resolves to.
 *
 * `'default'` unsets the field so the card follows inheritance again; a custom
 * entry trims its text because the wire spelling is matched verbatim. An empty
 * custom entry yields `undefined` and the caller reports it — writing `''` would
 * store a value no model can map.
 */
export function subagentEffortOp(draft: string, custom: string): { op: 'set' | 'unset'; path: string[]; value?: unknown } | undefined {
  if (draft === 'default') return { op: 'unset', path: ['subagentEffort'] }
  const value = draft === 'custom' ? custom.trim() : draft
  if (!value) return undefined
  return { op: 'set', path: ['subagentEffort'], value }
}
