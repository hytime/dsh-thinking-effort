import { hostCapabilities } from '../compat/capabilities.js'
import { readSettingsSection, settingsChangeEvents } from '../compat/settings-model.js'
import { settingsModelForRuntime } from '../compat/version-map.js'
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

/**
 * Read the pi-ai section under either settings model. The `entry-config` model
 * has no `get`, so the value comes from `describe()`; `readSettingsSection`
 * covers both and never throws.
 */
function readSection(settings: HostSettings): unknown {
  return readSettingsSection(settings, SETTINGS_NAMESPACE)
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

  ctx.effect(() => {
    let alive = true
    let retries = 0
    const timerDisposers: Array<() => void> = []
    const schedule = (delay: number): void => {
      if (!alive) return
      const disposer = ctx.timeout(() => {
        if (!alive) return
        void tryOnce()
      }, delay)
      if (typeof disposer === 'function') timerDisposers.push(() => { disposer() })
    }
    const tryOnce = async (): Promise<void> => {
      if (!alive) return
      try {
        if ((await fillDefaults(settings)) > 0) return
      } catch (error) {
        if (!alive) return
        log('fill error:', error instanceof Error ? error.message : String(error))
      }

      if (!alive) return
      retries += 1
      if (retries <= 5) schedule(2000)
    }

    schedule(500)

    // The 0.1.7 line removed `settings/updated` in favour of the
    // document-scoped event, so the subscription follows the live model.
    const model = settingsModelForRuntime({ settings })
    const listenerDisposers: Array<() => void> = []
    if (model !== undefined) {
      for (const event of settingsChangeEvents(model)) {
        const disposer = ctx.on(event, (...args: unknown[]) => {
          if (!alive || args[0] !== SETTINGS_NAMESPACE) return
          void fillDefaults(settings).catch((error: unknown) => {
            if (alive) log('watch fill error:', error instanceof Error ? error.message : String(error))
          })
        })
        if (typeof disposer === 'function') listenerDisposers.push(() => { disposer() })
      }
    }

    return () => {
      alive = false
      for (const dispose of timerDisposers.splice(0)) dispose()
      for (const dispose of listenerDisposers.splice(0)) dispose()
    }
  }, 'dsh-thinking-effort: settings watcher')
}
