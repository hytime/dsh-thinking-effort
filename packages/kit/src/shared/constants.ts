/**
 * The single source of every cross-module identifier. Both bundles import this
 * module, so it may not reach a `node:` built-in.
 *
 * `scripts/check-conventions.mjs` enforces the table in `docs/CONVENTIONS.md`:
 * it fails the suite when any of these literals reappears elsewhere under
 * `src/`, which is what stops the drift that produced four spellings of
 * `llm-pi-ai` and two of the level table.
 *
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

/**
 * The locale namespace both client packages register dictionaries under.
 *
 * It lives in kit because two separate client packages bind it: the settings
 * panel and the Composer seat. Duplicating the literal would let the two drift
 * and one of them silently fall back to raw keys.
 */
export const LOCALE_NS = 'settings.thinkingEffort'

/**
 * The plugin version the settings panel shows.
 *
 * It is injected at build time from the root manifest (`tsdown`'s `define`)
 * rather than imported: the client packages must not import the root package,
 * because the root package imports them. A compile-time constant keeps the
 * version a single source — the root `package.json` — without the cycle.
 */
declare const __PLUGIN_VERSION__: string
export const PLUGIN_VERSION: string = typeof __PLUGIN_VERSION__ === 'string' ? __PLUGIN_VERSION__ : '0.0.0-dev'
