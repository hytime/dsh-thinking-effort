// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GatewayCompatGroup } from '../src/client/components/GatewayCompatGroup.js'
import { GatewayCompatControls } from '../src/client/components/GatewayCompatControls.js'
import { en } from '../src/client/locales.js'
import { modelView } from './gateway-compat-test-helpers.js'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const label = (key: string): string => (en as Record<string, string>)[key] ?? key

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

function renderGroup(view: ReturnType<typeof modelView>, groupId: 'role' | 'format' | 'stream' | 'cache'): HTMLDivElement {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root!.render(<GatewayCompatGroup groupId={groupId} view={view} onChange={vi.fn()} />)
  })
  return container
}

describe('GatewayCompatGroup', () => {
  it('renders one row per available field in a group and shows the group title', () => {
    const view = modelView({ supportsStore: 'auto', supportsStoreAvailable: true, supportsStoreSource: 'catalog' })
    const rendered = renderGroup(view, 'cache')

    expect(rendered.querySelector(`[aria-label="${label('supportsStore')}"]`)).not.toBeNull()
    expect(rendered.textContent).toContain(label('gatewayGroupCache'))
  })

  it('renders only available fields and provides boolean and enum choices', () => {
    const view = modelView({
      thinkingFormat: 'qwen',
      thinkingFormatAvailable: true,
      maxTokensField: 'max_tokens',
      maxTokensFieldAvailable: true,
      requiresThinkingAsTextAvailable: false,
    })
    const rendered = renderGroup(view, 'format')
    const selects = [...rendered.querySelectorAll('select')] as HTMLSelectElement[]

    expect(selects).toHaveLength(2)
    expect(selects[0]?.getAttribute('aria-label')).toBe(label('thinkingFormat'))
    expect([...selects[0]!.options].map((option) => option.value)).toContain('qwen')
    expect(selects[1]?.getAttribute('aria-label')).toBe(label('maxTokensField'))
    expect([...selects[1]!.options].map((option) => option.value)).toEqual(['auto', 'max_tokens', 'max_completion_tokens'])
  })

  it('returns null when no field in the group is available', () => {
    const view = modelView({ supportsStoreAvailable: false })
    expect(renderGroup(view, 'cache').firstChild).toBeNull()
  })

  it('emits a single field patch when a selection changes', () => {
    const onChange = vi.fn()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root!.render(<GatewayCompatGroup groupId="cache" view={modelView({ supportsStore: 'auto', supportsStoreAvailable: true })} onChange={onChange} />)
    })
    const select = container.querySelector('select') as HTMLSelectElement

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
      setter?.call(select, 'supported')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(onChange).toHaveBeenCalledWith({ supportsStore: 'supported' })
  })
})

describe('GatewayCompatControls collapse', () => {
  it('keeps only the two primary fields visible while collapsed', () => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const view = modelView({
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleAvailable: true,
      maxTokensField: 'max_tokens',
      maxTokensFieldAvailable: true,
      supportsStore: 'auto',
      supportsStoreAvailable: true,
    })

    act(() => {
      root!.render(<GatewayCompatControls scope="model" view={view} onChange={vi.fn()} />)
    })

    const selects = [...container.querySelectorAll('select')] as HTMLSelectElement[]
    expect(selects).toHaveLength(2)
    const expander = [...container.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-expanded') === 'false')
    expect(expander).toBeDefined()
    expect(expander?.textContent).toBe(label('gatewayMoreFields'))
    expect(container.querySelector(`[aria-label="${label('supportsStore')}"]`)).toBeNull()
  })

  it('shows grouped fields when expanded and honors outside-controlled state', () => {
    const onToggleExpanded = vi.fn()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const view = modelView({
      supportsDeveloperRole: 'auto',
      supportsDeveloperRoleAvailable: true,
      maxTokensField: 'max_tokens',
      maxTokensFieldAvailable: true,
      supportsStore: 'supported',
      supportsStoreAvailable: true,
    })

    act(() => {
      root!.render(<GatewayCompatControls scope="model" view={view} onChange={vi.fn()} expanded onToggleExpanded={onToggleExpanded} />)
    })

    const storeSelect = container.querySelector(`[aria-label="${label('supportsStore')}"]`) as HTMLSelectElement
    expect(storeSelect).not.toBeNull()
    expect(storeSelect.value).toBe('supported')
    expect([...storeSelect.options].map((option) => option.value)).toEqual(['auto', 'supported', 'unsupported'])
    expect(container.textContent).toContain(label('gatewayExpandedLess'))
    const expander = [...container.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-expanded') === 'true')
    expect(expander).toBeDefined()

    act(() => expander!.click())
    expect(onToggleExpanded).toHaveBeenCalledTimes(1)
  })
})
