// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Slider } from '../src/client/thinking-slider/slider.js'

// The seat's debug copy: the placeholder key maps to the guard text the
// skeleton renders (Task 2 replaces it with real slider copy).
const dictionary: Record<string, string> = {
  thinkingSliderPlaceholder: '思考设置 v0 占位',
}

const t = (key: string, params?: Record<string, unknown>): string => {
  const value = dictionary[key] ?? key
  return value.replace(/\{(\w+)\}/g, (_match: string, name: string) => String(params?.[name] ?? `{${name}}`))
}

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Fake model directory, mirroring the official model-select spec's
// state()/directory construction (current + groups + failures + status).
function state() {
  return {
    current: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    routable: true,
    groups: [{
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash' }],
    }],
    failures: [],
    status: 'ready',
    error: null,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('thinking slider composer seat placeholder', () => {
  it('mounts with a fake directory store and t stub and renders the guard debug text', () => {
    const directory = createSnapshotStore(state())
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(Slider, { directory, t }))
    })

    expect(container.textContent).toContain('思考设置 v0 占位')

    act(() => root.unmount())
    container.remove()
  })
})