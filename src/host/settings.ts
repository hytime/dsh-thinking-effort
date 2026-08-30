import { hostCapabilities } from '../compat/capabilities.js'
import { mark } from './marker.js'
import {
  HostContext,
  HostSettings,
  UnknownRecord,
  isProviderProfile,
  isUnknownRecord,
} from './types.js'

export const SETTINGS_NAMESPACE = 'llm-pi-ai'
export const DEFAULT_LEVELS = { off: null, high: 'high', max: 'max' } as const
const LOG_PREFIX = '[@hytime/dsh-thinking-effort]'

export interface ProviderDefaultsResult {
  readonly providers: unknown
  readonly filled: number
}

function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args)
}

export function fillProviderDefaults(providers: unknown): ProviderDefaultsResult {
  if (!isUnknownRecord(providers)) return { providers, filled: 0 }

  let filled = 0
  const nextProviders: UnknownRecord = Object.fromEntries(
    Object.entries(providers).map(([route, rawProfile]) => {
      if (!isProviderProfile(rawProfile)) return [route, rawProfile]

      let nextProfile: UnknownRecord = rawProfile
      let dirty = false
      const models = rawProfile.models
      if (Array.isArray(models)) {
        const nextModels = models.map((entry) => {
          if (!isUnknownRecord(entry) || entry.reasoningEfforts !== undefined) return entry
          dirty = true
          filled += 1
          return { ...entry, reasoningEfforts: DEFAULT_LEVELS }
        })
        if (dirty) {
          nextProfile = { ...nextProfile, models: nextModels }
        }
      }

      const overrides = rawProfile.modelOverrides
      if (isUnknownRecord(overrides)) {
        let overridesDirty = false
        const nextOverrides: UnknownRecord = Object.fromEntries(
          Object.entries(overrides).map(([id, rawEntry]) => {
            if (!isUnknownRecord(rawEntry) || rawEntry.reasoningEfforts !== undefined) {
              return [id, rawEntry]
            }
            overridesDirty = true
            filled += 1
            return [id, { ...rawEntry, reasoningEfforts: DEFAULT_LEVELS }]
          }),
        )
        if (overridesDirty) {
          nextProfile = { ...nextProfile, modelOverrides: nextOverrides }
          dirty = true
        }
      }

      return [route, dirty ? nextProfile : rawProfile]
    }),
  )

  return { providers: nextProviders, filled }
}

function readSection(settings: HostSettings): unknown {
  try {
    return settings.get(SETTINGS_NAMESPACE)
  } catch (error) {
    log('read settings error:', error instanceof Error ? error.message : String(error))
    return undefined
  }
}

async function fillDefaults(settings: HostSettings): Promise<number> {
  if (settings.writable !== true) return 0

  const section = readSection(settings)
  if (!isUnknownRecord(section)) return 0

  const result = fillProviderDefaults(section.providers)
  if (result.filled === 0 || !isUnknownRecord(result.providers)) return 0

  await settings.update(SETTINGS_NAMESPACE, { providers: result.providers })
  mark(`filled-${result.filled}`)
  log('filled default thinking levels for', result.filled, 'model(s)')
  return result.filled
}

export function installSettingsWatcher(ctx: HostContext): void {
  const settings = ctx.settings
  const capabilities = hostCapabilities({ settings })
  if (capabilities.settings === 'none' || settings === undefined) {
    log('settings capability unavailable')
    return
  }

  let retries = 0
  const tryOnce = async (): Promise<void> => {
    try {
      if ((await fillDefaults(settings)) > 0) return
    } catch (error) {
      log('fill error:', error instanceof Error ? error.message : String(error))
    }

    retries += 1
    if (retries <= 5) {
      ctx.timeout(() => { void tryOnce() }, 2000)
    }
  }

  ctx.timeout(() => { void tryOnce() }, 500)
  ctx.on('settings/updated', (...args: unknown[]) => {
    if (args[0] !== SETTINGS_NAMESPACE) return
    void fillDefaults(settings).catch((error: unknown) => {
      log('watch fill error:', error instanceof Error ? error.message : String(error))
    })
  })
}
