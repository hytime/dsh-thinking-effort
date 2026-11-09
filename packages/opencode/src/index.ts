/**
 * The OpenCode session-header feature: per-model `x-opencode-session` injection
 * and `user-agent` rewriting.
 */
export {
  OPENCODE_SESSION_SETTINGS_SCHEMA,
  installOpenCodeSession,
  resolveUserAgentValue,
} from './session.js'
export {
  OPENCODE_SESSION_DEFAULT_REGEX,
  OpenCodeSessionFormatter,
  digestTail62,
  hexTime12,
  normalizeSessionId,
  resolveFormatConfig,
} from './format.js'
export type {
  FormatterDeps,
  ResolvedFormatConfig,
  SessionFormatContext,
  SessionFormatRequest,
} from './format.js'
