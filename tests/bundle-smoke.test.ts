import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { resolveTakeoverGatewayCompat } from '../src/compat/gateway/resolve.js'
import {
  isCustomOpenAiGateway,
  resolveTakeoverProviders,
  takeoverProvidersOf,
} from '../src/compat/gateway/takeover.js'

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
  plugin(plugin: { inject?: readonly string[]; apply: (scope: ClientContext) => void }): unknown
  inject(names: string[], callback: (scope: ClientContext) => void): unknown
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
        // Optional host model-directory service (ui-model-selection): the
        // composer seat probes it once and skips itself when it is absent —
        // this profile has no such service.
        if (name === 'modelDirectories') return undefined
        // Older DSH transports expose no `remote.session` (the seat's modern
        // session remote shape); a profile without it registers the base list.
        if (name === 'remote.session') return undefined
        if (name === 'remote') return undefined
        throw new Error(`Unexpected context read: ${name}`)
      },
      on(event, callback) {
        expect(event).toBe('internal/service')
        expect(callback).toBeTypeOf('function')
        return () => undefined
      },
      plugin(plugin: { inject?: readonly string[]; apply: (scope: ClientContext) => void }) {
        const allPresent = (plugin.inject ?? []).every((name) => context.get(name) !== undefined)
        if (allPresent) plugin.apply(context)
        return () => undefined
      },
      inject(names: string[], callback: (scope: ClientContext) => void) {
        // Legacy compatibility path retained for older client plugins. The
        // current seat uses the named plugin fiber above.
        const allPresent = names.every((name) => context.get(name) !== undefined)
        if (allPresent) callback(context)
        return () => undefined
      },
      effect(callback) {
        callback()
      },
    }

    plugin.apply(context)
    expect(remoteReads).toBe(1)
  })

  it('projects shared pi-ai provider and model compat with precedence without takeover', () => {
    const piAi = {
      providers: {
        local: {
          api: 'openai-completions',
          baseURL: 'http://gateway.test/v1',
          compat: { thinkingFormat: 'deepseek', supportsReasoningEffort: true },
          models: [{
            id: 'model',
            reasoningEfforts: { off: null, high: 'high' },
            compat: { thinkingFormat: 'qwen', supportsReasoningEffort: false },
          }],
         },
       },
    }
    const overridePiAi = {
      providers: {
        local: {
          api: 'openai-completions',
          baseURL: 'http://gateway.test/v1',
          compat: { thinkingFormat: 'deepseek', supportsReasoningEffort: true },
          modelOverrides: {
            override: {
              reasoningEfforts: { high: 'high' },
              compat: { thinkingFormat: 'openai', supportsReasoningEffort: true },
            },
          },
        },
      },
    }

    expect(resolveTakeoverProviders({ version: '0.1.1-rc.2', piAi })).toEqual(['local'])
    expect(resolveTakeoverProviders({ version: '0.1.0-rc.7', piAi })).toEqual([])
    expect(resolveTakeoverGatewayCompat({
      version: '0.1.1-rc.2',
      piAi,
      provider: 'local',
      model: 'model',
    })).toMatchObject({
      thinkingFormat: { value: 'qwen', source: 'model' },
      supportsReasoningEffort: { value: false, source: 'model' },
    })
    expect(resolveTakeoverGatewayCompat({
      version: '0.1.1-rc.2',
      piAi: overridePiAi,
      provider: 'local',
      model: 'override',
    })).toMatchObject({
      thinkingFormat: { value: 'openai', source: 'model' },
      supportsReasoningEffort: { value: true, source: 'model' },
    })
    expect(resolveTakeoverGatewayCompat({
      version: '0.1.1-rc.2',
      piAi: overridePiAi,
      provider: 'local',
      model: 'missing',
    })).toMatchObject({
      thinkingFormat: { value: 'deepseek', source: 'provider' },
      supportsReasoningEffort: { value: true, source: 'provider' },
    })
    expect(resolveTakeoverGatewayCompat({
      version: '0.1.1-rc.2',
      piAi,
      provider: 'local',
      model: 'model',
      takeover: { enabled: true, providers: ['other'] },
    })).toBeUndefined()
    expect(takeoverProvidersOf(undefined)).toBeNull()
  })

  it('requires a non-official endpoint in addition to the completions api', () => {
    expect(isCustomOpenAiGateway({ api: 'openai-completions', baseURL: 'https://api.openai.com/v1' })).toBe(false)
    expect(isCustomOpenAiGateway({ api: 'openai-completions' })).toBe(false)
    expect(isCustomOpenAiGateway({ api: 'openai-completions', baseURL: 'https://gateway.test/v1' })).toBe(true)
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

describe('composer seat surface material', () => {
  /**
   * The seat's panel and model menu are surfaces of their own, so they must be
   * opaque. `--dsw-specific-menu` is the core's 58%-translucent menu material
   * and is only ever painted together with `--dsw-menu-backdrop-filter`; using
   * it bare left the page text behind the panel readable through it (issue
   * #14). This asserts on the built artifact because the token choice is a
   * build-time substitution, and a future edit that reintroduced the
   * translucent fill would otherwise only show up in a running browser.
   *
   * The CSS-Modules hash is build-dependent, and lightningcss hashes are not
   * purely alphanumeric — the released 0.3.3 bundle contains `._3_LLuW_panel`,
   * where the hash itself starts with an underscore. The class is therefore
   * matched as `.<hash>_<local>` with a character class that admits `_` and
   * `-`, so the assertion does not depend on which environment produced the
   * hash.
   */
  it('paints the panel and menu with an opaque surface token, not the menu fill', () => {
    const bundle = readArtifact('lib/client.js')
    const ruleFor = (local: string): string => {
      const match = new RegExp(`\\.[A-Za-z0-9_-]+_${local}\\{[^}]*\\}`).exec(bundle)
      expect(match, `${local} rule missing from the bundle`).not.toBeNull()
      return match![0]
    }

    // Guard the matcher itself: lightningcss produced `._3_LLuW_panel` in the
    // released 0.3.3 bundle, so a hash beginning with `_` must match. Without
    // this, a matcher that only accepted alphanumerics would pass here on a
    // build whose hash happens to be alphanumeric and fail in CI.
    expect(new RegExp('\\.[A-Za-z0-9_-]+_panel\\{[^}]*\\}').test('._3_LLuW_panel{background:var(--te-panel-surface)}')).toBe(true)

    const panel = ruleFor('panel')
    const menu = ruleFor('modelMenu')
    for (const [local, rule] of [['panel', panel], ['modelMenu', menu]] as const) {
      expect(rule, `${local} must paint an opaque surface`).toContain('background:var(--te-panel-surface)')
      expect(rule, `${local} must not use the translucent menu fill`).not.toContain('--dsw-specific-menu')
    }
    // The surface is defined once on the root (so every descendant inherits a
    // defined, opaque value) and re-bound to the next layer up by the menu.
    expect(ruleFor('root')).toContain('--te-panel-surface:var(--dsw-alias-bg-layer-1)')
    expect(menu).toContain('--te-panel-surface:var(--dsw-alias-bg-layer-2)')
    // Nothing in this stylesheet may paint the translucent menu material: a
    // bare `--dsw-specific-menu` is exactly the defect this guards.
    expect(bundle).not.toMatch(/_root\{[^}]*--dsw-specific-menu/)
  })
})

describe('composer seat affordances', () => {
  /**
   * The scale labels are absolutely positioned by the same fractions the pips
   * use, and the model row's chevron has an open state that turns it over. Both
   * are pure CSS consequences of class names the component toggles, so they are
   * asserted on the built artifact where the class hash is already resolved.
   */
  it('centers the scale labels on the pips and flips the open chevron', () => {
    const bundle = readArtifact('lib/client.js')
    const ruleFor = (local: string): string => {
      const match = new RegExp(`\\.[A-Za-z0-9_-]+_${local}\\{[^}]*\\}`).exec(bundle)
      expect(match, `${local} rule missing from the bundle`).not.toBeNull()
      return match![0]
    }

    // An evenly divided flex label sat half a step inside each end pip.
    // lightningcss folds translateX into the two-value translate shorthand.
    expect(ruleFor('tick')).toContain('transform:translate(-50%)')
    expect(ruleFor('tick')).not.toContain('flex:')
    expect(ruleFor('scale')).toContain('position:relative')

    // 45deg points down-right, 225deg is the same arrow turned back up. The
    // arrow is a ::before, and lightningcss emits it as a single-colon
    // `:before` with the transform function list already minified together.
    const before = (local: string): string => {
      const match = new RegExp(`\\.[A-Za-z0-9_-]+_${local}:before\\{[^}]*\\}`).exec(bundle)
      expect(match, `${local}:before rule missing from the bundle`).not.toBeNull()
      return match![0]
    }
    expect(before('chevron')).toContain('transform:rotate(45deg)translateY(-2px)')
    expect(before('chevronOpen')).toContain('transform:rotate(225deg)translateY(-2px)')
  })

  /**
   * A native range keeps the thumb's whole box inside the track, so its centre
   * travels only [half a thumb, width - half a thumb] — a full thumb shorter
   * than the track. The track, the fill and the scale are inset by half a thumb
   * so their ends sit where the centre actually reaches.
   *
   * Pixel-measured in a real browser at 320px: before, the centre read
   * -3.5 / 97.5 / 197.5 / 298.5 against pips at 0 / 106.66 / 213.33 / 320; after,
   * 9 / 109.5 / 209.5 / 310 against pips at 9 / 109.66 / 210.33 / 311. A
   * negative margin cannot fix this — it shifts both ends at once — so the
   * assertion below is that the inset exists and the margin does not.
   */
  it('insets the track so its ends meet the thumb centre travel', () => {
    const bundle = readArtifact('lib/client.js')
    const ruleFor = (local: string): string => {
      const match = new RegExp(`\\.[A-Za-z0-9_-]+_${local}\\{[^}]*\\}`).exec(bundle)
      expect(match, `${local} rule missing from the bundle`).not.toBeNull()
      return match![0]
    }
    const thumbFor = (pseudo: string): string => {
      const match = new RegExp(`\\.[A-Za-z0-9_-]+_range::${pseudo}\\{[^}]*\\}`).exec(bundle)
      expect(match, `${pseudo} rule missing from the bundle`).not.toBeNull()
      return match![0]
    }

    // Half of the 18px thumb Chromium actually renders (range thumbs are
    // border-box, so the 3px borders are inside that width).
    expect(ruleFor('root')).toContain('--te-thumb-inset:9px')

    const track = ruleFor('rangeTrack')
    expect(track).toContain('left:var(--te-thumb-inset)')
    expect(track).toContain('right:var(--te-thumb-inset)')
    expect(track).not.toContain('left:0;')

    // The labels are absolutely positioned, so they resolve against the
    // padding box and need the same inset to stay under the pips.
    expect(ruleFor('scale')).toContain('padding:0 var(--te-thumb-inset)')

    expect(thumbFor('-webkit-slider-thumb')).not.toContain('margin-left')
    expect(thumbFor('-moz-range-thumb')).not.toContain('margin-left')
  })

  /**
   * The panel reads the host's content type scale, so it tracks the Settings
   * font-size preference the way the composer and the chat do. The fallbacks
   * reproduce the previous fixed 13px/20px exactly, so nothing moves at the
   * default 14px body.
   */
  it('takes the panel type scale from the host content scale', () => {
    const bundle = readArtifact('lib/client.js')
    const ruleFor = (local: string): string => {
      const match = new RegExp(`\\.[A-Za-z0-9_-]+_${local}\\{[^}]*\\}`).exec(bundle)
      expect(match, `${local} rule missing from the bundle`).not.toBeNull()
      return match![0]
    }

    const root = ruleFor('root')
    expect(root).toContain('font-size:var(--dsh-content-font-size-secondary,13px)')
    expect(root).toContain('line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))')
    // A fixed size here is what made the panel ignore the preference.
    expect(root).not.toMatch(/font-size:13px/)
    expect(root).not.toMatch(/line-height:20px/)
    // The label row is absolutely positioned, so it has to be told how tall it
    // is, and that height has to grow with the same scale.
    expect(ruleFor('scale')).toContain('height:calc(20px + var(--dsh-content-font-delta-secondary,0px))')
  })
})
