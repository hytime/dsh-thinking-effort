// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Slider } from '../src/client/thinking-slider/slider.js'

const dictionary: Record<string, string> = {
  seatModelLoading: '加载模型…',
  seatNoModel: '未选择模型',
  seatNoEfforts: '当前模型未提供推理档位',
  seatError: '模型目录加载失败：{message}',
  seatFollowDefault: '跟随模型默认',
  seatSliderLabel: '推理档位',
  seatReasoningLabel: '推理等级',
  seatModelLabel: '模型',
  seatErrorAction: '模型操作失败：{message}',
}

const t = (key: string, params?: Record<string, unknown>): string => {
  const value = dictionary[key] ?? `{{${key}}}`
  return value.replace(/\{(\w+)\}/g, (_match: string, name: string) => String(params?.[name] ?? `{${name}}`))
}

function setRangeValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(input: HTMLSelectElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const reasoning = {
  efforts: [
    { id: 'off', name: 'Off' },
    { id: 'high', name: 'High' },
    { id: 'max', name: 'Max', description: 'Largest budget' },
  ],
  defaultEffort: 'high',
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    routable: true,
    groups: [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [{
        id: 'deepseek-v4-flash',
        name: 'DeepSeek-V4-Flash',
        description: 'Fast catalog description',
        reasoning,
      }],
    }],
    failures: [],
    status: 'ready',
    error: null,
    ...overrides,
  }
}

function renderSeat(props: Record<string, unknown>) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(Slider, props))
  })
  return { container, root }
}

function openPanel(container: HTMLDivElement): void {
  const trigger = container.querySelector('[data-seat-trigger]') as HTMLButtonElement
  expect(trigger).not.toBeNull()
  act(() => { trigger.click() })
  expect(container.querySelector('[data-seat-panel]')).not.toBeNull()
}

function dispose(root: ReturnType<typeof createRoot>, container: HTMLDivElement): void {
  act(() => root.unmount())
  container.remove()
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('thinking slider composer seat', () => {
  it('starts as a compact chip and opens reasoning controls above the model selector', () => {
    const directory = createSnapshotStore(state())
    const { container, root } = renderSeat({ directory, t })

    expect(container.querySelector('[data-seat-panel]')).toBeNull()
    expect(container.querySelector('[data-seat-trigger]')?.textContent).toContain('DeepSeek-V4-Flash')
    expect(container.querySelector('[data-seat-trigger]')?.textContent).toContain('High')

    openPanel(container)
    const reasoningHeader = container.querySelector('[data-seat-reasoning]')
    const range = container.querySelector('[data-seat-input]')
    const modelSelect = container.querySelector('[data-seat-model-select]')
    expect(reasoningHeader).not.toBeNull()
    expect(range).not.toBeNull()
    expect(modelSelect).not.toBeNull()
    expect(reasoningHeader?.compareDocumentPosition(range as Node) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(range?.compareDocumentPosition(modelSelect as Node) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)

    dispose(root, container)
  })

  it('renders only the efforts the current model is configured with after opening', () => {
    const directory = createSnapshotStore(state())
    const { container, root } = renderSeat({ directory, t })

    openPanel(container)
    expect(container.textContent).toContain('DeepSeek-V4-Flash')
    expect(container.textContent).toContain('Off')
    expect(container.textContent).toContain('High')
    expect(container.textContent).toContain('Max')
    expect(container.textContent).not.toContain('minimal')
    expect(container.textContent).not.toContain('low')

    dispose(root, container)
  })

  it('shows the empty efforts state when the current model provides none', () => {
    const directory = createSnapshotStore(state({
      groups: [{
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash' }],
      }],
    }))
    const { container, root } = renderSeat({ directory, t })

    openPanel(container)
    expect(container.textContent).toContain('当前模型未提供推理档位')
    expect(container.textContent).not.toContain('Off')

    dispose(root, container)
  })

  it('handles a null current selection and the loading status', () => {
    const directory = createSnapshotStore(state({ current: null, status: 'loading' }))
    const { container, root } = renderSeat({ directory, t })

    expect(container.textContent).toContain('加载模型…')
    openPanel(container)
    expect(container.textContent).toContain('当前模型未提供推理档位')

    dispose(root, container)
  })

  it('surfaces the directory error under the error status', () => {
    const directory = createSnapshotStore(state({
      current: null,
      groups: [],
      status: 'error',
      error: 'catalog unreachable',
    }))
    const { container, root } = renderSeat({ directory, t })

    openPanel(container)
    expect(container.textContent).toContain('模型目录加载失败：catalog unreachable')

    dispose(root, container)
  })

  it('submits a range change as a session selection with the matching reasoning effort', () => {
    const select = vi.fn().mockResolvedValue(true)
    const directory = createSnapshotStore(state())
    const { container, root } = renderSeat({ directory, select, t })

    openPanel(container)
    const input = container.querySelector('[data-seat-input]') as HTMLInputElement
    act(() => { setRangeValue(input, '2') })

    expect(select).toHaveBeenCalledWith({ provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'max' })
    dispose(root, container)
  })

  it('announces the current effective effort level through aria-valuetext', () => {
    const directory = createSnapshotStore(state())
    const { container, root } = renderSeat({ directory, t })

    openPanel(container)
    expect((container.querySelector('[data-seat-input]') as HTMLInputElement).getAttribute('aria-valuetext')).toBe('High')

    dispose(root, container)
  })

  it('submits a selected model with that model default effort', () => {
    const select = vi.fn().mockResolvedValue(true)
    const directory = createSnapshotStore(state({
      groups: [{
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [
          { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', reasoning },
          {
            id: 'deepseek-v4-reasoner',
            name: 'DeepSeek-V4-Reasoner',
            reasoning: { efforts: reasoning.efforts, defaultEffort: 'max' },
          },
        ],
      }],
    }))
    const { container, root } = renderSeat({ directory, select, t })

    openPanel(container)
    const input = container.querySelector('[data-seat-model-select]') as HTMLSelectElement
    const target = [...input.options].find(option => option.textContent === 'DeepSeek-V4-Reasoner')
    expect(target).toBeDefined()
    act(() => { setSelectValue(input, target?.value ?? '') })

    expect(select).toHaveBeenCalledWith({
      provider: 'deepseek-official',
      model: 'deepseek-v4-reasoner',
      reasoningEffort: 'max',
    })
    dispose(root, container)
  })

  it('retains an explicit current effort when selecting the same model', () => {
    const select = vi.fn().mockResolvedValue(true)
    const directory = createSnapshotStore(state({
      current: { provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'off' },
    }))
    const { container, root } = renderSeat({ directory, select, t })

    openPanel(container)
    const input = container.querySelector('[data-seat-model-select]') as HTMLSelectElement
    act(() => { setSelectValue(input, input.value) })

    expect(select).toHaveBeenCalledWith({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
      reasoningEffort: 'off',
    })
    dispose(root, container)
  })

  it('represents a model-default selection without marking the first effort active', () => {
    const select = vi.fn().mockResolvedValue(true)
    const directory = createSnapshotStore(state({
      groups: [{
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [{
          id: 'deepseek-v4-flash',
          name: 'DeepSeek-V4-Flash',
          reasoning: { efforts: reasoning.efforts },
        }],
      }],
    }))
    const { container, root } = renderSeat({ directory, select, t })

    expect(container.querySelector('[data-seat-trigger]')?.textContent).toContain('跟随模型默认')
    openPanel(container)
    const range = container.querySelector('[data-seat-input]') as HTMLInputElement
    expect(container.querySelector('[data-seat-reasoning]')?.textContent).toContain('跟随模型默认')
    expect(range.getAttribute('aria-valuetext')).toBe('跟随模型默认')
    expect(range.getAttribute('data-seat-unset')).toBe('true')
    expect(container.querySelector('[data-seat-active]')).toBeNull()
    const followDefault = container.querySelector('[data-seat-default]') as HTMLButtonElement
    expect(followDefault.getAttribute('aria-pressed')).toBe('true')

    act(() => { followDefault.click() })
    expect(select).toHaveBeenCalledWith({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    expect(select.mock.calls[0]?.[0]).not.toHaveProperty('reasoningEffort')
    dispose(root, container)
  })

  it('hides follow-model-default when the model declares a default effort', () => {
    const directory = createSnapshotStore(state())
    const { container, root } = renderSeat({ directory, t })

    openPanel(container)
    expect(container.querySelector('[data-seat-default]')).toBeNull()
    dispose(root, container)
  })

  it('closes the panel on outside mousedown and returns focus to the compact chip on Escape', async () => {
    const directory = createSnapshotStore(state())
    const { container, root } = renderSeat({ directory, t })

    openPanel(container)
    const outside = document.createElement('button')
    document.body.append(outside)
    act(() => { outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(container.querySelector('[data-seat-panel]')).toBeNull()
    outside.remove()

    openPanel(container)
    const panel = container.querySelector('[data-seat-panel]') as HTMLDivElement
    act(() => { panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(container.querySelector('[data-seat-panel]')).toBeNull()
    await Promise.resolve()
    expect(document.activeElement).toBe(container.querySelector('[data-seat-trigger]'))

    dispose(root, container)
  })

  it('swallows a rejected selection promise after a range change', async () => {
    const select = vi.fn().mockRejectedValue(new Error('selection rejected'))
    const directory = createSnapshotStore(state())
    const { container, root } = renderSeat({ directory, select, t })

    openPanel(container)
    act(() => { setRangeValue(container.querySelector('[data-seat-input]') as HTMLInputElement, '2') })
    await Promise.resolve()
    expect(select).toHaveBeenCalledTimes(1)
    dispose(root, container)
  })

  it('surfaces a failed selection through the directory error action copy', () => {
    const select = vi.fn().mockResolvedValue(false)
    const directory = createSnapshotStore(state({ status: 'selecting' }))
    const { container, root } = renderSeat({ directory, select, t })

    openPanel(container)
    act(() => { setRangeValue(container.querySelector('[data-seat-input]') as HTMLInputElement, '2') })
    act(() => { directory.set(state({ status: 'error', error: 'selection rejected' })) })
    expect(container.textContent).toContain('模型操作失败：selection rejected')

    dispose(root, container)
  })
})
