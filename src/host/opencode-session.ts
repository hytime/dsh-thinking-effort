import { AsyncLocalStorage } from 'node:async_hooks'
import {
  isOpenCodeSessionEnabled,
  OPENCODE_SESSION_HEADER,
  OPENCODE_SESSION_NAMESPACE,
} from '../compat/opencode-session.js'
import { OpenCodeSessionFormatter, resolveFormatConfig } from './opencode-session-format.js'
import { PLUGIN_SETTINGS_SCHEMA } from './plugin-settings.js'
import type {
  HostContext,
  SettingsInjectionContext,
  SettingsSectionHooks,
} from './types.js'

export { PLUGIN_SETTINGS_SCHEMA as OPENCODE_SESSION_SETTINGS_SCHEMA } from './plugin-settings.js'

const LOG_PREFIX = '[@hytime/dsh-thinking-effort]'

type OpenCodeSessionRequest = {
  readonly provider: string
  readonly model: string
  /** Absent when `GenerateOptions.sessionId` is omitted; only the Header branch needs it. */
  readonly sessionId: string | undefined
  readonly sessionEnabled: boolean
  readonly userAgentValue: string | undefined
  active: boolean
}

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]
type FetchFunction = (input: FetchInput, init?: FetchInit) => ReturnType<typeof fetch>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ownRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  const object = isRecord(value) ? value : undefined
  if (object === undefined || !Object.prototype.hasOwnProperty.call(object, key)) return undefined
  return isRecord(object[key]) ? object[key] as Record<string, unknown> : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Resolve the `user-agent` override for one `provider/model` request. The
 * master `value` under `opencodeSession.userAgent` is the enable switch:
 * when it is empty the override is fully off. A route matches when its
 * `enabled` flag is true (all models) or the exact model is toggled on; the
 * route's own `value` wins over the master value when both exist.
 */
export function resolveUserAgentValue(settings: unknown, provider: string, model: string): string | undefined {
  if (provider.length === 0 || model.length === 0) return undefined
  const opencodeSession = ownRecord(settings, 'opencodeSession')
  const userAgent = ownRecord(opencodeSession, 'userAgent')
  const masterValue = nonEmptyString(userAgent?.value)
  if (masterValue === undefined) return undefined

  const providers = ownRecord(userAgent, 'providers')
  const providerEntry = ownRecord(providers, provider)
  if (providerEntry === undefined) return undefined

  const routeEnabled = providerEntry.enabled === true
  const models = ownRecord(providerEntry, 'models')
  const modelEnabled = models !== undefined && models[model] === true
  if (!routeEnabled && !modelEnabled) return undefined

  return nonEmptyString(providerEntry.value) ?? masterValue
}

function requestContext(options: unknown, settings: unknown): OpenCodeSessionRequest | undefined {
  if (!isRecord(options)) return undefined
  const provider = nonEmptyString(options.provider)
  const model = nonEmptyString(options.model)
  const sessionId = nonEmptyString(options.sessionId)
  // The session id is optional: the user-agent override must still work for
  // callers that construct GenerateOptions without it (e.g. auto-review).
  if (provider === undefined || model === undefined) return undefined
  const sessionEnabled = isOpenCodeSessionEnabled(settings, provider, model)
  const userAgentValue = resolveUserAgentValue(settings, provider, model)
  if (!sessionEnabled && userAgentValue === undefined) return undefined
  return { provider, model, sessionId, sessionEnabled, userAgentValue, active: true }
}

function wrapStream<T>(
  source: AsyncIterable<T>,
  storage: AsyncLocalStorage<OpenCodeSessionRequest>,
  request: OpenCodeSessionRequest,
): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterableIterator<T> {
      const iterator = source[Symbol.asyncIterator]() as AsyncIterator<T, unknown, unknown>
      const iteratorRequest: OpenCodeSessionRequest = { ...request, active: true }
      const deactivate = (): void => {
        iteratorRequest.active = false
      }
      const run = <R>(operation: () => R): R => storage.run(iteratorRequest, operation)
      const wrapped: AsyncIterableIterator<T> = {
        next(value?: unknown): Promise<IteratorResult<T>> {
          return run(async () => {
            try {
              const result = await iterator.next(value)
              if (result.done) deactivate()
              return result
            } catch (error) {
              deactivate()
              throw error
            }
          })
        },
        return(value?: unknown): Promise<IteratorResult<T>> {
          if (iterator.return === undefined) {
            deactivate()
            return Promise.resolve({ done: true, value: value as T })
          }
          return run(async () => {
            try {
              const result = await iterator.return!(value)
              deactivate()
              return result
            } catch (error) {
              deactivate()
              throw error
            }
          })
        },
        throw(error?: unknown): Promise<IteratorResult<T>> {
          if (iterator.throw === undefined) {
            deactivate()
            return Promise.reject(error)
          }
          return run(async () => {
            try {
              const result = await iterator.throw!(error)
              if (result.done) deactivate()
              return result
            } catch (caught) {
              deactivate()
              throw caught
            }
          })
        },
        [Symbol.asyncIterator](): AsyncIterableIterator<T> {
          return this
        },
      }
      return wrapped
    },
  }
}

function headersForFetch(input: FetchInput, init: FetchInit | undefined): Headers {
  const inputHeaders = typeof Request !== 'undefined' && input instanceof Request
    ? input.headers
    : undefined
  const headers = new Headers(inputHeaders)
  if (init?.headers !== undefined) {
    const initHeaders = new Headers(init.headers)
    initHeaders.forEach((value, name) => headers.set(name, value))
  }
  return headers
}

async function fetchWithSession(
  formatter: OpenCodeSessionFormatter,
  storage: AsyncLocalStorage<OpenCodeSessionRequest>,
  settingsSnapshot: unknown,
  originalFetch: FetchFunction,
  input: FetchInput,
  init: FetchInit | undefined,
): ReturnType<typeof fetch> {
  const request = storage.getStore()
  if (request === undefined || request.active !== true) return originalFetch(input, init)

  const headers = headersForFetch(input, init)

  if (request.userAgentValue !== undefined) {
    headers.set('user-agent', request.userAgentValue)
  }

  const sessionId = request.sessionId
  if (sessionId !== undefined && request.sessionEnabled && !headers.has(OPENCODE_SESSION_HEADER)) {
    let value: string | undefined
    try {
      value = await formatter.format(
        { provider: request.provider, model: request.model, sessionId },
        resolveFormatConfig(settingsSnapshot),
      )
    } catch (error) {
      console.warn(LOG_PREFIX, 'session format error:', error instanceof Error ? error.message : String(error))
      value = request.sessionId
    }
    if (value !== undefined) headers.set(OPENCODE_SESSION_HEADER, value)
  }

  return originalFetch(input, {
    ...init,
    headers: new Headers(headers),
  })
}

function installLegacySettingsSection(
  ctx: HostContext,
  namespace: string,
  hooks: SettingsSectionHooks,
): void {
  if (typeof ctx.inject !== 'function') {
    throw new Error(`${LOG_PREFIX} Settings compatibility helper is unavailable: context injection is missing`)
  }
  ctx.inject(['settings'], (settingsContext: SettingsInjectionContext) => {
    const register = settingsContext.settings.register
    if (typeof register !== 'function') {
      throw new Error(`${LOG_PREFIX} Settings compatibility helper is unavailable: register is missing`)
    }
    const scope = register.call(settingsContext.settings, namespace, PLUGIN_SETTINGS_SCHEMA, { base: {} })
    hooks.setSource(() => scope.get())
    settingsContext.effect(() => () => {
      hooks.setSource(() => ({}))
      hooks.onChange()
    }, `${LOG_PREFIX}: legacy OpenCode session settings`)
    hooks.onChange()
    const unwatch = scope.watch(() => { hooks.onChange() })
    ctx.effect(() => () => {
      unwatch()
    }, `${LOG_PREFIX}: legacy OpenCode session watcher`)
  })
}

function installSettingsSectionCompat(ctx: HostContext, hooks: SettingsSectionHooks): void {
  const settings = ctx.settings
  const installSection = settings?.installSection
  if (typeof installSection === 'function') {
    installSection.call(settings, ctx, OPENCODE_SESSION_NAMESPACE, PLUGIN_SETTINGS_SCHEMA, {}, hooks)
    return
  }

  installLegacySettingsSection(ctx, OPENCODE_SESSION_NAMESPACE, hooks)
}

/** Install the optional OpenCode session namespace and request Header bridge. */
export function installOpenCodeSession(ctx: HostContext): void {
  let settingsSource: () => unknown = () => ({})
  let settingsSnapshot: unknown = {}

  installSettingsSectionCompat(ctx, {
    setSource(source) {
      settingsSource = source
    },
    onChange() {
      settingsSnapshot = settingsSource()
    },
  })

  ctx.effect(() => {
    const storage = new AsyncLocalStorage<OpenCodeSessionRequest>()
    const formatter = new OpenCodeSessionFormatter()
    const listenerDisposer = ctx.on('llm/stream', (...args: unknown[]) => {
      const next = args[1]
      if (typeof next !== 'function') return undefined
      const source = next as () => AsyncIterable<unknown>
      const request = requestContext(args[0], settingsSnapshot)
      const stream = source()
      return request === undefined ? stream : wrapStream(stream, storage, request)
    })

    const originalFetch = globalThis.fetch
    if (typeof originalFetch !== 'function') {
      console.warn(LOG_PREFIX, 'global fetch unavailable; OpenCode session Header disabled')
      return () => {
        if (typeof listenerDisposer === 'function') listenerDisposer()
        storage.disable()
      }
    }

    const patchedFetch: typeof fetch = (input, init) => fetchWithSession(
      formatter,
      storage,
      settingsSnapshot,
      originalFetch,
      input,
      init,
    )
    globalThis.fetch = patchedFetch

    return () => {
      if (typeof listenerDisposer === 'function') listenerDisposer()
      storage.disable()
      if (globalThis.fetch === patchedFetch) globalThis.fetch = originalFetch
    }
  }, 'dsh-thinking-effort: OpenCode session Header')
}
