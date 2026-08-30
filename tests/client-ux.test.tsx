// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SectionEditor } from '../src/client/SectionEditor.js'
import { zh } from '../src/client/locales.js'
import type {
  ClientLocale,
  ClientResult,
  InventoryItem,
  SettingsApi,
  SettingsNamespace,
  SettingsOp,
  Translation,
} from '../src/client/types.js'

const text = (key: string, params?: Record<string, unknown>): string => {
  const value = zh[key] ?? key
  return value.replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name] ?? `{${name}}`))
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

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
    getSnapshot: () => ({ active: 'zh', locales: locales.map((id) => ({ id })) }),
    setLocale: vi.fn(),
  }
}

function renderEditor(options: {
  describe?: () => Promise<ClientResult<{ namespaces: readonly SettingsNamespace[] }>>
  mutate?: (ns: string, ops: readonly SettingsOp[], revision: number) => Promise<ClientResult<SettingsNamespace>>
  locales?: readonly string[]
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
  const mutate = vi.fn(options.mutate ?? (async (_ns, _ops, _revision) => ({ ok: true, value: namespace() })))
  const settings: SettingsApi = {
    describe: options.describe ?? (async () => ({ ok: true, value: { namespaces: [namespace()] } })),
    mutate,
  }
  const root = createRoot(container)
  act(() => {
    root.render(<SectionEditor settings={settings} locale={locale} t={text as Translation} />)
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
      mutate: vi.fn(async (_ns, _ops, _revision) => ({ ok: true, value: saved })),
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
    expect(view.container.textContent).toContain('v0.1.10')

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
