import { describe, expect, it, afterEach } from 'vitest'

const settingsStub = {
  source: {} as unknown,
  onChange: undefined as (() => void) | undefined,
}

import { installOpenCodeSession, OPENCODE_SESSION_SETTINGS_SCHEMA } from '../src/host/opencode-session.ts'
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
  it('registers the plugin namespace with nested boolean defaults', () => {
    const schema = OPENCODE_SESSION_SETTINGS_SCHEMA as unknown as { toJSON?: () => unknown }
    const json = schema.toJSON?.() as Record<string, unknown> | undefined
    expect(json).toBeDefined()
    expect(JSON.stringify(json)).toContain('opencodeSession')
    expect(JSON.stringify(json)).toContain('providers')
    expect(JSON.stringify(json)).toContain('models')
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
    expect(headers.get(OPENCODE_SESSION_HEADER)).toBe('session-a')
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
    expect(received).toContain('session-a')
    expect(received).toContain('caller-value')
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
    expect(headers).toEqual(['session-normal', null])
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
    expect(headers).toEqual(['session-return', null])
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
    expect(headers).toEqual(['session-throw', null])
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
    expect(headers.get(OPENCODE_SESSION_HEADER)).toBe('session-headers')
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
})
