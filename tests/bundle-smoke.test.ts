import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { resolveGatewayCompat } from '../src/compat/gateway/resolve.js'
import { takeoverProvidersOf } from '../src/compat/gateway/takeover.js'

const root = resolve(import.meta.dirname, '..')

type Descriptor = {
  readonly id: string
  readonly factory: (require: (specifier: string) => unknown) => ClientPlugin
}

type ClientPlugin = {
  readonly name: string
  readonly inject: readonly string[]
  readonly apply: (context: ClientContext) => void
}

type ClientContext = {
  get(name: string): unknown
  on(event: 'internal/service', callback: (name: string) => void): unknown
  effect(callback: () => void | (() => void), label?: string): unknown
}

function readArtifact(relativePath: string): string {
  try {
    return readFileSync(resolve(root, relativePath), 'utf8')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Missing ${relativePath}; run npm run build first. ${detail}`)
  }
}

function readPackageVersion(): string {
  const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }
  return packageJson.version
}

function loadDescriptor(source: string): Descriptor {
  let descriptor: Descriptor | undefined
  vm.runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load(value: Descriptor) {
          descriptor = value
        },
      },
    },
  })
  if (descriptor === undefined) throw new Error('Client bundle did not register a descriptor')
  return descriptor
}

function createReactPlatform(): Record<string, unknown> {
  return {
    createElement: () => ({}),
    Fragment: Symbol.for('react.fragment'),
    useEffect: () => undefined,
    useMemo: (value: () => unknown) => value(),
    useState: (value: unknown) => [value, () => undefined],
  }
}

describe('build artifacts', () => {
  it('emits and executes the lazy client descriptor contract', () => {
    const source = readArtifact('lib/client.js')
    expect(source).toContain('window.__ModuleLoader__.load')
    expect(source).toContain("id: '@hytime/dsh-thinking-effort'")
    expect(source).toContain(JSON.stringify(readPackageVersion()))
    expect(source).toContain('return module.exports;')
    expect(source).not.toContain("ctx.inject(['remote',")

    const descriptor = loadDescriptor(source)
    const required: string[] = []
    const React = createReactPlatform()
    const factory = descriptor.factory((specifier) => {
      required.push(specifier)
      if (specifier === 'react') return React
      if (specifier === 'react/jsx-runtime') return { jsx: () => ({}), jsxs: () => ({}) }
      throw new Error(`Unexpected external dependency: ${specifier}`)
    })

    expect(descriptor.id).toBe('@hytime/dsh-thinking-effort')
    expect(factory.name).toBe('@hytime/dsh-thinking-effort')
    expect(factory.inject).toEqual(['slots', 'connection', 'locale'])
    expect(typeof factory.apply).toBe('function')
    expect(required).toContain('react')
    expect(required).toContain('react/jsx-runtime')
  })

  it('reads remote.settings through get and subscribes to service availability', () => {
    const descriptor = loadDescriptor(readArtifact('lib/client.js'))
    const React = createReactPlatform()
    const plugin = descriptor.factory((specifier) => {
      if (specifier === 'react') return React
      if (specifier === 'react/jsx-runtime') return { jsx: () => ({}), jsxs: () => ({}) }
      throw new Error(`Unexpected external dependency: ${specifier}`)
    })

    let remoteReads = 0
    const remoteSettings = { describe: async () => ({ ok: true }), mutate: async () => ({ ok: true }) }
    const context: ClientContext = {
      get(name) {
        if (name === 'slots') {
          return {
            inject: (_slot: string, callback: () => void) => callback(),
            register: () => undefined,
          }
        }
        if (name === 'connection') return undefined
        if (name === 'locale') {
          return {
            register: () => () => undefined,
            bind: () => (key: string) => key,
            getSnapshot: () => ({ locales: [] }),
          }
        }
        if (name === 'remote.settings') {
          remoteReads += 1
          return remoteSettings
        }
        throw new Error(`Unexpected context read: ${name}`)
      },
      on(event, callback) {
        expect(event).toBe('internal/service')
        expect(callback).toBeTypeOf('function')
        return () => undefined
      },
      effect(callback) {
        callback()
      },
    }

    plugin.apply(context)
    expect(remoteReads).toBe(1)
  })

  it('projects shared pi-ai compat fields without requiring takeover', () => {
    expect(resolveGatewayCompat({
      provider: 'local',
      model: 'model',
      modelCompat: { thinkingFormat: 'qwen', supportsReasoningEffort: false },
    })).toMatchObject({
      thinkingFormat: { value: 'qwen', source: 'model' },
      supportsReasoningEffort: { value: false, source: 'model' },
    })
    expect(takeoverProvidersOf(undefined)).toBeNull()
  })

  it('reads an enabled takeover list without mutating its fields', () => {
    const section = { enabled: true, providers: ['local'] }
    expect(takeoverProvidersOf(section)).toEqual(['local'])
    expect(section).toEqual({ enabled: true, providers: ['local'] })
  })

  it('exports the Host entry contract', async () => {
    readArtifact('lib/index.js')
    const host = await import(`${pathToFileURL(resolve(root, 'lib/index.js')).href}?smoke=${Date.now()}`)

    expect(host).toHaveProperty('name')
    expect(host).toHaveProperty('inject')
    expect(host).toHaveProperty('apply')
  })
})
