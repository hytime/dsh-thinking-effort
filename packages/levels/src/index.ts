/**
 * The default-levels fill feature: fills the pi-ai provider/model level
 * defaults DSH leaves out, and keeps them filled as settings change.
 *
 * `Config` and `PLUGIN_SETTINGS_SCHEMA` are re-exported rather than defined
 * here so the schema keeps one source in the kit: the sibling feature packages
 * read the same schema, and a package that imported this one to get it would
 * depend on a feature instead of on the shared layer.
 */
export { DEFAULT_LEVELS, SETTINGS_NAMESPACE, fillProviderDefaults, installSettingsWatcher } from './settings.js'
export { installSwitchesStampWatcher } from './switches-stamp.js'
export type { ProviderDefaultsResult } from './settings.js'
export { Config, PLUGIN_SETTINGS_SCHEMA } from '@hytime/dsh-plugin-kit'
export type { PluginSettings } from '@hytime/dsh-plugin-kit'
