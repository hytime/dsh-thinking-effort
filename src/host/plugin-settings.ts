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
const openCodeSessionFormat = z.object({
  mode: z.string().default('ses-derive'),
  time: z.string().default('firstUse'),
  template: z.string().default(''),
  expression: z.string().default(''),
  script: z.string().default(''),
  validate: z.string().default(''),
  onInvalid: z.string().default('warn'),
}).default({
  mode: 'ses-derive',
  time: 'firstUse',
  template: '',
  expression: '',
  script: '',
  validate: '',
  onInvalid: 'warn',
})

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
  readonly profiles?: Readonly<Record<string, PluginStoredSnapshot>>
  readonly autoBackup?: PluginStoredSnapshot
}

/**
 * The `dsh-thinking-effort` namespace schema. Keeping it in one module makes
 * the stored shape knowable without reading the settings UI.
 *
 * The explicit `z<PluginSettings>` annotation is load-bearing, not decoration:
 * without it the inferred type names a transitive dependency by its installed
 * path, so `tsc` refuses to emit a portable declaration (`TS2742`) under a
 * pnpm-style layout.
 *
 * The outer default is the value used when the namespace is absent, and it is
 * typed as the resolved output, so it must name every required field. It only
 * supplies an empty `autoBackup`; a section that was written but never had a
 * backup taken still resolves one from `configSnapshot`'s own defaults.
 */
export const PLUGIN_SETTINGS_SCHEMA: z<PluginSettings> = z.object({
  opencodeSession: z.object({
    providers: openCodeSessionProviders,
    format: openCodeSessionFormat,
  }).default({ providers: {}, format: {
    mode: 'ses-derive',
    time: 'firstUse',
    template: '',
    expression: '',
    script: '',
    validate: '',
    onInvalid: 'warn',
  } }),
  profiles: z.dict(configSnapshot).default({}),
  autoBackup: configSnapshot,
}).default({
  opencodeSession: {
    providers: {},
    format: {
      mode: 'ses-derive',
      time: 'firstUse',
      template: '',
      expression: '',
      script: '',
      validate: '',
      onInvalid: 'warn',
    },
  },
  profiles: {},
  autoBackup: {
    kind: 'dsh-thinking-effort/config-snapshot',
    version: 1,
    createdAt: '',
    pluginVersion: '',
    sourceProfile: 'unknown',
    sections: {},
  },
})
