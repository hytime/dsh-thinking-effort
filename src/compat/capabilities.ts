import type {
  CompatibilitySettings,
  DshCompatibilityCapabilities,
} from '../client/types.js'

export type { CompatibilitySettings, DshCompatibilityCapabilities } from '../client/types.js'
export type { DshVersionCapabilities, GatewayCompatEditableField, SettingsApi, TakeoverTransport } from './version-map.js'
export type { SettingsModel } from './settings-model.js'
export {
  settingsModelForRuntime,
  settingsModelForVersion,
  takeoverSupportedForVersion,
  takeoverTransportForVersion,
} from './version-map.js'
export { PLUGIN_ENTRY_ID, readSettingsSection, readSettingsSectionUser, settingsChangeEvents, settingsEntryId, settingsModelOf } from './settings-model.js'

type MethodName = 'describe' | 'mutate' | 'get' | 'update' | 'modelCatalog'

export function hasMethods(value: unknown, methods: readonly MethodName[]): boolean {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false

  return methods.every((method) => {
    let current: object | null = value
    while (current !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(current, method)
      if (descriptor === undefined) {
        current = Object.getPrototypeOf(current)
        continue
      }
      return 'value' in descriptor
        ? typeof descriptor.value === 'function'
        : typeof Reflect.get(value, method) === 'function'
    }
    return false
  })
}

function capabilities(settings: CompatibilitySettings, externalLanguages: boolean): DshCompatibilityCapabilities {
  return { settings, externalLanguages }
}

export function clientCapabilities(input: {
  readonly remoteSettings?: unknown
  readonly legacySettings?: unknown
  readonly addLanguage?: unknown
}): DshCompatibilityCapabilities {
  const settings = hasMethods(input.remoteSettings, ['describe', 'mutate'])
    ? 'remote'
    : hasMethods(input.legacySettings, ['describe', 'mutate'])
      ? 'legacy'
      : 'none'

  return capabilities(settings, typeof input.addLanguage === 'function')
}

export function hostCapabilities(input: {
  readonly settings?: unknown
}): DshCompatibilityCapabilities {
  // `describe` plus `update` is the floor under both settings models: the
  // 0.1.7 line dropped `get`, but a section read still comes from `describe`.
  const settings = hasMethods(input.settings, ['update', 'describe'])
    ? 'legacy'
    : 'none'

  return capabilities(settings, false)
}
