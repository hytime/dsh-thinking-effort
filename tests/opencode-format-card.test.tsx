// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenCodeFormatCard } from '../src/client/components/OpenCodeFormatCard.js'
import { zh } from '../src/client/locales.js'
import { iosPalette } from '../src/client/theme.js'
import type { ClientResult, SettingsApi, SettingsDescribeValue, SettingsNamespace, SettingsOp, Translation } from '../src/client/types.js'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const text = (key: string, params?: Record<string, unknown>): string => {
  const value = (zh as Record<string, string>)[key] ?? key
  return value.replace(/\{(\w+)\}/g, (_match: string, name: string) => String(params?.[name] ?? `{${name}}`))
}

interface HarnessOptions {
  readonly user?: Record<string, Record<string, unknown>>
  readonly userByCall?: readonly Record<string, Record<string, unknown>>[]
  readonly writable?: boolean
  readonly describeError?: string
}

function harness(options: HarnessOptions = {}) {
  const revisions: Record<string, number> = { 'llm-pi-ai': 4, 'dsh-thinking-effort': 8 }
  const mutate = vi.fn(async (ns: string, ops: readonly SettingsOp[], revision: number): Promise<ClientResult<SettingsNamespace>> => {
    if (revision !== revisions[ns]) {
      return { ok: false, error: { message: 'settings/conflict' } }
    }
    revisions[ns] = revision + 1
    return { ok: true, value: { ns, revision: revision + 1, value: {} } }
  })
  let describeCalls = 0
  const describe = vi.fn((): Promise<ClientResult<SettingsDescribeValue>> => {
    const call = describeCalls++
    if (options.describeError !== undefined) {
      return Promise.resolve({ ok: false, error: { message: options.describeError } })
    }
    const user = options.userByCall?.[call] ?? options.user
    return Promise.resolve({
      ok: true,
      value: {
        writable: options.writable ?? true,
        namespaces: [
          { ns: 'llm-pi-ai', revision: revisions['llm-pi-ai'], value: {}, user: { subagentEffort: 'off' } },
          { ns: 'dsh-thinking-effort', revision: revisions['dsh-thinking-effort'], value: {}, user: user?.['dsh-thinking-effort'] ?? {} },
        ],
      },
    })
  })
  const settings: SettingsApi = { externalLanguages: false, compatibilityProfile: 'modern', describe, mutate }

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(<OpenCodeFormatCard settings={settings} palette={iosPalette({ prefersDark: true })} t={text as Translation} />)
  })
  return {
    container,
    describe,
    mutate,
    unmount: () => { act(() => root.unmount()); container.remove() },
  }
}

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.getAttribute('aria-label') === label || candidate.textContent?.includes(label))
  if (found === undefined) throw new Error(`missing button: ${label}`)
  return found
}

function selectByLabel(container: HTMLElement, label: string): HTMLSelectElement {
  const found = [...container.querySelectorAll('select')].find((candidate) => candidate.getAttribute('aria-label') === label)
  if (found === undefined) throw new Error(`missing select: ${label}`)
  return found
}

function setSelect(element: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

let cleanup: (() => void) | undefined
afterEach(() => { cleanup?.(); cleanup = undefined })

describe('OpenCodeFormatCard', () => {
  it('starts collapsed and opens on click', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    expect(view.container.querySelector('select')).toBeNull()
    act(() => button(view.container, text('formatCardTitle')).click())
    await settle()
    expect(selectByLabel(view.container, text('formatModeLabel'))).toBeDefined()
  })

  it('reads the stored draft into the controls', async () => {
    // `template` rather than `passthrough`: the card only offers the timestamp
    // source for the modes that consume it, and passthrough never derives a
    // value (see `computeValue` in the Host), so it has no time control to read.
    const view = harness({
      user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'template', time: 'hash' } } } },
    })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('formatCardTitle')).click())
    await settle()
    expect(selectByLabel(view.container, text('formatModeLabel')).value).toBe('template')
    expect(selectByLabel(view.container, text('formatTimeLabel')).value).toBe('hash')
  })

  it('disables Apply until a field changes', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('formatCardTitle')).click())
    await settle()
    expect(button(view.container, text('formatApply')).disabled).toBe(true)

    act(() => setSelect(selectByLabel(view.container, text('formatModeLabel')), 'passthrough'))
    await settle()
    expect(button(view.container, text('formatApply')).disabled).toBe(false)
  })

  it('writes one field-level op and re-reads after saving', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('formatCardTitle')).click())
    await settle()
    const before = view.describe.mock.calls.length

    act(() => setSelect(selectByLabel(view.container, text('formatModeLabel')), 'passthrough'))
    await settle()
    act(() => button(view.container, text('formatApply')).click())
    await settle()

    expect(view.mutate).toHaveBeenCalledTimes(1)
    const [ns, ops] = view.mutate.mock.calls[0]!
    expect(ns).toBe('dsh-thinking-effort')
    expect(ops).toEqual([{ op: 'set', path: ['opencodeSession', 'format', 'mode'], value: 'passthrough' }])
    expect(view.describe.mock.calls.length).toBeGreaterThan(before)
  })

  it('surfaces a describe failure', async () => {
    const view = harness({ describeError: 'settings unreachable' })
    cleanup = view.unmount
    await settle()
    expect(view.container.textContent).toContain('settings unreachable')
  })

  it('refuses to write when the settings are read-only', async () => {
    const view = harness({ writable: false })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('formatCardTitle')).click())
    await settle()
    act(() => setSelect(selectByLabel(view.container, text('formatModeLabel')), 'passthrough'))
    await settle()
    expect(button(view.container, text('formatApply')).disabled).toBe(true)
  })

  it('hides the time source in passthrough mode', async () => {
    const view = harness({
      user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'passthrough' } } } },
    })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('formatCardTitle')).click())
    await settle()
    expect(view.container.querySelector(`select[aria-label="${text('formatTimeLabel')}"]`)).toBeNull()
  })
})
