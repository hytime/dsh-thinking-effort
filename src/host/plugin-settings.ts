import z from '@deepseek-ai/schemastery'
import type { OpenCodeSessionSettings } from '../compat/opencode-session.js'

/**
 * One stored configuration snapshot. Fields carry defaults so a section
 * hand-written without them still resolves; `createdAt` is the sentinel for
 * "never written", because the defaults materialize this object either way.
 */
const configSnapshot = z.object({
  kind: z.string().default('dsh-thinking-effort/config-snapshot'),
  version: z.number().default(1),
  createdAt: z.string().default(''),
  pluginVersion: z.string().default(''),
  sourceProfile: z.string().default('unknown'),
  sections: z.dict(z.any()).default({}),
})

const openCodeSessionModels = z.dict(z.boolean()).default({})
const openCodeSessionProvider = z.object({
  models: openCodeSessionModels,
}).default({ models: {} })
const openCodeSessionProviders = z.dict(openCodeSessionProvider).default({})
/**
 * Defaults shared by the `format` section schema and the stored namespace
 * shape, so the three literal copies stay in sync by construction.
 */
const OPENCODE_SESSION_FORMAT_DEFAULTS = {
  mode: 'ses-derive',
  time: 'firstUse',
  template: '',
  expression: '',
  script: '',
  validate: '',
  onInvalid: 'warn',
}

const openCodeSessionFormat = z.object({
  mode: z.string().default('ses-derive'),
  time: z.string().default('firstUse'),
  template: z.string().default(''),
  expression: z.string().default(''),
  script: z.string().default(''),
  validate: z.string().default(''),
  onInvalid: z.string().default('warn'),
}).default({ ...OPENCODE_SESSION_FORMAT_DEFAULTS })

/**
 * Defaults shared by the `userAgent` section schema and the stored namespace
 * shape (mirrors the `format` section above).
 */
const OPENCODE_SESSION_USER_AGENT_DEFAULTS = { value: '', providers: {} }

const openCodeSessionUserAgent = z.object({
  value: z.string().default(''),
  providers: z.dict(z.object({
    enabled: z.boolean().default(false),
    value: z.string().default(''),
    models: openCodeSessionModels,
  }).default({ enabled: false, value: '', models: {} })).default({}),
}).default({ ...OPENCODE_SESSION_USER_AGENT_DEFAULTS })

/**
 * The resolved `opencodeSession` section, described once for both the section
 * default and the namespace default below.
 */
const OPENCODE_SESSION_DEFAULTS = {
  providers: {},
  format: { ...OPENCODE_SESSION_FORMAT_DEFAULTS },
  userAgent: { ...OPENCODE_SESSION_USER_AGENT_DEFAULTS },
}

/** The `opencodeSession` section, shared by both schema roots. */
const openCodeSession = z.object({
  providers: openCodeSessionProviders,
  format: openCodeSessionFormat,
  userAgent: openCodeSessionUserAgent,
}).default({ ...OPENCODE_SESSION_DEFAULTS })

/**
 * One stored configuration snapshot, as it appears in the settings document.
 * Every field is optional because a hand-written section may omit any of them
 * and the schema supplies the defaults on resolution.
 */
export interface PluginStoredSnapshot {
  readonly kind?: string
  readonly version?: number
  readonly createdAt?: string
  readonly pluginVersion?: string
  readonly sourceProfile?: string
  readonly sections?: Readonly<Record<string, unknown>>
}

/** The namespace's resolved shape: an OpenCode session section plus the snapshot fields. */
export interface PluginSettings extends OpenCodeSessionSettings {
  /**
   * The subagent thinking effort the plugin applies when a request carries no
   * explicit `reasoningEffort`. Empty means "unset, follow the provider
   * default", which is why its default is an empty string rather than a level:
   * the stored value is a wire spelling, not necessarily a level key.
   */
  readonly subagentEffort?: string
  readonly profiles?: Readonly<Record<string, PluginStoredSnapshot>>
  readonly autoBackup?: PluginStoredSnapshot
}

/**
 * The fields both schema roots expose: the namespace the older releases
 * register, and the Loader entry schema `Config` below. They are declared once
 * so a field can never reach one root without the other.
 *
 * `subagentEffort` belongs here rather than in a section of its own because
 * the 0.1.7 entry-config model derives one form per Loader entry, so the
 * plugin owns exactly one section and every plugin setting lives in it.
 */
const PLUGIN_SETTINGS_FIELDS = {
  opencodeSession: openCodeSession,
  subagentEffort: z.string().default(''),
  profiles: z.dict(configSnapshot).default({}),
  autoBackup: configSnapshot,
}

/**
 * The value an absent namespace resolves to. Both roots share it because
 * schemastery deep-clones a fallback before normalizing it, so a resolution
 * through one root is invisible to the other.
 *
 * It only supplies an empty `autoBackup`; a section that was written but never
 * had a backup taken still resolves one from `configSnapshot`'s own defaults.
 */
const PLUGIN_SETTINGS_DEFAULTS = {
  opencodeSession: { ...OPENCODE_SESSION_DEFAULTS },
  subagentEffort: '',
  profiles: {},
  autoBackup: {
    kind: 'dsh-thinking-effort/config-snapshot',
    version: 1,
    createdAt: '',
    pluginVersion: '',
    sourceProfile: 'unknown',
    sections: {},
  },
}

/**
 * The `dsh-thinking-effort` namespace schema. Keeping it in one module makes
 * the stored shape knowable without reading the settings UI.
 *
 * The explicit `z<PluginSettings>` annotation is load-bearing, not decoration:
 * without it the inferred type names a transitive dependency by its installed
 * path, so `tsc` refuses to emit a portable declaration (`TS2742`) under a
 * pnpm-style layout.
 */
export const PLUGIN_SETTINGS_SCHEMA: z<PluginSettings> = z.object(PLUGIN_SETTINGS_FIELDS)
  .default({ ...PLUGIN_SETTINGS_DEFAULTS })

/**
 * The Loader entry's own config schema, from which DSH 0.1.7 derives this
 * plugin's settings form; a plugin that exports no `Config` gets no form at
 * all. It sits beside the namespace schema rather than replacing it, because
 * `register`/`installSection` still serve the releases that predate entry
 * configs.
 *
 * The root is volatile because the configuration snapshot writes `profiles`
 * and `autoBackup` as whole sections, and entry-config rejects a write to a
 * path that is not volatile.
 */
export const Config: z<PluginSettings, PluginSettings, 'volatile-defined'> = z.object(PLUGIN_SETTINGS_FIELDS)
  .default({ ...PLUGIN_SETTINGS_DEFAULTS })
  .volatile()
