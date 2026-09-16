// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigBackupCard } from '../src/client/components/ConfigBackupCard.js'
import { SNAPSHOT_KIND, SNAPSHOT_VERSION } from '../src/client/config-snapshot/types.js'
import { zh } from '../src/client/locales.js'
import { iosPalette } from '../src/client/theme.js'
import type { ClientResult, SettingsApi, SettingsNamespace, SettingsOp, Translation } from '../src/client/types.js'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const text = (key: string, params?: Record<string, unknown>): string => {
  const value = (zh as Record<string, string>)[key] ?? key
  return value.replace(/\{(\w+)\}/g, (_match: string, name: string) => String(params?.[name] ?? `{${name}}`))
}

const storedSnapshot = (sections: Record<string, Record<string, unknown>>) => ({
  kind: SNAPSHOT_KIND,
  version: SNAPSHOT_VERSION,
  createdAt: '2026-09-16T12:00:00.000Z',
  pluginVersion: '0.2.4',
  sourceProfile: 'modern',
  sections: { 'dsh-thinking-effort': {}, 'llm-pi-ai': {}, ...sections },
})

interface HarnessOptions {
  user?: Record<string, Record<string, unknown>>
  writable?: boolean
  describeError?: string
}

function harness(options: HarnessOptions = {}) {
  const mutate = vi.fn(async (ns: string, _ops: readonly SettingsOp[], revision: number): Promise<ClientResult<SettingsNamespace>> => ({
    ok: true,
    value: { ns, revision: revision + 1, value: {} },
  }))
  const describe = vi.fn(async (): Promise<ClientResult<{ namespaces: readonly SettingsNamespace[]; writable?: boolean }>> => {
    if (options.describeError !== undefined) return { ok: false, error: { message: options.describeError } }
    return {
      ok: true,
      value: {
        writable: options.writable ?? true,
        namespaces: [
          { ns: 'llm-pi-ai', revision: 4, value: {}, user: options.user?.['llm-pi-ai'] ?? { subagentEffort: 'off' } },
          { ns: 'dsh-thinking-effort', revision: 8, value: {}, user: options.user?.['dsh-thinking-effort'] ?? {} },
        ],
      },
    }
  })
  const settings: SettingsApi = { externalLanguages: false, compatibilityProfile: 'modern', describe, mutate }

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const download = vi.fn()
  const onApplied = vi.fn()
  act(() => {
    root.render(<ConfigBackupCard settings={settings} palette={iosPalette({ prefersDark: true })} t={text as Translation} download={download} onApplied={onApplied} now={() => new Date(2026, 8, 16, 12, 0)} />)
  })

  return {
    container,
    mutate,
    download,
    onApplied,
    unmount: () => { act(() => root.unmount()); container.remove() },
  }
}

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((candidate) => candidate.getAttribute('aria-label') === label || candidate.textContent?.includes(label))
  if (found === undefined) throw new Error(`missing button: ${label}`)
  return found
}

let cleanup: (() => void) | undefined
afterEach(() => { cleanup?.(); cleanup = undefined })

describe('ConfigBackupCard', () => {
  it('starts collapsed and reports the profile count in the header', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { profiles: { work: storedSnapshot({ 'llm-pi-ai': { a: 1 } }) } } } })
    cleanup = view.unmount
    await settle()

    expect(view.container.textContent).toContain(text('backupCardTitle'))
    expect(view.container.textContent).toContain(text('backupCollapsedHint', { count: 1 }))
    expect(view.container.textContent).not.toContain(text('backupProfilesTitle'))
  })

  it('downloads the current configuration as a snapshot file when expanded', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()
    act(() => button(view.container, text('backupExportCurrent')).click())
    await settle()

    expect(view.download).toHaveBeenCalledTimes(1)
    const [filename, body] = view.download.mock.calls[0] as [string, string]
    expect(filename).toBe('dsh-config-20260916-1200.json')
    const parsed = JSON.parse(body) as { kind: string; sections: Record<string, unknown> }
    expect(parsed.kind).toBe(SNAPSHOT_KIND)
    expect(parsed.sections['llm-pi-ai']).toEqual({ subagentEffort: 'off' })
  })

  it('saves the current configuration as a named profile', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    const input = view.container.querySelector('input[type="text"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, 'work')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    act(() => button(view.container, text('backupSaveCurrent')).click())
    await settle()

    expect(view.mutate).toHaveBeenCalledWith('dsh-thinking-effort', [
      { op: 'set', path: ['profiles', 'work'], value: expect.objectContaining({ kind: SNAPSHOT_KIND }) },
    ], 8)
  })

  it('refuses an empty profile name without writing', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()
    act(() => button(view.container, text('backupSaveCurrent')).click())
    await settle()

    expect(view.mutate).not.toHaveBeenCalled()
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(text('backupNameRequired'))
  })

  it('will not write anything when the settings source is read-only', async () => {
    const view = harness({ writable: false })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    expect(button(view.container, text('backupExportCurrent')).disabled).toBe(false)
    expect(button(view.container, text('backupImportChoose')).disabled).toBe(true)
    expect(button(view.container, text('backupSaveCurrent')).disabled).toBe(true)
    expect(view.container.textContent).toContain(text('backupReadOnly'))
  })

  it('previews an imported file with a merge summary and writes only after confirmation', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    const file = new File([JSON.stringify(storedSnapshot({ 'llm-pi-ai': { subagentEffort: 'high' } }))], 'snapshot.json', { type: 'application/json' })
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve() })
    await settle()

    expect(view.container.textContent).toContain(text('backupPreviewTitle'))
    expect(view.container.textContent).toContain(text('backupSummary', { added: 0, overwritten: 1, removed: 0 }))
    expect(view.mutate).not.toHaveBeenCalled()

    act(() => button(view.container, text('backupConfirmImport')).click())
    await settle()

    expect(view.mutate).toHaveBeenCalledWith('llm-pi-ai', [{ op: 'set', path: ['subagentEffort'], value: 'high' }], 4)
    expect(view.onApplied).toHaveBeenCalled()
  })

  it('shows a parse error and writes nothing for a foreign file', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    const file = new File(['{"kind":"something-else"}'], 'other.json', { type: 'application/json' })
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve() })
    await settle()

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(text('backupParseKindMismatch'))
    expect(view.mutate).not.toHaveBeenCalled()
  })

  it('applies a stored profile through the same preview path', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { profiles: { work: storedSnapshot({ 'llm-pi-ai': { subagentEffort: 'high' } }) } } } })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()
    act(() => button(view.container, text('backupApply')).click())
    await settle()

    expect(view.container.textContent).toContain(text('backupSourceProfile', { name: 'work' }))
    expect(view.mutate).not.toHaveBeenCalled()
  })

  it('requires a second click before deleting a profile', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { profiles: { work: storedSnapshot({ 'llm-pi-ai': { a: 1 } }) } } } })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    act(() => button(view.container, text('backupDeleteProfile')).click())
    await settle()
    expect(view.mutate).not.toHaveBeenCalled()

    act(() => button(view.container, text('backupDeleteConfirm')).click())
    await settle()
    expect(view.mutate).toHaveBeenCalledWith('dsh-thinking-effort', [{ op: 'unset', path: ['profiles', 'work'] }], 8)
  })
})