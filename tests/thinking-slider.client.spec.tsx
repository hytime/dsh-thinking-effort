// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  seatFollowDefault: '跟随模型默认',
  seatSliderLabel: '推理档位',
  seatErrorAction: '模型操作失败：{message}',
  off: 'off',
  high: 'high',
  max: 'max',
}

const t = (key: string, params?: Record<string, unknown>): string => {
  const value = dictionary[key] ?? `{{${key}}}`
  return value.replace(/\{(\w+)\}/g, (_match: string, name: string) => String(params?.[name] ?? `{${name}}`))
}

// Set a jsdom range input's value without going through the native value
// accessor (jsdom's HTMLInputElement#value is not settable for range), then
// dispatch the native 'input' event React 18 listens to.
function setRangeValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
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

  it('submits a range change as a session selection with the matching reasoning effort', () => {
    const select = vi.fn().mockResolvedValue(true)
    const directory = createSnapshotStore(state())
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    // The seat mounts with the panel open (default open=true keeps the
    // pre-existing mount-time visibility), so the range is queryable right
    // away.
    act(() => {
      root.render(createElement(Slider, { directory, select, t }))
    })

    const input = container.querySelector('[data-seat-input]') as HTMLInputElement
    expect(input).not.toBeNull()
    act(() => {
      setRangeValue(input, '2')
    })

    expect(select).toHaveBeenCalledTimes(1)
    expect(select).toHaveBeenCalledWith({ provider: 'deepseek-official', model: 'deepseek-v4-flash', reasoningEffort: 'max' })
    act(() => root.unmount())
    container.remove()
  })

  it('announces the current effort level through aria-valuetext', () => {
    const directory = createSnapshotStore(state())
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(Slider, { directory, t }))
    })

    const input = container.querySelector('[data-seat-input]') as HTMLInputElement
    expect(input).not.toBeNull()
    // defaultEffort='high' resolves to the 'high' level, whose name is 'High'.
    expect(input.getAttribute('aria-valuetext')).toBe('High')

    act(() => root.unmount())
    container.remove()
  })

  it('shows the follow-default row only while the model declares no default effort', () => {
    const select = vi.fn().mockResolvedValue(true)
    const container = document.createElement('div')

    // No defaultEffort: the row renders and submits a bare selection.
    const noDefault = createSnapshotStore(state({
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
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(createElement(Slider, { directory: noDefault, select, t }))
    })
    const follow = container.querySelector('[data-seat-default]') as HTMLButtonElement
    expect(follow).not.toBeNull()
    act(() => {
      follow.click()
    })
    expect(select).toHaveBeenCalledWith({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
    expect(select.mock.calls[0]?.[0]).not.toHaveProperty('reasoningEffort')

    // defaultEffort present: the row must not render.
    const withDefault = createSnapshotStore(state())
    act(() => {
      root.render(createElement(Slider, { directory: withDefault, t }))
    })
    expect(container.querySelector('[data-seat-default]')).toBeNull()

    act(() => root.unmount())
    container.remove()
  })

  it('closes the panel on outside mousedown and returns focus to the trigger on Escape', async () => {
    const directory = createSnapshotStore(state())
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    // Mounts open: the panel is visible without touching the trigger.
    act(() => {
      root.render(createElement(Slider, { directory, t }))
    })
    const trigger = container.querySelector('[data-seat-trigger]') as HTMLButtonElement
    expect(container.querySelector('[data-seat-input]')).not.toBeNull()

    // Outside mousedown closes the popover.
    const outside = document.createElement('button')
    document.body.append(outside)
    act(() => {
      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(container.querySelector('[data-seat-input]')).toBeNull()
    outside.remove()

    // Re-open through the trigger; Escape closes and restores focus.
    act(() => {
      trigger.click()
    })
    expect(container.querySelector('[data-seat-input]')).not.toBeNull()
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(container.querySelector('[data-seat-input]')).toBeNull()
    // Focus restoration is scheduled on a microtask, so flush it first.
    await Promise.resolve()
    expect(document.activeElement).toBe(trigger)

    act(() => root.unmount())
    container.remove()
  })

  it('surfaces a failed selection through the directory error action copy', () => {
    const select = vi.fn().mockResolvedValue(false)
    const directory = createSnapshotStore(state({
      status: 'selecting',
    }))
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    // The seat mounts open, so the range is ready immediately.
    act(() => {
      root.render(createElement(Slider, { directory, select, t }))
    })
    const input = container.querySelector('[data-seat-input]') as HTMLInputElement
    act(() => {
      setRangeValue(input, '2')
    })

    // The official directory.select writes the failure into the store itself;
    // mirroring that, the panel derives the action error from store.error.
    act(() => {
      directory.set(state({ status: 'error', error: 'selection rejected' }))
    })
    expect(container.textContent).toContain('模型操作失败：selection rejected')

    act(() => root.unmount())
    container.remove()
  })
})
