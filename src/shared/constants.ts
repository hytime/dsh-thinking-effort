/**
 * The one spelling of every cross-module identifier. Both bundles import this
 * module, so it may not reach a `node:` built-in.
 *
 * `scripts/check-conventions.mjs` fails the suite when any of these literals
 * reappears elsewhere under `src/`, which is what stops the drift that
 * produced four spellings of `llm-pi-ai` and two of the level table.
 * `src/client/index.ts`'s `SLOT_ID` is deliberately NOT here: it is a UI slot
 * id, not a settings section id.
 */
export const LLM_PI_AI_NS = 'llm-pi-ai'
export const PLUGIN_NS = 'dsh-thinking-effort'
export const PLUGIN_ENTRY_ID = 'thinking-effort'
export const LOG_PREFIX = '[@hytime/dsh-thinking-effort]'
export const SNAPSHOT_KIND = 'dsh-thinking-effort/config-snapshot'

/** DSH's reasoning levels, in the order both the Host and the Client render them. */
export const ALL_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

/** The levels this plugin adds to a hand-declared model that declares none. */
export const DEFAULT_LEVELS = { off: null, high: 'high', max: 'max' } as const

/** The `x-opencode-session` generator vocabularies; one copy each. */
export const FORMAT_MODES = ['ses-derive', 'passthrough', 'template', 'expression', 'script'] as const
export const FORMAT_TIMES = ['firstUse', 'hash'] as const
export const FORMAT_INVALID_POLICIES = ['warn', 'drop', 'send'] as const
