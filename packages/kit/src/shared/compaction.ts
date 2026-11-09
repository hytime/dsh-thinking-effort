/**
 * The plugin's own context-compaction policy vocabulary, shared by both
 * bundles.
 *
 * The plugin does NOT mount a compaction backend. In the shipped Web profile the
 * official `@deepseek-ai/dsh-compaction-basic` backend lives inside each agent
 * preset's isolate realm, so a host-plane plugin cannot read `ctx.compaction`;
 * it reaches the exact instance through `ctx.agentPresets.serviceFor(agent,
 * 'compaction')`. This module therefore owns only the POLICY the plugin applies
 * — the percentages and the per-model overrides — and leaves thresholds,
 * retention, and summarization to the official backend.
 *
 * Why the plugin keeps its own percentages instead of writing
 * `compaction-basic.modelPolicies`: that table is a Loader row inside a preset
 * declaration, not a settings namespace. Writing it would mean restating the
 * whole shipped preset through `configEditor`, which drifts on every DSH
 * release. Keeping the policy here costs nothing in behavior as long as the
 * plugin's ratio stays BELOW the official one: the plugin compacts first, and
 * the official automatic policy then measures a surface already under its own
 * threshold and returns without work.
 *
 * `scripts/check-conventions.mjs` treats the constants below as single-source
 * literals; see `docs/CONVENTIONS.md`.
 */

import { isUnknownRecord } from './guards.js'

/** Stored per-model override; every field optional so one row can set only a ratio. */
export interface CompactionModelPolicy {
  /** Window fraction this model compacts at. Must be in `(0, 1)`. */
  readonly thresholdRatio?: number
  /** Recent-conversation fraction kept verbatim. Must be below `thresholdRatio`. */
  readonly retainRatio?: number
}

/** The resolved plugin policy: defaults plus the per-route override table. */
export interface CompactionPolicySettings {
  /** Window fraction every model without an override compacts at. */
  readonly thresholdRatio: number
  /** Recent-conversation fraction kept verbatim when a model has no override. */
  readonly retainRatio: number
  /** Exact `provider → model → policy` overrides. */
  readonly models: Readonly<Record<string, Readonly<Record<string, CompactionModelPolicy>>>>
}

/**
 * The fraction of the model's context window at which the plugin compacts.
 *
 * 0.6 leaves a wide margin under the official backend's default 0.8, so the two
 * policies nest instead of racing: the plugin's pass brings pressure back under
 * 0.6, and the official automatic check — which runs its own `agent/pre-step`
 * listener — then finds the surface below 0.8 and returns `null`. A deployment
 * that raises this above the official ratio must also disable the official
 * `auto` flag, because otherwise the official pass fires first and this policy
 * never sees pressure at all.
 */
export const DEFAULT_THRESHOLD_RATIO = 0.6

/** The fraction of the message budget the plugin keeps verbatim. */
export const DEFAULT_RETAIN_RATIO = 0.16

/** Lowest accepted `thresholdRatio`; below this a summary frees almost nothing. */
export const MIN_THRESHOLD_RATIO = 0.1

/**
 * Highest accepted `thresholdRatio`. The official backend's own default is 0.8,
 * and going above it is a deliberate, separately documented decision rather
 * than something a text field should reach by accident.
 */
export const MAX_THRESHOLD_RATIO = 0.95

/** Lowest accepted `retainRatio`; zero would discard the whole retained tail. */
export const MIN_RETAIN_RATIO = 0.01

/**
 * The policy in effect for one exact route, after applying its override.
 *
 * @param policy - the resolved plugin policy.
 * @param provider - registered provider id, the first half of the override key.
 * @param model - exact model id, the second half.
 * @returns the effective ratios for that route.
 */
export function policyForModel(
  policy: CompactionPolicySettings,
  provider: string,
  model: string,
): { readonly thresholdRatio: number; readonly retainRatio: number } {
  const override = policy.models[provider]?.[model]
  return {
    thresholdRatio: override?.thresholdRatio ?? policy.thresholdRatio,
    retainRatio: override?.retainRatio ?? policy.retainRatio,
  }
}

/**
 * The token count at which this route compacts.
 *
 * Mirrors the official formula's shape but not its headroom term: the plugin has
 * no output reservation to subtract, so it prices against the window directly.
 * The official backend still applies its own `headroomTokens` — which is exactly
 * why this ratio must stay lower.
 *
 * @param contextWindow - the routed adapter's declared combined capacity.
 * @param thresholdRatio - the effective window fraction for this route.
 * @returns the inclusive token pressure that triggers a pass.
 */
export function thresholdTokens(contextWindow: number, thresholdRatio: number): number {
  return Math.floor(contextWindow * thresholdRatio)
}

/**
 * The verbatim recent-tail budget for one route.
 *
 * Measured against the same window the threshold uses, so the two cannot drift
 * apart when a model declares an unusual capacity.
 *
 * @param contextWindow - the routed adapter's declared combined capacity.
 * @param retainRatio - the effective retention fraction for this route.
 * @returns the token budget the newest history keeps verbatim.
 */
export function retainTokens(contextWindow: number, retainRatio: number): number {
  return Math.floor(contextWindow * retainRatio)
}

/**
 * Why a candidate ratio pair is unusable, or `undefined` when it is fine.
 *
 * The official backend rejects a retention at or above its threshold at load
 * time, which makes a bad pair a broken preset rather than a bad setting. The
 * panel validates with this before writing so the user cannot reach that state.
 *
 * @param thresholdRatio - candidate threshold fraction.
 * @param retainRatio - candidate retention fraction.
 * @returns a user-facing reason, or `undefined`.
 */
export function ratioProblem(thresholdRatio: number, retainRatio: number): string | undefined {
  if (!Number.isFinite(thresholdRatio)) return 'threshold-ratio-not-a-number'
  if (thresholdRatio < MIN_THRESHOLD_RATIO || thresholdRatio > MAX_THRESHOLD_RATIO) {
    return 'threshold-ratio-out-of-range'
  }
  if (!Number.isFinite(retainRatio)) return 'retain-ratio-not-a-number'
  if (retainRatio < MIN_RETAIN_RATIO) return 'retain-ratio-out-of-range'
  if (retainRatio >= thresholdRatio) return 'retain-ratio-not-below-threshold'
  return undefined
}

/**
 * Parse one ratio typed into a text field.
 *
 * Accepts the percent form the panel shows (`60` meaning 60%) and the fraction
 * form (`0.6`), because a user who types either should not have to guess which
 * one the field wants. Values above 1 are read as percentages; everything else
 * as a fraction.
 *
 * @param input - raw field text.
 * @returns the fraction, or `undefined` when the text is not a number.
 */
export function parseRatioInput(input: string): number | undefined {
  const trimmed = input.trim()
  if (trimmed.length === 0) return undefined
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return undefined
  return value > 1 ? value / 100 : value
}

/**
 * Render one fraction for the percent field.
 *
 * @param ratio - a fraction such as `0.6`.
 * @returns the percent spelling without a trailing `%`, e.g. `60`.
 */
export function formatRatioPercent(ratio: number): string {
  const percent = ratio * 100
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1)
}

/**
 * Narrow an untrusted settings read to the policy shape.
 *
 * The section is a resolved schemastery object on every host that publishes one,
 * so this mostly guards the legacy path where the plugin reads its own
 * registered namespace and an older document may lack the field entirely.
 *
 * @param value - the `compaction` field of a resolved section.
 * @returns the resolved policy, falling back to the defaults for anything absent.
 */
export function compactionPolicyFrom(value: unknown): CompactionPolicySettings {
  const fallback: CompactionPolicySettings = {
    thresholdRatio: DEFAULT_THRESHOLD_RATIO,
    retainRatio: DEFAULT_RETAIN_RATIO,
    models: {},
  }
  if (!isUnknownRecord(value)) return fallback
  const models: Record<string, Record<string, CompactionModelPolicy>> = {}
  const rawModels = value.models
  if (isUnknownRecord(rawModels)) {
    for (const [provider, byModel] of Object.entries(rawModels)) {
      if (!isUnknownRecord(byModel)) continue
      const entries: Record<string, CompactionModelPolicy> = {}
      for (const [model, rawPolicy] of Object.entries(byModel)) {
        if (!isUnknownRecord(rawPolicy)) continue
        const threshold = typeof rawPolicy.thresholdRatio === 'number' && Number.isFinite(rawPolicy.thresholdRatio)
          ? rawPolicy.thresholdRatio
          : undefined
        const retain = typeof rawPolicy.retainRatio === 'number' && Number.isFinite(rawPolicy.retainRatio)
          ? rawPolicy.retainRatio
          : undefined
        entries[model] = {
          ...threshold === undefined ? {} : { thresholdRatio: threshold },
          ...retain === undefined ? {} : { retainRatio: retain },
        }
      }
      if (Object.keys(entries).length > 0) models[provider] = entries
    }
  }
  const thresholdRatio = typeof value.thresholdRatio === 'number' && Number.isFinite(value.thresholdRatio)
    ? value.thresholdRatio
    : DEFAULT_THRESHOLD_RATIO
  const retainRatio = typeof value.retainRatio === 'number' && Number.isFinite(value.retainRatio)
    ? value.retainRatio
    : DEFAULT_RETAIN_RATIO
  return {
    thresholdRatio,
    retainRatio,
    models,
  }
}
