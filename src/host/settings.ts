import { hostCapabilities } from '../compat/capabilities.js'
import { readSettingsSection, readSettingsSectionUser, settingsChangeEvents } from '../compat/settings-model.js'
import { settingsModelForRuntime } from '../compat/version-map.js'
import { mark } from './marker.js'
import {
  HostContext,
  HostSettings,
  SettingsPathOp,
  isProviderProfile,
  isUnknownRecord,
} from './types.js'

export const SETTINGS_NAMESPACE = 'llm-pi-ai'
export const DEFAULT_LEVELS = { off: null, high: 'high', max: 'max' } as const
const LOG_PREFIX = '[@hytime/dsh-thinking-effort]'

/** The minimal path edits one fill performs, and how many models they cover. */
export interface ProviderDefaultsResult {
  readonly ops: readonly SettingsPathOp[]
  readonly filled: number
}

function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args)
}

/**
 * The path edits that give every model a default thinking-level set.
 *
 * `providers` is the resolved section, which decides *where* a level is
 * missing; `user` is the user's own layer, which supplies *what* is written.
 * A path write merges into that user layer, so restating a resolved entry
 * would pin the schema defaults it took on (`input`, `compat`, `headers`,
 * `thinkingBudgets`, `defaultContextWindow`, …) into the user's document, and
 * a later release changing one of those defaults would never reach the user.
 *
 * A model array is addressed as a whole because the older settings service
 * walks paths through plain objects only: a numeric index would replace the
 * array with an object. The array's entries therefore come from the user
 * layer, which is also why an entry no user-layer counterpart covers — one a
 * composition base or schema default alone supplies — is left unfilled
 * rather than materialized.
 */
export function fillProviderDefaults(providers: unknown, user: unknown): ProviderDefaultsResult {
  if (!isUnknownRecord(providers)) return { ops: [], filled: 0 }

  const userProviders = isUnknownRecord(user) ? user : {}
  const ops: SettingsPathOp[] = []
  let filled = 0

  for (const [route, rawProfile] of Object.entries(providers)) {
    if (!isProviderProfile(rawProfile)) continue
    const userProfile = userProviders[route]
    const ownProfile = isUnknownRecord(userProfile) ? userProfile : undefined

    const models = rawProfile.models
    const userModels = ownProfile?.models
    if (Array.isArray(models) && Array.isArray(userModels)) {
      let dirty = false
      const nextModels = userModels.map((userEntry, index) => {
        const resolved = models[index]
        if (!isUnknownRecord(resolved) || resolved.reasoningEfforts !== undefined) return userEntry
        if (!isUnknownRecord(userEntry)) return userEntry
        dirty = true
        filled += 1
        return { ...userEntry, reasoningEfforts: DEFAULT_LEVELS }
      })
      if (dirty) {
        ops.push({ op: 'set', path: ['providers', route, 'models'], value: nextModels })
      }
    }

    // A model override is a dict keyed by model id, so the missing field is
    // addressable directly: the partial entry merges over whatever lower layer
    // already describes that model.
    const overrides = rawProfile.modelOverrides
    if (isUnknownRecord(overrides)) {
      for (const [id, rawEntry] of Object.entries(overrides)) {
        if (!isUnknownRecord(rawEntry) || rawEntry.reasoningEfforts !== undefined) continue
        filled += 1
        ops.push({
          op: 'set',
          path: ['providers', route, 'modelOverrides', id, 'reasoningEfforts'],
          value: DEFAULT_LEVELS,
        })
      }
    }
  }

  return { ops, filled }
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

  const user = readSettingsSectionUser(settings, SETTINGS_NAMESPACE)
  const result = fillProviderDefaults(section.providers, isUnknownRecord(user) ? user.providers : undefined)
  if (result.filled === 0 || result.ops.length === 0) return 0

  const mutate = settings.mutate
  if (typeof mutate !== 'function') {
    // A merge cannot address one element of an existing array, so a service
    // without `mutate` could only receive this fill by restating — and pinning
    // — the whole resolved provider subtree. Leave the levels alone instead.
    log('settings service cannot address paths; left', result.filled, 'model(s) unfilled')
    return 0
  }

  await mutate.call(settings, SETTINGS_NAMESPACE, result.ops)
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
    let inFlight: Promise<number> | undefined
    const timerDisposers: Array<() => void> = []
    /**
     * Run at most one fill at a time. The startup timer and a change event can
     * overlap, and both would read the section before either write lands, so
     * each would write the same fill and bump the document revision twice.
     */
    const runFill = (): Promise<number> => {
      if (inFlight !== undefined) return inFlight
      const run = fillDefaults(settings)
      inFlight = run
      const settle = (): void => {
        if (inFlight === run) inFlight = undefined
      }
      void run.then(settle, settle)
      return run
    }
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
        if ((await runFill()) > 0) return
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
          void runFill().catch((error: unknown) => {
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
