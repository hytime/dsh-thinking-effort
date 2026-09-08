import { AsyncLocalStorage } from 'node:async_hooks'
import z from '@deepseek-ai/schemastery'
import {
  isOpenCodeSessionEnabled,
  OPENCODE_SESSION_HEADER,
  OPENCODE_SESSION_NAMESPACE,
  type OpenCodeSessionSettings,
} from '../compat/opencode-session.js'
import type { HostContext } from './types.js'

const LOG_PREFIX = '[@hytime/dsh-thinking-effort]'

const openCodeSessionModels = z.dict(z.boolean()).default({})
const openCodeSessionProvider = z.object({
  models: openCodeSessionModels,
}).default({ models: {} })
const openCodeSessionProviders = z.dict(openCodeSessionProvider).default({})

export const OPENCODE_SESSION_SETTINGS_SCHEMA: z<OpenCodeSessionSettings> = z.object({
  opencodeSession: z.object({
    providers: openCodeSessionProviders,
  }).default({ providers: {} }),
}).default({ opencodeSession: { providers: {} } })

type OpenCodeSessionRequest = {
  readonly provider: string
  readonly model: string
  readonly sessionId: string
  active: boolean
}

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]
type FetchFunction = (input: FetchInput, init?: FetchInit) => ReturnType<typeof fetch>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function requestContext(options: unknown, settings: unknown): OpenCodeSessionRequest | undefined {
  if (!isRecord(options)) return undefined
  const provider = nonEmptyString(options.provider)
  const model = nonEmptyString(options.model)
  const sessionId = nonEmptyString(options.sessionId)
  if (provider === undefined || model === undefined || sessionId === undefined) return undefined
  if (!isOpenCodeSessionEnabled(settings, provider, model)) return undefined
  return { provider, model, sessionId, active: true }
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

function fetchWithSession(
  originalFetch: FetchFunction,
  storage: AsyncLocalStorage<OpenCodeSessionRequest>,
  input: FetchInput,
  init: FetchInit | undefined,
): ReturnType<typeof fetch> {
  const request = storage.getStore()
  if (request === undefined || request.active !== true) return originalFetch(input, init)

  const headers = headersForFetch(input, init)
  if (headers.has(OPENCODE_SESSION_HEADER)) return originalFetch(input, init)
  headers.set(OPENCODE_SESSION_HEADER, request.sessionId)

  return originalFetch(input, {
    ...init,
    headers: new Headers(headers),
  })
}

/** Install the optional OpenCode session namespace and request Header bridge. */
export function installOpenCodeSession(ctx: Pick<HostContext, 'on' | 'effect' | 'settings'>): void {
  let settingsSource: () => unknown = () => ({})
  let settingsSnapshot: unknown = {}

  ctx.settings?.installSection?.(
    ctx,
    OPENCODE_SESSION_NAMESPACE,
    OPENCODE_SESSION_SETTINGS_SCHEMA,
    {},
    {
      setSource(source) {
        settingsSource = source
      },
      onChange() {
        settingsSnapshot = settingsSource()
      },
    },
  )

  ctx.effect(() => {
    const storage = new AsyncLocalStorage<OpenCodeSessionRequest>()
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

    const patchedFetch: typeof fetch = (input, init) => fetchWithSession(originalFetch, storage, input, init)
    globalThis.fetch = patchedFetch

    return () => {
      if (typeof listenerDisposer === 'function') listenerDisposer()
      storage.disable()
      if (globalThis.fetch === patchedFetch) globalThis.fetch = originalFetch
    }
  }, 'dsh-thinking-effort: OpenCode session Header')
}
