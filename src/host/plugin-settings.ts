import z from '@deepseek-ai/schemastery'

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
 * The `dsh-thinking-effort` namespace schema. Keeping it in one module makes
 * the stored shape knowable without reading the settings UI.
 *
 * The outer default is the value used when the namespace is absent, and it is
 * typed as the resolved output, so it must name every required field. It only
 * supplies an empty `autoBackup`; a section that was written but never had a
 * backup taken still resolves one from `configSnapshot`'s own defaults.
 */
export const PLUGIN_SETTINGS_SCHEMA = z.object({
  opencodeSession: z.object({
    providers: openCodeSessionProviders,
  }).default({ providers: {} }),
  profiles: z.dict(configSnapshot).default({}),
  autoBackup: configSnapshot,
}).default({
  opencodeSession: { providers: {} },
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

/**
 * The resolved shape of the plugin's namespace: a valid OpenCode session
 * settings section plus the configuration snapshot fields. Derived from the
 * schema so the stored shape and the type can never drift.
 */
export type PluginSettings = ReturnType<typeof PLUGIN_SETTINGS_SCHEMA>
