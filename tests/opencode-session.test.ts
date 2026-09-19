import { describe, expect, it, afterEach } from 'vitest'

const settingsStub = {
  source: {} as unknown,
  onChange: undefined as (() => void) | undefined,
}

import { installOpenCodeSession, OPENCODE_SESSION_SETTINGS_SCHEMA, resolveUserAgentValue } from '../src/host/opencode-session.ts'
import {
  isOpenCodeSessionEnabled,
  modelPath,
  OPENCODE_SESSION_HEADER,
  OPENCODE_SESSION_NAMESPACE,
} from '../src/compat/opencode-session.ts'
import { openCodeSessionOp } from '../src/client/model-header-ops.ts'

const baseFetch = globalThis.fetch

const enabled = {
  opencodeSession: {
    providers: {
      'opencode-go': {
        models: {
          'deepseek-v4-flash': true,
        },
      },
    },
  },
}

type HostListener = { name: string; callback: (...args: any[]) => unknown; options?: unknown }

type Harness = {
  listeners: HostListener[]
  cleanups: Array<() => void>
  fetchCalls: Array<{ input: unknown; init?: RequestInit }>
  dispose: () => void
  stream: (options: Record<string, unknown>, next: () => AsyncIterable<unknown>) => AsyncIterable<unknown>
}

function createHostHarness(): Harness {
  const listeners: HostListener[] = []
  const cleanups: Array<() => void> = []
  const fetchCalls: Array<{ input: unknown; init?: RequestInit }> = []
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    fetchCalls.push({ input, init })
    return new Response('ok')
  }) as typeof fetch
  const ctx = {
    settings: {
      get: (_namespace: string) => settingsStub.source,
      update: async () => undefined,
      describe: () => [],
      installSection(_owner: unknown, _namespace: string, _schema: unknown, _entry: unknown, hooks: { setSource: (source: () => unknown) => void; onChange: () => void }) {
        hooks.setSource(() => settingsStub.source)
        settingsStub.onChange = hooks.onChange
        hooks.onChange()
      },
    },
    timeout: () => () => undefined,
    on(name: string, callback: (...args: any[]) => unknown, options?: unknown) {
      const listener = { name, callback, options }
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
    effect(callback: () => void | (() => void)) {
      const cleanup = callback()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
      return cleanup
    },
  }
  installOpenCodeSession(ctx)
  const listener = listeners.find((entry) => entry.name === 'llm/stream')
  if (listener === undefined) throw new Error('missing llm/stream listener')
  return {
    listeners,
    cleanups,
    fetchCalls,
    stream: (options, next) => {
      const current = listeners.find((entry) => entry.name === 'llm/stream')
      return current === undefined ? next() : current.callback(options, next) as AsyncIterable<unknown>
    },
    dispose() {
      for (const cleanup of cleanups) cleanup()
    },
  }
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _chunk of stream) { /* consume */ }
}

afterEach(() => {
  settingsStub.source = {}
  settingsStub.onChange = undefined
  globalThis.fetch = baseFetch
})

describe('OpenCode session settings', () => {
  it('matches an exact provider/model pair', () => {
    expect(isOpenCodeSessionEnabled(undefined, 'opencode-go', 'deepseek-v4-flash')).toBe(false)
    expect(isOpenCodeSessionEnabled(enabled, 'opencode-go', 'deepseek-v4-flash')).toBe(true)
    expect(isOpenCodeSessionEnabled(enabled, 'opencode-go', 'other-model')).toBe(false)
    expect(isOpenCodeSessionEnabled(enabled, 'opencode', 'deepseek-v4-flash')).toBe(false)
  })

  it('fails closed for malformed or inherited settings', () => {
    const inheritedProviders = Object.create({
      'opencode-go': { models: { 'deepseek-v4-flash': true } },
    }) as Record<string, unknown>
    const inherited = { opencodeSession: { providers: inheritedProviders } }

    expect(isOpenCodeSessionEnabled(inherited, 'opencode-go', 'deepseek-v4-flash')).toBe(false)
    expect(isOpenCodeSessionEnabled({ opencodeSession: { providers: [] } }, 'opencode-go', 'deepseek-v4-flash')).toBe(false)
    expect(isOpenCodeSessionEnabled({ opencodeSession: { providers: { 'opencode-go': { models: { 'deepseek-v4-flash': 'true' } } } } }, 'opencode-go', 'deepseek-v4-flash')).toBe(false)
    expect(isOpenCodeSessionEnabled({ opencodeSession: { providers: { 'opencode-go': { models: { 'deepseek-v4-flash': false } } } } }, 'opencode-go', 'deepseek-v4-flash')).toBe(false)
    expect(isOpenCodeSessionEnabled(enabled, '', 'deepseek-v4-flash')).toBe(false)
    expect(isOpenCodeSessionEnabled(enabled, 'opencode-go', '')).toBe(false)
  })

  it('builds a path with model as an independent segment', () => {
    expect(modelPath('opencode-go', 'deepseek-v4-flash')).toEqual([
      'opencodeSession', 'providers', 'opencode-go', 'models', 'deepseek-v4-flash',
    ])
    expect(modelPath('', 'model')).toBeUndefined()
    expect(modelPath('route', '')).toBeUndefined()
  })

  it('exports the namespace and Header constants', () => {
    expect(OPENCODE_SESSION_NAMESPACE).toBe('dsh-thinking-effort')
    expect(OPENCODE_SESSION_HEADER).toBe('x-opencode-session')
  })
})

describe('OpenCode session Settings operations', () => {
  it('sets the exact model path when enabled', () => {
    expect(openCodeSessionOp('opencode-go', 'deepseek-v4-flash', true)).toEqual({
      op: 'set',
      path: ['opencodeSession', 'providers', 'opencode-go', 'models', 'deepseek-v4-flash'],
      value: true,
    })
  })

  it('unsets the exact model path when disabled', () => {
    expect(openCodeSessionOp('opencode-go', 'deepseek-v4-flash', false)).toEqual({
      op: 'unset',
      path: ['opencodeSession', 'providers', 'opencode-go', 'models', 'deepseek-v4-flash'],
    })
  })
  it('does not create operations for an empty route or model', () => {
    expect(openCodeSessionOp('', 'model', true)).toBeUndefined()
    expect(openCodeSessionOp('route', '', true)).toBeUndefined()
  })
})

describe('Host OpenCode session integration', () => {
  it('registers the plugin namespace with the OpenCode session, profile and auto backup fields', () => {
    const json = JSON.stringify(OPENCODE_SESSION_SETTINGS_SCHEMA.toJSON?.())
    expect(json).toContain('opencodeSession')
    expect(json).toContain('providers')
    expect(json).toContain('models')
    expect(json).toContain('profiles')
    expect(json).toContain('autoBackup')
  })

  it('prefers the settings service installSection when context injection is unavailable', () => {
    let installCalls = 0
    const context = {
      settings: {
        installSection: (_owner: unknown, _namespace: string, _schema: unknown, _entry: unknown, hooks: { setSource: (source: () => unknown) => void; onChange: () => void }) => {
          installCalls += 1
          hooks.setSource(() => ({}))
          hooks.onChange()
        },
      },
      on: () => () => undefined,
      effect: (callback: () => void | (() => void)) => callback(),
    }

    installOpenCodeSession(context as never)

    expect(installCalls).toBe(1)
  })

  it('registers through the legacy SettingsProvider register path', () => {
    let registerCalls = 0
    const cleanups: Array<() => void> = []
    const legacySettings = {
      get: (_namespace: string) => ({}),
      update: async (_namespace: string, _value: Record<string, unknown>) => undefined,
      describe: () => [],
      register: (_namespace: string, _schema: unknown, _options?: unknown) => {
        registerCalls += 1
        return {
          get: () => ({}),
          watch: () => () => undefined,
        }
      },
    }
    type LegacyContext = {
      readonly fiber: { readonly state: number }
      readonly settings: typeof legacySettings
      readonly timeout: () => () => undefined
      readonly on: () => () => undefined
      readonly effect: (callback: () => void | (() => void)) => void | (() => void)
      readonly inject: (
        dependencies: readonly string[],
        callback: (scope: { settings: typeof legacySettings; effect: LegacyContext['effect'] }) => void,
      ) => void
    }
    let context: LegacyContext
    context = {
      fiber: { state: 0 },
      settings: legacySettings,
      timeout: () => () => undefined,
      on: () => () => undefined,
      effect(callback) {
        const cleanup = callback()
        if (typeof cleanup === 'function') cleanups.push(cleanup)
        return cleanup
      },
      inject(_dependencies, callback) {
        callback({ settings: legacySettings, effect: context.effect })
      },
    }

    installOpenCodeSession(context as never)

    expect(registerCalls).toBe(1)
    for (const cleanup of cleanups.reverse()) cleanup()
  })

  it('calls llm/stream next and injects the matching session id lazily', async () => {
    settingsStub.source = enabled
    const harness = createHostHarness()
    let nextCalls = 0
    await drain(harness.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: 'session-a' }, () => {
      nextCalls += 1
      return {
        async *[Symbol.asyncIterator](): AsyncIterableIterator<unknown> {
          await fetch('https://provider.test/chat/completions')
          yield 'done'
        },
      }
    }))

    expect(nextCalls).toBe(1)
    expect(harness.fetchCalls).toHaveLength(1)
    const headers = new Headers(harness.fetchCalls[0]?.init?.headers)
    const header = headers.get(OPENCODE_SESSION_HEADER)
    expect(header).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(header).toHaveLength(30)
    harness.dispose()
  })

  it('isolates concurrent session ids and preserves explicit headers', async () => {
    settingsStub.source = enabled
    const harness = createHostHarness()
    const barrier: Array<() => void> = []
    const waitForBarrier = (): Promise<void> => new Promise((resolve) => barrier.push(resolve))
    const makeStream = (sessionId: string, explicit?: string): AsyncIterable<unknown> => harness.stream(
      { provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId },
      () => ({
        async *[Symbol.asyncIterator](): AsyncIterableIterator<unknown> {
          await waitForBarrier()
          if (explicit === undefined) await fetch('https://provider.test/chat/completions')
          else await fetch('https://provider.test/chat/completions', { headers: { 'X-OPENCODE-SESSION': explicit } })
          yield 'done'
        },
      }),
    )

    const first = drain(makeStream('session-a'))
    const second = drain(makeStream('session-b', 'caller-value'))
    await Promise.resolve()
    expect(harness.fetchCalls).toHaveLength(0)
    for (const resolve of barrier.splice(0)) resolve()
    await Promise.all([first, second])

    expect(harness.fetchCalls).toHaveLength(2)
    const received = harness.fetchCalls.map((call) => new Headers(call.init?.headers).get(OPENCODE_SESSION_HEADER))
    expect(received).toContain('caller-value')
    const derived = received.filter((value) => value !== 'caller-value')
    expect(derived).toHaveLength(1)
    expect(derived[0]).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    harness.dispose()
  })

  it('does not retain the session Header after normal iterator completion', async () => {
    settingsStub.source = enabled
    const harness = createHostHarness()
    let delayed: Promise<void> | undefined
    const iterator = harness.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: 'session-normal' }, () => ({
      async *[Symbol.asyncIterator](): AsyncIterableIterator<unknown> {
        try {
          await fetch('https://provider.test/during-normal')
          yield 'done'
        } finally {
          delayed = new Promise<void>((resolve) => {
            setTimeout(() => { void fetch('https://provider.test/after-normal').then(() => resolve()) }, 0)
          })
        }
      },
    }))[Symbol.asyncIterator]()

    await iterator.next()
    await iterator.next()
    await delayed

    const headers = harness.fetchCalls.map((call) => new Headers(call.init?.headers).get(OPENCODE_SESSION_HEADER))
    expect(headers[0]).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(headers[1]).toBeNull()
    harness.dispose()
  })

  it('does not retain the session Header after consumer return cancellation', async () => {
    settingsStub.source = enabled
    const harness = createHostHarness()
    let delayed: Promise<void> | undefined
    const iterator = harness.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: 'session-return' }, () => ({
      async *[Symbol.asyncIterator](): AsyncIterableIterator<unknown> {
        try {
          await fetch('https://provider.test/during-return')
          yield 'pending'
        } finally {
          delayed = new Promise<void>((resolve) => {
            setTimeout(() => { void fetch('https://provider.test/after-return').then(() => resolve()) }, 0)
          })
        }
      },
    }))[Symbol.asyncIterator]()

    await iterator.next()
    await iterator.return?.()
    await delayed

    const headers = harness.fetchCalls.map((call) => new Headers(call.init?.headers).get(OPENCODE_SESSION_HEADER))
    expect(headers[0]).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(headers[1]).toBeNull()
    harness.dispose()
  })

  it('does not retain the session Header after an underlying iterator throw', async () => {
    settingsStub.source = enabled
    const harness = createHostHarness()
    let delayed: Promise<void> | undefined
    const iterator = harness.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: 'session-throw' }, () => ({
      async *[Symbol.asyncIterator](): AsyncIterableIterator<unknown> {
        try {
          await fetch('https://provider.test/during-throw')
          yield 'pending'
        } finally {
          delayed = new Promise<void>((resolve) => {
            setTimeout(() => { void fetch('https://provider.test/after-throw').then(() => resolve()) }, 0)
          })
        }
      },
    }))[Symbol.asyncIterator]()

    await iterator.next()
    await expect(iterator.throw?.(new Error('stop stream'))).rejects.toThrow('stop stream')
    await delayed

    const headers = harness.fetchCalls.map((call) => new Headers(call.init?.headers).get(OPENCODE_SESSION_HEADER))
    expect(headers[0]).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(headers[1]).toBeNull()
    harness.dispose()
  })

  it('merges Request input and init headers without losing either source', async () => {
    settingsStub.source = enabled
    const harness = createHostHarness()
    await drain(harness.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: 'session-headers' }, async function* () {
      const input = new Request('https://provider.test/chat/completions', { headers: { 'x-input': 'input-value' } })
      await fetch(input, { headers: [['x-init', 'init-value']] })
      yield 'done'
    }))

    const call = harness.fetchCalls[0]
    const headers = new Headers(call?.input instanceof Request ? call.input.headers : undefined)
    new Headers(call?.init?.headers).forEach((value, name) => headers.set(name, value))
    expect(headers.get('x-input')).toBe('input-value')
    expect(headers.get('x-init')).toBe('init-value')
    expect(headers.get(OPENCODE_SESSION_HEADER)).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    harness.dispose()
  })

  it('does not inject disabled models or requests without a session id', async () => {
    settingsStub.source = enabled
    const harness = createHostHarness()
    const requests = [
      { provider: 'opencode-go', model: 'other-model' },
      { provider: 'opencode', model: 'deepseek-v4-flash', sessionId: 'session-b' },
      { provider: 'opencode-go', model: 'deepseek-v4-flash' },
    ]
    for (const options of requests) {
      await drain(harness.stream(options, async function* () {
        await fetch('https://provider.test/chat/completions')
        yield 'done'
      }))
    }
    expect(harness.fetchCalls).toHaveLength(3)
    expect(harness.fetchCalls.every((call) => !new Headers(call.init?.headers).has(OPENCODE_SESSION_HEADER))).toBe(true)
    harness.dispose()
  })

  it('restores only its own fetch patch and stops injecting after disposal', async () => {
    settingsStub.source = enabled
    const harness = createHostHarness()
    const patched = globalThis.fetch
    const laterPatch = (async () => new Response('later')) as typeof fetch
    globalThis.fetch = laterPatch
    harness.dispose()
    expect(harness.listeners.some((entry) => entry.name === 'llm/stream')).toBe(false)
    expect(globalThis.fetch).toBe(laterPatch)
    globalThis.fetch = patched
    harness.dispose()
    expect(globalThis.fetch).not.toBe(patched)
  })

  it('sends the raw DSH session id when format mode is passthrough', async () => {
    settingsStub.source = {
      opencodeSession: {
        providers: { 'opencode-go': { models: { 'deepseek-v4-flash': true } } },
        format: { mode: 'passthrough' },
      },
    }
    const harness = createHostHarness()
    await drain(harness.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: 'session-a' }, async function* () {
      await fetch('https://provider.test/chat/completions')
      yield 'done'
    }))
    const headers = new Headers(harness.fetchCalls[0]?.init?.headers)
    expect(headers.get(OPENCODE_SESSION_HEADER)).toBe('session-a')
    harness.dispose()
  })

  it('renders template mode values into the header', async () => {
    settingsStub.source = {
      opencodeSession: {
        providers: { 'opencode-go': { models: { 'deepseek-v4-flash': true } } },
        format: { mode: 'template', template: 'tmpl_{hex12}_{tail62}' },
      },
    }
    const harness = createHostHarness()
    await drain(harness.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: 'session-a' }, async function* () {
      await fetch('https://provider.test/chat/completions')
      yield 'done'
    }))
    const headers = new Headers(harness.fetchCalls[0]?.init?.headers)
    expect(headers.get(OPENCODE_SESSION_HEADER)).toMatch(/^tmpl_[0-9a-f]{12}_[0-9A-Za-z]{14}$/)
    harness.dispose()
  })

  it('omits the header when validation drops the value', async () => {
    settingsStub.source = {
      opencodeSession: {
        providers: { 'opencode-go': { models: { 'deepseek-v4-flash': true } } },
        format: { mode: 'passthrough', validate: '^abc$', onInvalid: 'drop' },
      },
    }
    const harness = createHostHarness()
    await drain(harness.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: 'session-a' }, async function* () {
      await fetch('https://provider.test/chat/completions')
      yield 'done'
    }))
    const headers = new Headers(harness.fetchCalls[0]?.init?.headers)
    expect(headers.has(OPENCODE_SESSION_HEADER)).toBe(false)
    harness.dispose()
  })

  it('reuses the same session value across separate streams in one DSH session', async () => {
    settingsStub.source = enabled
    const harness = createHostHarness()
    const run = (): Promise<void> => drain(harness.stream(
      { provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: 'session-stable' },
      async function* () {
        await fetch('https://provider.test/chat/completions')
        yield 'done'
      },
    ))
    await run()
    await run()
    const headers = harness.fetchCalls.map((call) => new Headers(call.init?.headers).get(OPENCODE_SESSION_HEADER))
    expect(headers[0]).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(headers[1]).toBe(headers[0])
    harness.dispose()
  })

  it('derives a distinct value per DSH session (subagent differentiation)', async () => {
    settingsStub.source = enabled
    const harness = createHostHarness()
    for (const sessionId of ['session-alpha', 'session-beta']) {
      await drain(harness.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId }, async function* () {
        await fetch('https://provider.test/chat/completions')
        yield 'done'
      }))
    }
    const received = harness.fetchCalls.map((call) => new Headers(call.init?.headers).get(OPENCODE_SESSION_HEADER))
    expect(received[0]).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(received[1]).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(received[0]).not.toBe(received[1])
    harness.dispose()
  })

  it('rewrites user-agent for a route enabled in userAgent.providers', async () => {
    settingsStub.source = {
      opencodeSession: {
        userAgent: {
          value: 'opencode/1.18.31 runtime/bun/1.3.14',
          providers: { 'opencode-go': { enabled: true } },
        },
      },
    }
    const harness = createHostHarness()
    await drain(harness.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: 'session-ua' }, async function* () {
      await fetch('https://provider.test/chat/completions')
      yield 'done'
    }))
    const headers = new Headers(harness.fetchCalls[0]?.init?.headers)
    expect(headers.get('user-agent')).toBe('opencode/1.18.31 runtime/bun/1.3.14')
    expect(headers.has(OPENCODE_SESSION_HEADER)).toBe(false)
    harness.dispose()
  })

  it('rewrites user-agent for a single model toggle without touching other models', async () => {
    settingsStub.source = {
      opencodeSession: {
        userAgent: {
          value: 'opencode/1.18.31',
          providers: { 'opencode-go': { models: { 'deepseek-v4-flash': true } } },
        },
      },
    }
    const harness = createHostHarness()
    for (const model of ['deepseek-v4-flash', 'other-model']) {
      await drain(harness.stream({ provider: 'opencode-go', model, sessionId: `session-${model}` }, async function* () {
        await fetch('https://provider.test/chat/completions')
        yield 'done'
      }))
    }
    const received = harness.fetchCalls.map((call) => new Headers(call.init?.headers).get('user-agent'))
    expect(received[0]).toBe('opencode/1.18.31')
    expect(received[1]).toBeNull()
    harness.dispose()
  })

  it('prefers the provider-level user-agent value over the master value', async () => {
    settingsStub.source = {
      opencodeSession: {
        userAgent: {
          value: 'master/1.0',
          providers: {
            'opencode-go': { value: 'opencode/1.18.31 ai-sdk/provider-utils/4.0.23', models: { 'deepseek-v4-flash': true } },
            'other-route': { models: { 'deepseek-v4-flash': true } },
          },
        },
      },
    }
    const harness = createHostHarness()
    for (const provider of ['opencode-go', 'other-route']) {
      await drain(harness.stream({ provider, model: 'deepseek-v4-flash', sessionId: `session-${provider}` }, async function* () {
        await fetch('https://provider.test/chat/completions')
        yield 'done'
      }))
    }
    const received = harness.fetchCalls.map((call) => new Headers(call.init?.headers).get('user-agent'))
    expect(received[0]).toBe('opencode/1.18.31 ai-sdk/provider-utils/4.0.23')
    expect(received[1]).toBe('master/1.0')
    harness.dispose()
  })

  it('combines the session header and user-agent override on one match', async () => {
    settingsStub.source = {
      opencodeSession: {
        providers: { 'opencode-go': { models: { 'deepseek-v4-flash': true } } },
        userAgent: { value: 'opencode/1.18.31', providers: { 'opencode-go': { enabled: true } } },
      },
    }
    const harness = createHostHarness()
    await drain(harness.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: 'session-both' }, async function* () {
      await fetch('https://provider.test/chat/completions')
      yield 'done'
    }))
    const headers = new Headers(harness.fetchCalls[0]?.init?.headers)
    expect(headers.get('user-agent')).toBe('opencode/1.18.31')
    expect(headers.get(OPENCODE_SESSION_HEADER)).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    harness.dispose()
  })

  it('preserves an explicit caller session header while still rewriting user-agent', async () => {
    settingsStub.source = {
      opencodeSession: {
        providers: { 'opencode-go': { models: { 'deepseek-v4-flash': true } } },
        userAgent: { value: 'opencode/1.18.31', providers: { 'opencode-go': { models: { 'deepseek-v4-flash': true } } } },
      },
    }
    const harness = createHostHarness()
    await drain(harness.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash', sessionId: 'session-explicit' }, async function* () {
      await fetch('https://provider.test/chat/completions', { headers: { 'X-OPENCODE-SESSION': 'caller-value' } })
      yield 'done'
    }))
    const headers = new Headers(harness.fetchCalls[0]?.init?.headers)
    expect(headers.get(OPENCODE_SESSION_HEADER)).toBe('caller-value')
    expect(headers.get('user-agent')).toBe('opencode/1.18.31')
    harness.dispose()
  })

  it('rewrites user-agent even when the request has no session id', async () => {
    settingsStub.source = {
      opencodeSession: {
        userAgent: {
          value: 'opencode/1.18.31 runtime/bun/1.3.14',
          providers: { 'opencode-go': { enabled: true } },
        },
      },
    }
    const harness = createHostHarness()
    await drain(harness.stream({ provider: 'opencode-go', model: 'deepseek-v4-flash' }, async function* () {
      await fetch('https://provider.test/chat/completions')
      yield 'done'
    }))
    const headers = new Headers(harness.fetchCalls[0]?.init?.headers)
    expect(headers.get('user-agent')).toBe('opencode/1.18.31 runtime/bun/1.3.14')
    expect(headers.has(OPENCODE_SESSION_HEADER)).toBe(false)
    harness.dispose()
  })
})

describe('resolveUserAgentValue', () => {
  it('is fully off when the master value is missing or empty', () => {
    expect(resolveUserAgentValue(undefined, 'p', 'm')).toBeUndefined()
    expect(resolveUserAgentValue({ opencodeSession: { userAgent: { providers: { p: { enabled: true } } } } }, 'p', 'm')).toBeUndefined()
    expect(resolveUserAgentValue({ opencodeSession: { userAgent: { value: '', providers: { p: { models: { m: true } } } } } }, 'p', 'm')).toBeUndefined()
  })

  it('matches a route-wide enabled flag for every model', () => {
    const settings = { opencodeSession: { userAgent: { value: 'ua/1', providers: { p: { enabled: true } } } } }
    expect(resolveUserAgentValue(settings, 'p', 'm1')).toBe('ua/1')
    expect(resolveUserAgentValue(settings, 'p', 'm2')).toBe('ua/1')
    expect(resolveUserAgentValue(settings, 'other', 'm1')).toBeUndefined()
  })

  it('matches an exact model toggle and prefers the provider value', () => {
    const settings = {
      opencodeSession: {
        userAgent: {
          value: 'master/1',
          providers: { p: { value: 'route/2', models: { m: true, other: false } } },
        },
      },
    }
    expect(resolveUserAgentValue(settings, 'p', 'm')).toBe('route/2')
    expect(resolveUserAgentValue(settings, 'p', 'other')).toBeUndefined()
    expect(resolveUserAgentValue(settings, 'p', 'unlisted')).toBeUndefined()
  })

  it('returns undefined for empty provider or model names', () => {
    const settings = { opencodeSession: { userAgent: { value: 'ua/1', providers: { p: { enabled: true } } } } }
    expect(resolveUserAgentValue(settings, '', 'm')).toBeUndefined()
    expect(resolveUserAgentValue(settings, 'p', '')).toBeUndefined()
  })
})
