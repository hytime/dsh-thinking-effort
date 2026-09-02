// @vitest-environment jsdom
import React, { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SectionEditor } from '../src/client/SectionEditor.js'
import { createTakeoverRuntimeStore, type TakeoverRuntimeResolution } from '../src/client/takeover-runtime.js'
import { GatewayCompatControls, renderGatewayCompatControls } from '../src/client/components/GatewayCompatControls.js'
import { ModelEditor } from '../src/client/components/ModelEditor.js'
import { inventoryFrom, modelGatewayCompatViewFrom, providerGatewayCompatViewFrom } from '../src/client/model-inventory.js'
import { en, ja, ko, zh } from '../src/client/locales.js'
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
    expect([...selects[0]!.options].map((option) => option.value)).toContain('auto')
    expect([...selects[1]!.options].map((option) => option.value)).toContain('auto')
    expect(container.textContent).toContain(en.gatewayCompatAuto)
    act(() => setValue(selects[0]!, 'unsupported'))
    expect(onChange).toHaveBeenLastCalledWith({ supportsDeveloperRole: 'unsupported' })
    act(() => setValue(selects[1]!, 'auto'))
    expect(onChange).toHaveBeenLastCalledWith({ maxTokensField: 'auto' })
    act(() => root.unmount())
    container.remove()
  })

  it('renders a distinct base source label instead of the protocol source label', () => {
    const view = {
      provider: 'provider',
      model: 'model-b',
      supportsDeveloperRole: 'auto' as const,
      maxTokensField: 'auto' as const,
      supportsDeveloperRoleSource: 'base' as const,
      maxTokensFieldSource: 'unknown' as const,
      supportsDeveloperRoleAvailable: true,
      maxTokensFieldAvailable: true,
    }
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(<GatewayCompatControls scope="model" view={view} onChange={vi.fn()} />)
    })

    expect(container.textContent).toContain(en.compatSourceBase)
    expect(container.textContent).not.toContain(en.compatSourceProtocol)
    act(() => root.unmount())
    container.remove()
  })

  it('keeps the other model compat field editable when one field is unavailable', () => {
    const view = {
      provider: 'provider',
      model: 'model-b',
      supportsDeveloperRole: 'auto' as const,
      maxTokensField: 'max_tokens' as const,
      supportsDeveloperRoleSource: 'unknown' as const,
      maxTokensFieldSource: 'model' as const,
      supportsDeveloperRoleAvailable: false,
      maxTokensFieldAvailable: true,
    }
    const onChange = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(<GatewayCompatControls scope="model" view={view} onChange={onChange} />)
    })

    const selects = [...container.querySelectorAll('select')] as HTMLSelectElement[]
    expect(selects).toHaveLength(1)
    expect(selects[0]?.getAttribute('aria-label')).toBe(en.maxTokensField)
    act(() => setValue(selects[0]!, 'max_completion_tokens'))
    expect(onChange).toHaveBeenCalledWith({ maxTokensField: 'max_completion_tokens' })
    act(() => root.unmount())
    container.remove()
  })

  it('renders model compatibility copy from every locale without key fallbacks', () => {
    const locales: readonly [string, Record<string, string>][] = [['en', en], ['zh', zh], ['ja', ja], ['ko', ko]]
    const keys = ['modelGatewayCompatTitle', 'compatSourceBase', 'compatSourceModel', 'compatSourceProvider', 'compatSourceCatalog', 'compatSourceProtocol', 'compatSourceUnknown', 'inheritProviderCompat', 'saveModelGatewayCompat', 'modelGatewayCompatSaved']
    const view = {
      provider: 'provider',
      model: 'model-b',
      supportsDeveloperRole: 'auto' as const,
      maxTokensField: 'max_tokens' as const,
      supportsDeveloperRoleSource: 'base' as const,
      maxTokensFieldSource: 'unknown' as const,
      supportsDeveloperRoleAvailable: true,
      maxTokensFieldAvailable: true,
    }
    for (const [locale, dictionary] of locales) {
      for (const key of keys) {
        expect(dictionary[key], `${locale} missing ${key}`).toBeTruthy()
        expect(dictionary[key], `${locale} fell back to ${key}`).not.toBe(key)
      }
      const container = document.createElement('div')
      document.body.append(container)
      const root = createRoot(container)
      act(() => {
        root.render(renderGatewayCompatControls({ scope: 'model', view, onChange: vi.fn() }, { palette: iosPalette(), t: (key) => dictionary[key] ?? key }))
      })
      expect(container.textContent).toContain(dictionary.modelGatewayCompatTitle)
      expect(container.textContent).toContain(dictionary.compatSourceBase)
      expect(container.textContent).toContain(dictionary.inheritProviderCompat)
      expect(container.textContent).not.toContain('compatSourceBase')
      act(() => root.unmount())
      container.remove()
    }
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
    const onSaveCompat = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(<ModelEditor item={item} draft={{ off: { on: true, wire: '' } }} contextDraft={{ value: '8192', oneMillion: false, previousValue: '8192', touched: false }} inputDraft={{ text: true, image: true, touched: false }} dirty={false} busy={false} palette={iosPalette()} t={text as Translation} onLevelChange={vi.fn()} onContextChange={vi.fn()} onOneMillionChange={vi.fn()} onInputChange={vi.fn()} onSave={vi.fn()} onRestoreReasoning={vi.fn()} onRestoreCapability={vi.fn()} compatView={compatView} onCompatChange={onCompatChange} onSaveCompat={onSaveCompat} />)
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
    const onSaveCompat = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(<ModelEditor item={item} draft={{ off: { on: true, wire: '' } }} contextDraft={{ value: '8192', oneMillion: false, previousValue: '8192', touched: false }} inputDraft={{ text: true, image: false, touched: false }} dirty={false} busy={false} palette={iosPalette()} t={text as Translation} onLevelChange={vi.fn()} onContextChange={vi.fn()} onOneMillionChange={vi.fn()} onInputChange={vi.fn()} onSave={vi.fn()} onRestoreReasoning={vi.fn()} onRestoreCapability={vi.fn()} compatView={compatView} onCompatChange={onCompatChange} onSaveCompat={onSaveCompat} />)
    })

    expect(container.querySelectorAll('select')).toHaveLength(0)
    expect(container.textContent).not.toContain(text('saveModelGatewayCompat'))
    expect([...container.querySelectorAll('button')].some((candidate) => candidate.textContent?.includes(text('saveModelGatewayCompat')))).toBe(false)
    expect(onSaveCompat).not.toHaveBeenCalled()
    expect(container.textContent).toContain(text('reasoningLevels'))
    expect(container.querySelector(`input[aria-label="${text('contextLength')}"]`)).not.toBeNull()
    act(() => root.unmount())
    container.remove()
  })

  it('hides model compat save controls when all model fields are unavailable', () => {
    const item: InventoryItem = {
      route: 'provider',
      model: 'legacy-model',
      name: 'Legacy Model',
      levels: { off: null },
      input: ['text'],
      raw: { id: 'legacy-model' },
      index: -1,
      inOverrides: true,
    }
    const compatView = {
      provider: 'provider',
      model: 'legacy-model',
      supportsDeveloperRole: 'auto' as const,
      maxTokensField: 'auto' as const,
      supportsDeveloperRoleSource: 'unknown' as const,
      maxTokensFieldSource: 'unknown' as const,
      supportsDeveloperRoleAvailable: false,
      maxTokensFieldAvailable: false,
    }
    const onSaveCompat = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(<ModelEditor item={item} draft={{ off: { on: true, wire: '' } }} contextDraft={{ value: '', oneMillion: false, previousValue: '', touched: false }} inputDraft={{ text: true, image: false, touched: false }} dirty={false} busy={false} palette={iosPalette()} t={text as Translation} onLevelChange={vi.fn()} onContextChange={vi.fn()} onOneMillionChange={vi.fn()} onInputChange={vi.fn()} onSave={vi.fn()} onRestoreReasoning={vi.fn()} onRestoreCapability={vi.fn()} compatView={compatView} onSaveCompat={onSaveCompat} compatDirty />)
    })

    expect(container.querySelector('[data-scope="model"]')).toBeNull()
    expect(container.textContent).not.toContain(text('saveModelGatewayCompat'))
    expect(onSaveCompat).not.toHaveBeenCalled()
    expect(container.textContent).toContain(text('reasoningLevels'))
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

  it('refreshes provider defaults without replacing dirty model compat drafts', async () => {
    const initial = namespace({
      value: {
        providers: {
          provider: {
            modelOverrides: {
              'model-a': { id: 'model-a', input: ['text'] },
              'model-b': { id: 'model-b', input: ['text'] },
            },
          },
        },
      },
      user: { providers: { provider: { compat: { supportsDeveloperRole: false } } } },
      base: { providers: { provider: { compat: { maxTokensField: 'max_completion_tokens' } } } },
      schema: realGatewaySchema,
    })
    const refreshed = namespace({
      revision: 8,
      value: initial.value,
      user: { providers: { provider: { compat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' } } } },
      base: initial.base,
      schema: realGatewaySchema,
    })
    const initialModelA = inventoryFrom(initial).find((item) => item.model === 'model-a')
    const refreshedModelB = inventoryFrom(refreshed).find((item) => item.model === 'model-b')
    expect(initialModelA).toBeDefined()
    expect(refreshedModelB).toBeDefined()
    expect(modelGatewayCompatViewFrom(initial, initialModelA!, 'modern')).toMatchObject({
      maxTokensField: 'auto',
      maxTokensFieldResolved: 'max_completion_tokens',
      maxTokensFieldSource: 'base',
    })

    const view = renderEditor({
      compatibilityProfile: 'modern',
      describe: async () => ({ ok: true, value: { namespaces: [initial] } }),
      mutate: async (_ns, ops, revision) => {
        expect(revision).toBe(2)
        expect(ops).toEqual([{ op: 'set', path: ['providers', 'provider', 'compat', 'maxTokensField'], value: 'max_tokens' }])
        expect(ops.some((op) => op.path.includes('modelOverrides'))).toBe(false)
        return { ok: true as const, value: refreshed }
      },
    })
    await settle()
    act(() => providerButton(view.container).click())
    const modelButtons = [...view.container.querySelectorAll<HTMLButtonElement>(`button[aria-label="${text('openModelSettings')}"]`)]
    const modelAButton = modelButtons.find((candidate) => candidate.parentElement?.parentElement?.parentElement?.textContent?.includes('model-a'))
    expect(modelAButton).toBeDefined()
    act(() => modelAButton!.click())
    const dirtyModel = view.container.querySelector('[data-scope="model"]')
    expect(dirtyModel?.textContent).toContain(text('compatSourceBase'))
    const modelAMaxTokens = dirtyModel?.querySelector(`select[aria-label="${text('maxTokensField')}"]`) as HTMLSelectElement
    act(() => setValue(modelAMaxTokens, 'max_completion_tokens'))

    const providerMaxTokens = view.container.querySelector(`[data-scope="provider"] select[aria-label="${text('maxTokensField')}"]`) as HTMLSelectElement
    act(() => setValue(providerMaxTokens, 'max_tokens'))
    act(() => button(view.container, text('saveGatewayCompat')).click())
    await settle()

    expect((view.container.querySelector(`[data-scope="provider"] select[aria-label="${text('maxTokensField')}"]`) as HTMLSelectElement).value).toBe('max_tokens')
    const refreshedDirtyModel = view.container.querySelector('[data-scope="model"]')
    expect((refreshedDirtyModel?.querySelector(`select[aria-label="${text('maxTokensField')}"]`) as HTMLSelectElement).value).toBe('max_completion_tokens')
    expect(refreshedDirtyModel?.textContent).toContain(text('compatSourceProvider'))
    expect(refreshedDirtyModel?.textContent).not.toContain(text('compatSourceBase'))

    expect(modelGatewayCompatViewFrom(refreshed, refreshedModelB!, 'modern')).toMatchObject({
      maxTokensField: 'auto',
      maxTokensFieldResolved: 'max_tokens',
      maxTokensFieldSource: 'provider',
    })
    const modelBButton = [...view.container.querySelectorAll<HTMLButtonElement>(`button[aria-label="${text('openModelSettings')}"]`)]
      .find((candidate) => candidate.parentElement?.parentElement?.parentElement?.textContent?.includes('model-b'))
    expect(modelBButton).toBeDefined()
    act(() => modelBButton!.click())
    const cleanModel = view.container.querySelectorAll('[data-scope="model"]')[1]
    expect((cleanModel?.querySelector(`select[aria-label="${text('maxTokensField')}"]`) as HTMLSelectElement).value).toBe('auto')
    expect(cleanModel?.textContent).toContain(text('compatSourceProvider'))
    expect(cleanModel?.textContent).not.toContain(text('compatSourceBase'))
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

  it('saves model override compat changes and clears them back to provider inheritance', async () => {
    const modelNamespace = namespace({
      value: {
        providers: {
          provider: {
            modelOverrides: {
              'model-a': { id: 'model-a', name: 'Model A', input: ['text'] },
              'model-b': { id: 'model-b', name: 'Model B', input: ['text'] },
            },
          },
        },
      },
      user: {
        providers: {
          provider: {
            compat: { supportsDeveloperRole: false },
            modelOverrides: {
              'model-b': { compat: { maxTokensField: 'max_completion_tokens' } },
            },
          },
        },
      },
      schema: realGatewaySchema,
    })
    const savedNamespace = namespace({
      revision: 7,
      value: modelNamespace.value,
      user: {
        providers: {
          provider: {
            compat: { supportsDeveloperRole: false },
            modelOverrides: {
              'model-b': { compat: { maxTokensField: 'max_tokens' } },
            },
          },
        },
      },
      schema: realGatewaySchema,
    })
    let mutationCount = 0
    const view = renderEditor({
      compatibilityProfile: 'modern',
      describe: async () => ({ ok: true, value: { namespaces: [modelNamespace] } }),
      mutate: async () => ({ ok: true as const, value: mutationCount++ === 0 ? savedNamespace : modelNamespace }),
    })
    await settle()

    act(() => providerButton(view.container).click())
    const modelBButton = [...view.container.querySelectorAll<HTMLButtonElement>(`button[aria-label="${text('openModelSettings')}"]`)]
      .find((candidate) => candidate.parentElement?.parentElement?.parentElement?.textContent?.includes('model-b'))
    expect(modelBButton).toBeDefined()
    act(() => modelBButton!.click())

    const maxTokens = view.container.querySelector(`[data-scope="model"] select[aria-label="${text('maxTokensField')}"]`) as HTMLSelectElement
    expect(maxTokens).not.toBeNull()
    expect(maxTokens.value).toBe('max_completion_tokens')
    act(() => setValue(maxTokens, 'max_tokens'))
    act(() => button(view.container, text('saveModelGatewayCompat')).click())
    await settle()

    expect(view.mutate).toHaveBeenNthCalledWith(1, 'llm-pi-ai', [{
      op: 'set',
      path: ['providers', 'provider', 'modelOverrides', 'model-b', 'compat', 'maxTokensField'],
      value: 'max_tokens',
    }], 2)

    const refreshedMaxTokens = view.container.querySelector(`[data-scope="model"] select[aria-label="${text('maxTokensField')}"]`) as HTMLSelectElement
    act(() => setValue(refreshedMaxTokens, 'auto'))
    act(() => button(view.container, text('saveModelGatewayCompat')).click())
    await settle()

    expect(view.mutate).toHaveBeenNthCalledWith(2, 'llm-pi-ai', [{
      op: 'unset',
      path: ['providers', 'provider', 'modelOverrides', 'model-b', 'compat', 'maxTokensField'],
    }], 7)
    view.unmount()
  })

  it('keeps the model compat draft after a stale revision conflict', async () => {
    const modelNamespace = namespace({
      value: { providers: { provider: { modelOverrides: { 'model-b': { id: 'model-b', input: ['text'] } } } } },
      user: { providers: { provider: { modelOverrides: { 'model-b': { compat: { maxTokensField: 'max_completion_tokens' } } } } } },
      schema: realGatewaySchema,
    })
    const view = renderEditor({
      compatibilityProfile: 'modern',
      describe: async () => ({ ok: true, value: { namespaces: [modelNamespace] } }),
      mutate: async () => ({ ok: false, error: { message: 'stale revision' } }),
    })
    await settle()
    act(() => providerButton(view.container).click())
    const modelBButton = [...view.container.querySelectorAll<HTMLButtonElement>(`button[aria-label="${text('openModelSettings')}"]`)]
      .find((candidate) => candidate.parentElement?.parentElement?.parentElement?.textContent?.includes('model-b'))
    expect(modelBButton).toBeDefined()
    act(() => modelBButton!.click())
    const maxTokens = view.container.querySelector(`[data-scope="model"] select[aria-label="${text('maxTokensField')}"]`) as HTMLSelectElement
    act(() => setValue(maxTokens, 'max_tokens'))
    act(() => button(view.container, text('saveModelGatewayCompat')).click())
    await settle()

    expect(view.mutate).toHaveBeenCalledWith('llm-pi-ai', [{
      op: 'set',
      path: ['providers', 'provider', 'modelOverrides', 'model-b', 'compat', 'maxTokensField'],
      value: 'max_tokens',
    }], 2)
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('stale revision')
    expect((view.container.querySelector(`[data-scope="model"] select[aria-label="${text('maxTokensField')}"]`) as HTMLSelectElement).value).toBe('max_tokens')
    expect(view.container.textContent).toContain(text('unsaved'))
    view.unmount()
  })

  it('does not offer saveable model compat controls for models array entries', async () => {
    const modelNamespace = namespace({
      value: {
        providers: {
          provider: {
            models: [{ id: 'model-a', name: 'Model A', compat: { maxTokensField: 'max_completion_tokens' } }],
          },
        },
      },
      schema: realGatewaySchema,
    })
    const view = renderEditor({
      compatibilityProfile: 'modern',
      describe: async () => ({ ok: true, value: { namespaces: [modelNamespace] } }),
      mutate: async () => ({ ok: true, value: modelNamespace }),
    })
    await settle()

    act(() => providerButton(view.container).click())
    act(() => modelSettingsButton(view.container).click())
    expect(view.container.querySelector('[data-scope="model"]')).toBeNull()
    expect(view.container.textContent).not.toContain(text('saveModelGatewayCompat'))
    expect(view.mutate).not.toHaveBeenCalled()
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
