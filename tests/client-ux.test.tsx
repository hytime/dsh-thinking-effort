// @vitest-environment jsdom
import React, { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SectionEditor } from '../src/client/SectionEditor.js'
import { createTakeoverRuntimeStore, type TakeoverRuntimeResolution } from '../src/client/takeover-runtime.js'
import { GatewayCompatControls } from '../src/client/components/GatewayCompatControls.js'
import { ModelEditor } from '../src/client/components/ModelEditor.js'
import { providerGatewayCompatViewFrom } from '../src/client/model-inventory.js'
import { en, zh } from '../src/client/locales.js'
import { iosPalette } from '../src/client/theme.js'
import type {
  ClientLocale,
  ClientResult,
  InventoryItem,
  SettingsApi,
  SettingsNamespace,
  SettingsOp,
  Translation,
} from '../src/client/types.js'

const packageManifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf8')) as { version: string }

const text = (key: string, params?: Record<string, unknown>): string => {
  const value = (zh as Record<string, string>)[key] ?? key
  return value.replace(/\{(\w+)\}/g, (_match: string, name: string) => String(params?.[name] ?? `{${name}}`))
}

const realGatewaySchema = {
  uid: 6,
  refs: {
    '0': { type: 'boolean', meta: {} },
    '1': { type: 'string', meta: {} },
    '2': { type: 'object', meta: { default: {} }, dict: { supportsDeveloperRole: 0, maxTokensField: 1 } },
    '3': { type: 'object', meta: { default: {} }, dict: { compat: 2 } },
    '4': { type: 'dict', meta: { default: {} }, inner: 3, sKey: 5 },
    '5': { type: 'string', meta: {} },
    '6': { type: 'object', meta: { default: {} }, dict: { providers: 4 } },
  },
} as const

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const namespace = (overrides: Partial<SettingsNamespace> = {}): SettingsNamespace => ({
  ns: 'llm-pi-ai',
  revision: 2,
  value: {
    providers: {
      provider: {
        models: [
          {
            id: 'model-a',
            name: 'Model A',
            reasoningEfforts: { off: null },
            input: ['text'],
            contextWindow: 8192,
          },
          {
            id: 'model-b',
            reasoningEfforts: { off: null, high: 'high' },
            input: ['text', 'image'],
          },
        ],
        modelOverrides: {
          'override-a': {
            name: 'Override A',
            reasoningEfforts: { off: null, low: 'low' },
            input: ['image'],
          },
        },
      },
    },
  },
  user: { subagentEffort: 'high' },
  ...overrides,
})

function localeSnapshot(locales: readonly string[] = ['zh', 'en', 'ja']): ClientLocale {
  return {
    register: () => () => undefined,
    bind: () => text,
    getSnapshot: () => ({ active: 'zh', locales: locales.map((id) => ({ id })) }),
    setLocale: vi.fn(),
  }
}

function renderEditor(options: {
  describe?: () => Promise<ClientResult<{ namespaces: readonly SettingsNamespace[] }>>
  mutate?: (ns: string, ops: readonly SettingsOp[], revision: number) => Promise<ClientResult<SettingsNamespace>>
  locales?: readonly string[]
  compatibilityProfile?: 'modern' | 'legacy' | 'unknown'
  takeoverResolution?: TakeoverRuntimeResolution
} = {}): {
  container: HTMLDivElement
  root: Root
  locale: ClientLocale
  mutate: ReturnType<typeof vi.fn>
  unmount: () => void
} {
  const container = document.createElement('div')
  document.body.append(container)
  const locale = localeSnapshot(options.locales)
  const mutate = vi.fn<SettingsApi['mutate']>(options.mutate ?? (async (_ns, _ops, _revision) => ({ ok: true as const, value: namespace() })))
  const settings: SettingsApi = {
    externalLanguages: false,
    compatibilityProfile: options.compatibilityProfile ?? 'unknown',
    describe: options.describe ?? (async () => ({ ok: true, value: { namespaces: [namespace()] } })),
    mutate,
  }
  const root = createRoot(container)
  const takeoverRuntime = options.takeoverResolution === undefined ? undefined : createTakeoverRuntimeStore()
  takeoverRuntime?.update(options.takeoverResolution!)
  act(() => {
    root.render(<SectionEditor settings={settings} locale={locale} t={text as Translation} takeoverRuntime={takeoverRuntime} />)
  })
  return {
    container,
    root,
    locale,
    mutate,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === label || candidate.textContent?.includes(label))
  expect(found).not.toBeUndefined()
  return found as HTMLButtonElement
}

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

function allSwitches(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll('button[role="switch"]')] as HTMLButtonElement[]
}

function modelSettingsButton(container: HTMLElement): HTMLButtonElement {
  return button(container, text('openModelSettings'))
}

function providerButton(container: HTMLElement): HTMLButtonElement {
  return button(container, text('expandProvider'))
}

function openFirstModel(container: HTMLElement): void {
  act(() => providerButton(container).click())
  act(() => modelSettingsButton(container).click())
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('SectionEditor user behavior', () => {
  it('renders provider gateway compatibility controls and emits only a view change', () => {
    const view = {
      provider: 'provider',
      supportsDeveloperRole: 'auto' as const,
      maxTokensField: 'max_tokens' as const,
      supportsDeveloperRoleAvailable: true,
      maxTokensFieldAvailable: true,
      supportsDeveloperRoleSource: 'unknown' as const,
       maxTokensFieldSource: 'unknown' as const,
       source: 'unknown' as const,
    }
    const onChange = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(<GatewayCompatControls view={view} onChange={onChange} />)
    })

    expect(container.textContent).toContain('Gateway compatibility')
    expect(container.textContent).toContain('Auto')
    const selects = [...container.querySelectorAll('select')] as HTMLSelectElement[]
    expect(selects).toHaveLength(2)
    expect(selects[0]?.value).toBe('auto')
    expect(selects[1]?.value).toBe('max_tokens')
    act(() => setValue(selects[0]!, 'unsupported'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ supportsDeveloperRole: 'unsupported' }))
    act(() => root.unmount())
    container.remove()
  })

  it('renders model compat controls with field sources and Auto inheritance', () => {
    const view = {
      provider: 'provider',
      model: 'model-b',
      supportsDeveloperRole: 'auto' as const,
      maxTokensField: 'max_tokens' as const,
      supportsDeveloperRoleSource: 'provider' as const,
      maxTokensFieldSource: 'model' as const,
      supportsDeveloperRoleAvailable: true,
      maxTokensFieldAvailable: true,
    }
    const onChange = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(<GatewayCompatControls scope="model" view={view} onChange={onChange} />)
    })

    expect(container.textContent).toContain('model-b')
    expect(container.textContent).toContain(en.compatSourceProvider)
    expect(container.textContent).toContain(en.compatSourceModel)
    const selects = [...container.querySelectorAll('select')] as HTMLSelectElement[]
    expect(selects).toHaveLength(2)
    act(() => setValue(selects[0]!, 'unsupported'))
    expect(onChange).toHaveBeenLastCalledWith({ supportsDeveloperRole: 'unsupported' })
    act(() => setValue(selects[1]!, 'auto'))
    expect(onChange).toHaveBeenLastCalledWith({ maxTokensField: 'auto' })
    act(() => root.unmount())
    container.remove()
  })

  it('renders model editor compat controls without changing base model controls', () => {
    const item: InventoryItem = {
      route: 'provider',
      model: 'model-b',
      name: 'Model B',
      levels: { off: null },
      contextWindow: 8192,
      input: ['text', 'image'],
      raw: { id: 'model-b' },
      index: 1,
      inOverrides: true,
    }
    const compatView = {
      provider: 'provider',
      model: 'model-b',
      supportsDeveloperRole: 'auto' as const,
      maxTokensField: 'max_tokens' as const,
      supportsDeveloperRoleSource: 'provider' as const,
      maxTokensFieldSource: 'model' as const,
      supportsDeveloperRoleAvailable: true,
      maxTokensFieldAvailable: true,
    }
    const onCompatChange = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(<ModelEditor item={item} draft={{ off: { on: true, wire: '' } }} contextDraft={{ value: '8192', oneMillion: false, previousValue: '8192', touched: false }} inputDraft={{ text: true, image: true, touched: false }} dirty={false} busy={false} palette={iosPalette()} t={text as Translation} onLevelChange={vi.fn()} onContextChange={vi.fn()} onOneMillionChange={vi.fn()} onInputChange={vi.fn()} onSave={vi.fn()} onRestoreReasoning={vi.fn()} onRestoreCapability={vi.fn()} compatView={compatView} onCompatChange={onCompatChange} onSaveCompat={vi.fn()} />)
    })

    expect(container.textContent).toContain('model-b')
    expect(container.textContent).toContain(text('reasoningLevels'))
    expect(container.querySelector(`input[aria-label="${text('contextLength')}"]`)).not.toBeNull()
    expect(container.textContent).toContain(text('textInput'))
    const selects = [...container.querySelectorAll('select')] as HTMLSelectElement[]
    expect(selects).toHaveLength(2)
    act(() => setValue(selects[0]!, 'unsupported'))
    expect(onCompatChange).toHaveBeenCalledWith({ supportsDeveloperRole: 'unsupported' })
    act(() => root.unmount())
    container.remove()
  })

  it('does not render saveable model compat controls for catalog models', () => {
    const item: InventoryItem = {
      route: 'provider',
      model: 'model-a',
      name: 'Model A',
      levels: { off: null },
      contextWindow: 8192,
      input: ['text'],
      raw: { id: 'model-a' },
      index: 0,
      inOverrides: false,
    }
    const compatView = {
      provider: 'provider',
      model: 'model-a',
      supportsDeveloperRole: 'auto' as const,
      maxTokensField: 'auto' as const,
      supportsDeveloperRoleSource: 'catalog' as const,
      maxTokensFieldSource: 'protocol' as const,
      supportsDeveloperRoleAvailable: true,
      maxTokensFieldAvailable: true,
    }
    const onCompatChange = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(<ModelEditor item={item} draft={{ off: { on: true, wire: '' } }} contextDraft={{ value: '8192', oneMillion: false, previousValue: '8192', touched: false }} inputDraft={{ text: true, image: false, touched: false }} dirty={false} busy={false} palette={iosPalette()} t={text as Translation} onLevelChange={vi.fn()} onContextChange={vi.fn()} onOneMillionChange={vi.fn()} onInputChange={vi.fn()} onSave={vi.fn()} onRestoreReasoning={vi.fn()} onRestoreCapability={vi.fn()} compatView={compatView} onCompatChange={onCompatChange} onSaveCompat={vi.fn()} />)
    })

    expect(container.querySelectorAll('select')).toHaveLength(0)
    expect(container.textContent).toContain(text('reasoningLevels'))
    expect(container.querySelector(`input[aria-label="${text('contextLength')}"]`)).not.toBeNull()
    act(() => root.unmount())
    container.remove()
  })

  it('hides unavailable provider fields without hiding the settings page', async () => {
    const view = renderEditor({
      describe: async () => ({
        ok: true,
        value: {
          namespaces: [namespace({
            value: { providers: { provider: { models: [{ id: 'model-a' }] } } },
            schema: {},
          })],
        },
      }),
    })
    await settle()
    expect(view.container.textContent).toContain(text('pageTitle'))
    expect(view.container.textContent).not.toContain(text('supportsDeveloperRole'))
    expect(view.container.textContent).not.toContain(text('maxTokensField'))
    view.unmount()
  })

  it('projects provider compat sources and saves field-level operations', async () => {
    const provider = {
      models: [{ id: 'model-a' }],
      compat: { supportsDeveloperRole: true, maxTokensField: 'max_completion_tokens' },
    }
    const projected = providerGatewayCompatViewFrom({
      value: { providers: { provider } },
      user: { providers: { provider: { compat: { supportsDeveloperRole: false } } } },
      base: { providers: { provider: { compat: { maxTokensField: 'max_tokens' } } } },
      schema: realGatewaySchema,
    }, 'provider', 'modern')
    expect(projected).toMatchObject({ supportsDeveloperRole: 'unsupported', maxTokensField: 'auto', source: 'user' })

    const view = renderEditor({
      compatibilityProfile: 'modern',
      describe: async () => ({ ok: true, value: { namespaces: [namespace({
        value: { providers: { provider } },
        user: { providers: { provider: { compat: { supportsDeveloperRole: false } } } },
        base: { providers: { provider: { compat: { maxTokensField: 'max_tokens' } } } },
        schema: realGatewaySchema,
      })] } }),
    })
    await settle()
    expect(view.container.textContent).toContain(text('gatewayCompatTitle'))
    const selects = [...view.container.querySelectorAll('select')].slice(2) as HTMLSelectElement[]
    expect(selects[0]?.value).toBe('unsupported')
    act(() => setValue(selects[1]!, 'max_completion_tokens'))
    act(() => button(view.container, text('saveGatewayCompat')).click())
    await settle()
    expect(view.mutate).toHaveBeenCalledWith('llm-pi-ai', [
      { op: 'set', path: ['providers', 'provider', 'compat', 'maxTokensField'], value: 'max_completion_tokens' },
    ], 2)
    view.unmount()
  })

  it('renders provider controls from the runtime takeover projection', async () => {
    const takeoverResolution: TakeoverRuntimeResolution = {
      providers: ['provider'],
      compat: [{
        provider: 'provider',
        model: 'model-a',
        thinkingFormat: { value: 'qwen', source: 'model' },
        supportsReasoningEffort: { value: true, source: 'model' },
        supportsDeveloperRole: { value: false, source: 'provider' },
        maxTokensField: { value: 'max_completion_tokens', source: 'provider' },
      }],
    }
    const view = renderEditor({
      compatibilityProfile: 'modern',
      takeoverResolution,
      describe: async () => ({ ok: true, value: { namespaces: [namespace({
        value: { providers: { provider: { models: [{ id: 'model-a' }] } } },
        schema: realGatewaySchema,
      })] } }),
    })
    await settle()

    const selects = [...view.container.querySelectorAll('select')].slice(2) as HTMLSelectElement[]
    expect(selects[0]?.value).toBe('auto')
    expect(selects[1]?.value).toBe('auto')
    view.unmount()
  })

  it('shows loading first and then reports a describe failure', async () => {
    let resolveDescribe!: (value: ClientResult<{ namespaces: readonly SettingsNamespace[] }>) => void
    const describe = vi.fn(() => new Promise<ClientResult<{ namespaces: readonly SettingsNamespace[] }>>((resolve) => {
      resolveDescribe = resolve
    }))
    const view = renderEditor({ describe })
    expect(view.container.textContent).toContain(text('loading'))

    await act(async () => {
      resolveDescribe({ ok: false, error: { message: 'offline' } })
      await Promise.resolve()
    })
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('offline')
    view.unmount()
  })

  it('shows the provider default when the namespace exists without an effort', async () => {
    const view = renderEditor({
      describe: async () => ({ ok: true, value: { namespaces: [namespace({ user: { subagentEffort: null } })] } }),
    })
    await settle()
    expect(view.container.textContent).toContain(text('currentDefault', { effort: text('providerDefault') }))
    expect(view.container.textContent).not.toContain(text('unconfiguredSubagent'))
    view.unmount()
  })

  it('filters models by search and expands the matching provider and model', async () => {
    const view = renderEditor()
    await settle()
    const search = view.container.querySelector(`input[placeholder="${text('searchPlaceholder')}"]`) as HTMLInputElement
    act(() => {
      setValue(search, 'override')
    })
    expect(view.container.textContent).toContain('override-a')
    expect(view.container.textContent).not.toContain('Model A')
    expect(view.container.querySelector(`button[aria-label="${text('expandProvider')}"]`)).toBeNull()
    expect(view.container.querySelector(`button[aria-label="${text('openModelSettings')}"]`)).not.toBeNull()
    act(() => modelSettingsButton(view.container).click())
    expect(view.container.textContent).toContain(text('reasoningLevels'))
    view.unmount()
  })

  it('updates an effort wire value, context mode, and input modalities before saving', async () => {
    const saved = namespace({ revision: 3 })
    const view = renderEditor({
      mutate: async (_ns, _ops, _revision) => ({ ok: true as const, value: saved }),
    })
    await settle()
    openFirstModel(view.container)

    const minimal = button(view.container, `${text('levelMinimal')}${text('levelSuffix')}`)
    act(() => minimal.click())
    const wire = view.container.querySelector('input[placeholder="' + text('wirePlaceholder') + '"]') as HTMLInputElement
    expect(wire.value).toBe('minimal')
    act(() => {
      setValue(wire, 'ultra')
    })

    const context = view.container.querySelector(`input[aria-label="${text('contextLength')}"]`) as HTMLInputElement
    act(() => {
      setValue(context, '64000')
    })
    const million = allSwitches(view.container).find((candidate) => candidate.getAttribute('aria-label') === text('oneMillionMode'))
    expect(million).toBeDefined()
    act(() => million!.click())
    expect(context.value).toBe('1000000')

    const textSwitch = allSwitches(view.container).find((candidate) => candidate.getAttribute('aria-label') === text('textInput'))
    const imageSwitch = allSwitches(view.container).find((candidate) => candidate.getAttribute('aria-label') === text('imageInput'))
    expect(textSwitch?.getAttribute('aria-checked')).toBe('true')
    act(() => imageSwitch!.click())
    act(() => textSwitch!.click())
    expect(textSwitch?.getAttribute('aria-checked')).toBe('false')

    act(() => button(view.container, text('saveModelChanges')).click())
    await settle()
    expect(view.mutate).toHaveBeenCalledWith('llm-pi-ai', expect.arrayContaining([
      expect.objectContaining({ path: ['providers', 'provider', 'models'] }),
    ]), 2)
    const ops = view.mutate.mock.calls[0][1] as SettingsOp[]
    const model = (ops[0].value as Array<Record<string, unknown>>)[0]
    expect(model.reasoningEfforts).toEqual({ off: null, minimal: 'ultra' })
    expect(model.contextWindow).toBe(1000000)
    expect(model.input).toEqual(['image'])
    expect(view.container.textContent).toContain(text('modelSettingsSaved'))
    view.unmount()
  })

  it('saves the selected subagent effort and writes the configured namespace key', async () => {
    const view = renderEditor()
    await settle()
    const select = view.container.querySelectorAll('select')[1] as HTMLSelectElement
    expect(select.value).toBe('high')
    act(() => {
      setValue(select, 'custom')
    })
    const custom = view.container.querySelector(`input[placeholder="${text('customPlaceholder')}"]`) as HTMLInputElement
    act(() => {
      setValue(custom, 'deep')
    })
    act(() => button(view.container, text('apply')).click())
    await settle()
    expect(view.mutate).toHaveBeenCalledWith('llm-pi-ai', [{ op: 'set', path: ['subagentEffort'], value: 'deep' }], 2)
    expect(view.container.textContent).toContain(text('subagentSaved'))
    view.unmount()
  })

  it('keeps the draft and shows a write failure after a rejected save', async () => {
    const view = renderEditor({
      mutate: async () => ({ ok: false, error: { message: 'conflict' } }),
    })
    await settle()
    openFirstModel(view.container)
    act(() => button(view.container, `${text('levelMinimal')}${text('levelSuffix')}`).click())
    expect((view.container.querySelector('input[placeholder="' + text('wirePlaceholder') + '"]') as HTMLInputElement).value).toBe('minimal')
    act(() => button(view.container, text('saveModelChanges')).click())
    await settle()
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('conflict')
    expect(view.container.querySelector('input[placeholder="' + text('wirePlaceholder') + '"]')).not.toBeNull()
    expect(view.container.textContent).toContain(text('unsaved'))
    view.unmount()
  })

  it('applies presets, restores defaults, preserves drafts across collapse, and filters locales', async () => {
    const view = renderEditor({ locales: ['zh', 'en'] })
    await settle()
    const language = view.container.querySelector('select') as HTMLSelectElement
    expect([...language.options].map((option) => option.value)).toEqual(['zh', 'en'])
    expect(view.container.textContent).toContain(`v${packageManifest.version}`)

    act(() => button(view.container, text('quickSettings')).click())
    act(() => button(view.container, text('presetOfficial')).click())
    await settle()
    expect(view.mutate).toHaveBeenCalled()

    openFirstModel(view.container)
    act(() => button(view.container, `${text('levelMinimal')}${text('levelSuffix')}`).click())
    act(() => button(view.container, text('closeModelSettings')).click())
    act(() => modelSettingsButton(view.container).click())
    expect(view.container.querySelector('input[placeholder="' + text('wirePlaceholder') + '"]')).not.toBeNull()
    act(() => button(view.container, text('restoreReasoning')).click())
    await settle()
    expect(view.container.textContent).toContain(text('restoreReasoning'))
    view.unmount()
  })
})
