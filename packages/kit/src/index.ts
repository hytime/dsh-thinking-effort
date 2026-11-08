/**
 * The shared kit: primitives, the DSH compatibility layer, and the minimal
 * runtime faces every feature package codes against.
 *
 * Feature packages import from here and from nowhere else in the workspace.
 * That one-way edge is what keeps a feature from reaching into a sibling's
 * internals, and it is why `src/compat/**` could move out of the client package
 * at all: the compat layer only ever needed types, never a UI.
 */
export * from './shared/guards.js'
export * from './shared/conflict.js'
export * from './shared/compaction.js'
export * from './shared/component-switches.js'
export * from './shared/read-component-switches.js'
export * from './compat/capabilities.js'
export * from './compat/gateway/fields.js'
export * from './compat/gateway/types.js'
export * from './compat/gateway/validation.js'
export * from './compat/gateway/resolve.js'
export * from './compat/gateway/takeover.js'
export * from './compat/gateway/ops.js'
export * from './compat/legacy-migration.js'
export * from './compat/model-directory.js'
export * from './compat/model-directory-types.js'
export * from './compat/model-selection-directory.js'
export * from './compat/model-source.js'
export * from './compat/opencode-expression.js'
// `shared/constants` owns the FORMAT_* lists; `compat/opencode-session` re-exports
// them, so the barrel must take that module's surface WITHOUT its copies.
export * from './shared/constants.js'
export {
  OPENCODE_SESSION_HEADER,
  OPENCODE_SESSION_NAMESPACE,
  isOpenCodeSessionEnabled,
  isOpenCodeSessionSectionId,
  modelPath,
} from './compat/opencode-session.js'
export type {
  OpenCodeSessionFormatMode,
  OpenCodeSessionFormatSettings,
  OpenCodeSessionInvalidPolicy,
  OpenCodeSessionSettings,
  OpenCodeSessionTimeSource,
} from './compat/opencode-session.js'
export * from './compat/settings-model.js'
export * from './compat/version-adapter.js'
export * from './compat/version-map.js'
export * from './client-types.js'
export * from './plugin-settings.js'
export * from './host/types.js'
