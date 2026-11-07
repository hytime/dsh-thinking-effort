/**
 * Client-side plumbing for the plugin's own compaction policy.
 *
 * The model editor edits `compaction.models[provider][model]`, which is a leaf
 * of the plugin's entry section — NOT part of the `providers[route].models`
 * array the rest of the editor rewrites as a whole. That difference is why the
 * policy needs its own helpers: a leaf write can be replayed verbatim after a
 * conflict, while a container write has to be rebuilt from a fresh inventory
 * (see `model-ops.ts`).
 *
 * The ratio vocabulary itself lives in `src/shared/compaction.ts`; nothing here
 * restates a limit, a default, or a parse rule.
 */
import { parseRatioInput, ratioProblem } from '../shared/compaction.js'
import type {
  CompactionModelPolicy,
  CompactionPolicySettings,
} from '../shared/compaction.js'
import type { CompactionDraft } from './section-editor/state.js'
import type { SettingsOp, Translation } from './types.js'

/** What one draft resolves to: a savable override, a clear, or a reason to refuse. */
export type CompactionDraftCheck =
  | { readonly ok: true; readonly value: CompactionModelPolicy | undefined }
  | { readonly ok: false; readonly problem: string }

/**
 * Resolve one draft against the policy and validate the resulting pair.
 *
 * Empty text means "follow the global ratio", so the effective pair is the mix
 * of typed and inherited values. Validating the EFFECTIVE pair — not just the
 * two typed fields — is what stops a user from pinning a retain ratio that only
 * exceeds the threshold through the inherited half: the official backend
 * refuses such a pair at load time, which would make the preset unloadable.
 *
 * @param policy - the resolved plugin policy.
 * @param route - provider id.
 * @param model - exact model id.
 * @param draft - the editable percent strings.
 * @returns the override to write, `value: undefined` meaning "remove it", or a
 *   `ratioProblem` code naming what is wrong.
 */
export function checkCompactionDraft(
  policy: CompactionPolicySettings,
  route: string,
  model: string,
  draft: CompactionDraft,
): CompactionDraftCheck {
  const thresholdText = draft.threshold.trim()
  const retainText = draft.retain.trim()
  const thresholdTyped = thresholdText.length === 0 ? undefined : parseRatioInput(thresholdText)
  const retainTyped = retainText.length === 0 ? undefined : parseRatioInput(retainText)
  if (thresholdText.length > 0 && thresholdTyped === undefined) {
    return { ok: false, problem: 'threshold-ratio-not-a-number' }
  }
  if (retainText.length > 0 && retainTyped === undefined) {
    return { ok: false, problem: 'retain-ratio-not-a-number' }
  }
  const problem = ratioProblem(
    thresholdTyped ?? policy.thresholdRatio,
    retainTyped ?? policy.retainRatio,
  )
  if (problem !== undefined) return { ok: false, problem }
  const value: Record<string, number> = {}
  if (thresholdTyped !== undefined) value.thresholdRatio = thresholdTyped
  if (retainTyped !== undefined) value.retainRatio = retainTyped
  return { ok: true, value: thresholdTyped === undefined && retainTyped === undefined ? undefined : value }
}

/**
 * The settings ops that persist one accepted draft.
 *
 * Clearing is an `unset` of the whole override rather than a `set` of empty
 * fields, because the stored shape has no way to say "inherit this one ratio":
 * a written `thresholdRatio` is always an override, and the schema cannot carry
 * a `null` that would mean otherwise.
 *
 * @param route - provider id.
 * @param model - exact model id.
 * @param check - an accepted `checkCompactionDraft` result.
 * @returns one op, safe to replay verbatim after a conflict.
 */
export function compactionOps(
  route: string,
  model: string,
  check: Extract<CompactionDraftCheck, { ok: true }>,
): SettingsOp[] {
  const path = ['compaction', 'models', route, model]
  return check.value === undefined
    ? [{ op: 'unset', path }]
    : [{ op: 'set', path, value: check.value }]
}

const COMPACTION_PROBLEM_KEYS: Readonly<Record<string, string>> = {
  'threshold-ratio-not-a-number': 'compactionInvalidThreshold',
  'threshold-ratio-out-of-range': 'compactionInvalidThreshold',
  'retain-ratio-not-a-number': 'compactionInvalidRetain',
  'retain-ratio-out-of-range': 'compactionInvalidRetain',
  'retain-ratio-not-below-threshold': 'compactionRetainNotBelow',
}

/**
 * The user-facing sentence for one `ratioProblem` code.
 *
 * @param problem - a code returned by `ratioProblem` or by the draft check.
 * @param t - the active translation.
 * @returns the localized reason, falling back to the threshold copy.
 */
export function compactionProblemText(problem: string, t: Translation): string {
  return t(COMPACTION_PROBLEM_KEYS[problem] ?? 'compactionInvalidThreshold')
}
