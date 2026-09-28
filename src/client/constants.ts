import type { ReasoningLevel } from './types.js'
import {
  ALL_LEVELS,
  DEFAULT_LEVELS as SHARED_DEFAULT_LEVELS,
  FORMAT_INVALID_POLICIES,
  FORMAT_MODES,
  FORMAT_TIMES,
  LLM_PI_AI_NS,
} from '../shared/constants.js'

export { ALL_LEVELS, FORMAT_INVALID_POLICIES, FORMAT_MODES, FORMAT_TIMES }
export const DEFAULT_LEVELS = SHARED_DEFAULT_LEVELS satisfies Partial<Record<ReasoningLevel, string | null>>

export const PRESETS = [
  { key: 'official', levels: DEFAULT_LEVELS, labelKey: 'presetOfficial' },
  { key: 'generic', levels: { off: null, low: 'low', medium: 'medium', high: 'high' }, labelKey: 'presetGeneric' },
] as const

export const NS = LLM_PI_AI_NS
export { PLUGIN_NS as OPENCODE_SESSION_NS } from '../shared/constants.js'
export const LOCALE_NS = 'settings.thinkingEffort'
export const CONTEXT_MIN = 2000
export const CONTEXT_1M = 1000000
export const CONTEXT_MAX = CONTEXT_1M
export const INPUT_MODALITIES = ['text', 'image'] as const

export const LEVEL_LABEL_KEYS: Readonly<Record<ReasoningLevel, string>> = {
  off: 'levelOff',
  minimal: 'levelMinimal',
  low: 'levelLow',
  medium: 'levelMedium',
  high: 'levelHigh',
  xhigh: 'levelXhigh',
  max: 'levelMax',
}
