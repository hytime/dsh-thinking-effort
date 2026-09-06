// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Slider } from '../src/client/thinking-slider/slider.js'

// The seat's copy: every key the slider renders must resolve through the
// t stub, mirroring the real lookup chain (dictionary → key) so missing
// keys fail the assertion instead of falling back to a bare key.
const dictionary: Record<string, string> = {
  seatModelLoading: '加载模型…',
  seatNoModel: '未选择模型',
  seatNoEfforts: '当前模型未提供推理档位',
  seatError: '模型目录加载失败：{message}',
  off: 'off',
  high: 'high',
  max: 'max',
  minimal: 'minimal',
  low: 'low',
}

const t = (key: string, params?: Record<string, unknown>): string => {
  const value = dictionary[key] ?? `{{${key}}}`
  return value.replace(/\{(\w+)\}/g, (_match: string, name: string) => String(params?.[name] ?? `{${name}}`))
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

// Fake model directory, mirroring the official model-select spec's
// state()/directory construction (current + groups + failures + status).
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

const mount = (props: Record<string, unknown>): string => {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(Slider, props))
  })
  const text = container.textContent ?? ''
  act(() => root.unmount())
  container.remove()
  return text
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('thinking slider composer seat', () => {
  it('renders only the efforts the current model is configured with', () => {
    const directory = createSnapshotStore(state())
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(Slider, { directory, t }))
    })

    expect(container.textContent).toContain('DeepSeek-V4-Flash')
    expect(container.textContent).toContain('Off')
    expect(container.textContent).toContain('High')
    expect(container.textContent).toContain('Max')
    expect(container.textContent).not.toContain('minimal')
    expect(container.textContent).not.toContain('low')

    act(() => root.unmount())
    container.remove()
  })

  it('shows the empty efforts state when the current model provides none', () => {
    const directory = createSnapshotStore(state({
      groups: [{
        id: 'deepseek-official',
        name: 'DeepSeek',
        models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash' }],
      }],
    }))

    const text = mount({ directory, t })

    expect(text).toContain('DeepSeek-V4-Flash')
    expect(text).toContain('当前模型未提供推理档位')
    expect(text).not.toContain('Off')
  })

  it('handles a null current selection and the loading status', () => {
    const directory = createSnapshotStore(state({ current: null, status: 'loading' }))
    const text = mount({ directory, t })

    expect(text).toContain('加载模型…')
  })

  it('surfaces the directory error under the error status', () => {
    const directory = createSnapshotStore(state({
      current: null,
      groups: [],
      status: 'error',
      error: 'catalog unreachable',
    }))
    const text = mount({ directory, t })

    expect(text).toContain('模型目录加载失败：catalog unreachable')
  })
})
