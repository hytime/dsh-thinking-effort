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
  /** Forwarded to the card, standing in for the surrounding editor's reload. */
  readonly onApplied?: () => void
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
    root.render(<OpenCodeFormatCard settings={settings} palette={iosPalette({ prefersDark: true })} t={text as Translation} onApplied={options.onApplied} />)
  })
  return {
    container,
    describe,
    mutate,
    onApplied: options.onApplied,
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

  it('calls onApplied once after a successful apply', async () => {
    const onApplied = vi.fn()
    const view = harness({ onApplied })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('formatCardTitle')).click())
    await settle()
    act(() => setSelect(selectByLabel(view.container, text('formatModeLabel')), 'passthrough'))
    await settle()
    expect(onApplied).not.toHaveBeenCalled()

    act(() => button(view.container, text('formatApply')).click())
    await settle()
    expect(view.mutate).toHaveBeenCalledTimes(1)
    expect(onApplied).toHaveBeenCalledTimes(1)
  })

  // The four modes whose values consume the timestamp source in the Host:
  // `ses-derive` derives from it, and `template` / `expression` / `script` all
  // read `hex12` through `context(request, session, config.time)`. Only
  // `passthrough` hands `request.sessionId` straight through without it.
  for (const mode of ['ses-derive', 'template', 'expression', 'script']) {
    it(`offers the time source in ${mode} mode`, async () => {
      const view = harness({ user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode } } } } })
      cleanup = view.unmount
      await settle()
      act(() => button(view.container, text('formatCardTitle')).click())
      await settle()
      expect(selectByLabel(view.container, text('formatTimeLabel'))).toBeDefined()
    })
  }

  // The notice's fixed prefix, without the `{detail}` list that follows it.
  const noticePrefix = text('formatUnsupportedStored').split('{detail}')[0]!

  it('names the field and fallback value of each unsupported stored enum', async () => {
    const cases: readonly { stored: Record<string, string>; detail: string }[] = [
      { stored: { mode: 'unknown' }, detail: `${text('formatModeLabel')} → ses-derive` },
      { stored: { time: 'bogus' }, detail: `${text('formatTimeLabel')} → firstUse` },
      { stored: { onInvalid: 'explode' }, detail: `${text('formatOnInvalidLabel')} → warn` },
    ]
    for (const entry of cases) {
      const view = harness({ user: { 'dsh-thinking-effort': { opencodeSession: { format: entry.stored } } } })
      try {
        await settle()
        act(() => button(view.container, text('formatCardTitle')).click())
        await settle()
        expect(view.container.textContent).toContain(noticePrefix)
        expect(view.container.textContent).toContain(entry.detail)
      } finally {
        view.unmount()
      }
    }
  })

  it('names every unsupported field when several are stored at once', async () => {
    const view = harness({
      user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'unknown', time: 'bogus', onInvalid: 'explode' } } } },
    })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('formatCardTitle')).click())
    await settle()
    const shown = view.container.textContent ?? ''
    expect(shown).toContain(noticePrefix)
    expect(shown).toContain(`${text('formatModeLabel')} → ses-derive`)
    expect(shown).toContain(`${text('formatTimeLabel')} → firstUse`)
    expect(shown).toContain(`${text('formatOnInvalidLabel')} → warn`)
  })

  it('shows no fallback notice when every stored value is supported', async () => {
    const view = harness({
      user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'ses-derive', time: 'hash', onInvalid: 'drop' } } } },
    })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('formatCardTitle')).click())
    await settle()
    expect(view.container.textContent).not.toContain(noticePrefix)
  })
})

function inputByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const found = [...container.querySelectorAll('input')].find((candidate) => candidate.getAttribute('aria-label') === label)
  if (found === undefined) throw new Error(`missing input: ${label}`)
  return found
}

function setInput(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * The `role="alert"` message rendered inside one field's own block, located
 * from that field's input rather than from the card's whole text: a message
 * paired with the wrong input cannot satisfy this lookup.
 */
function fieldAlert(container: HTMLElement, label: string): HTMLElement {
  const block = inputByLabel(container, label).closest('div')
  if (block === null) throw new Error(`field has no wrapper: ${label}`)
  const alert = block.querySelector('[role="alert"]')
  if (alert === null) throw new Error(`missing alert in field: ${label}`)
  return alert as HTMLElement
}

async function openCard(view: { container: HTMLElement }): Promise<void> {
  act(() => button(view.container, text('formatCardTitle')).click())
  await settle()
}

describe('OpenCodeFormatCard dynamic fields', () => {
  it('shows only the template input in template mode', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'template', template: 'x' } } } } })
    cleanup = view.unmount
    await settle()
    await openCard(view)
    expect(inputByLabel(view.container, text('formatTemplateLabel')).value).toBe('x')
    expect(view.container.querySelector(`input[aria-label="${text('formatExpressionLabel')}"]`)).toBeNull()
    expect(view.container.querySelector(`input[aria-label="${text('formatScriptLabel')}"]`)).toBeNull()
    // The template mode still consults the timestamp source.
    expect(view.container.querySelector(`select[aria-label="${text('formatTimeLabel')}"]`)).not.toBeNull()
  })

  it('shows only the expression input in expression mode', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'expression', expression: 'hex12' } } } } })
    cleanup = view.unmount
    await settle()
    await openCard(view)
    expect(inputByLabel(view.container, text('formatExpressionLabel')).value).toBe('hex12')
    expect(view.container.querySelector(`input[aria-label="${text('formatTemplateLabel')}"]`)).toBeNull()
    // `hex12` in an expression comes from the timestamp source, so it stays offered.
    expect(view.container.querySelector(`select[aria-label="${text('formatTimeLabel')}"]`)).not.toBeNull()
  })

  it('shows only the script input in script mode', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'script', script: '/srv/s.mjs' } } } } })
    cleanup = view.unmount
    await settle()
    await openCard(view)
    expect(inputByLabel(view.container, text('formatScriptLabel')).value).toBe('/srv/s.mjs')
    expect(view.container.querySelector(`input[aria-label="${text('formatTemplateLabel')}"]`)).toBeNull()
    // The timestamp source stays visible: the Host reads `hex12` from it in
    // script mode too, so hiding it would take away a control that matters.
    expect(view.container.querySelector(`select[aria-label="${text('formatTimeLabel')}"]`)).not.toBeNull()
  })

  it('keeps values entered for another mode when switching away and back', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'template', template: 'keep-me' } } } } })
    cleanup = view.unmount
    await settle()
    await openCard(view)
    act(() => setSelect(selectByLabel(view.container, text('formatModeLabel')), 'ses-derive'))
    await settle()
    expect(view.container.querySelector(`input[aria-label="${text('formatTemplateLabel')}"]`)).toBeNull()
    act(() => setSelect(selectByLabel(view.container, text('formatModeLabel')), 'template'))
    await settle()
    expect(inputByLabel(view.container, text('formatTemplateLabel')).value).toBe('keep-me')
  })

  it('blocks Apply and explains an unparseable validate source', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    await openCard(view)
    act(() => setInput(inputByLabel(view.container, text('formatValidateLabel')), '('))
    await settle()
    expect(view.container.textContent).toContain(text('formatErrValidateRegex'))
    expect(button(view.container, text('formatApply')).disabled).toBe(true)
  })

  it('blocks Apply and explains an empty template in template mode', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'template' } } } } })
    cleanup = view.unmount
    await settle()
    await openCard(view)
    expect(view.container.textContent).toContain(text('formatErrTemplateRequired'))
    expect(button(view.container, text('formatApply')).disabled).toBe(true)
  })

  it('blocks Apply and explains an unparseable expression', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'expression', expression: 'hex12' } } } } })
    cleanup = view.unmount
    await settle()
    await openCard(view)
    act(() => setInput(inputByLabel(view.container, text('formatExpressionLabel')), "'x' + ("))
    await settle()
    expect(view.container.textContent).toContain(text('formatErrExpressionSyntax'))
    expect(button(view.container, text('formatApply')).disabled).toBe(true)
  })

  it('blocks Apply and explains a relative script path', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'script' } } } } })
    cleanup = view.unmount
    await settle()
    await openCard(view)
    act(() => setInput(inputByLabel(view.container, text('formatScriptLabel')), './s.mjs'))
    await settle()
    expect(view.container.textContent).toContain(text('formatErrScriptNotAbsolute'))
    expect(button(view.container, text('formatApply')).disabled).toBe(true)
  })

  // The three messages below had no rendering assertion at all: only the
  // `formatFieldErrors` codes were covered, so a code mapped to the wrong
  // localization key would pass typecheck and every other case while showing
  // the user an error about a different field. Each case therefore stores a
  // *valid* value, opens the card, and only then edits the field — an
  // already-invalid draft would leave `dirty` false, making the disabled Apply
  // assertion below true for a reason unrelated to `blocked`.

  it('blocks Apply and explains an empty expression in expression mode', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'expression', expression: 'hex12' } } } } })
    cleanup = view.unmount
    await settle()
    await openCard(view)
    expect(inputByLabel(view.container, text('formatExpressionLabel')).getAttribute('aria-invalid')).toBeNull()
    act(() => setInput(inputByLabel(view.container, text('formatExpressionLabel')), ''))
    await settle()
    expect(fieldAlert(view.container, text('formatExpressionLabel')).textContent).toBe(text('formatErrExpressionRequired'))
    expect(inputByLabel(view.container, text('formatExpressionLabel')).getAttribute('aria-invalid')).toBe('true')
    // The sibling free-text messages belong to fields that are not even
    // rendered here, so seeing either one would mean a crossed mapping.
    expect(view.container.textContent).not.toContain(text('formatErrTemplateRequired'))
    expect(view.container.textContent).not.toContain(text('formatErrScriptRequired'))
    expect(button(view.container, text('formatApply')).disabled).toBe(true)
  })

  it('blocks Apply and explains an unknown expression name', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'expression', expression: 'hex12' } } } } })
    cleanup = view.unmount
    await settle()
    await openCard(view)
    expect(inputByLabel(view.container, text('formatExpressionLabel')).getAttribute('aria-invalid')).toBeNull()
    // `hex_12` parses as a plain identifier, so this is the unknown-name branch
    // rather than the syntax branch.
    act(() => setInput(inputByLabel(view.container, text('formatExpressionLabel')), 'hex_12'))
    await settle()
    expect(fieldAlert(view.container, text('formatExpressionLabel')).textContent).toBe(text('formatErrExpressionUnknownName'))
    expect(inputByLabel(view.container, text('formatExpressionLabel')).getAttribute('aria-invalid')).toBe('true')
    expect(view.container.textContent).not.toContain(text('formatErrExpressionSyntax'))
    expect(view.container.textContent).not.toContain(text('formatErrExpressionRequired'))
    expect(button(view.container, text('formatApply')).disabled).toBe(true)
  })

  it('blocks Apply and explains an empty script path in script mode', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'script', script: '/srv/session.mjs' } } } } })
    cleanup = view.unmount
    await settle()
    await openCard(view)
    expect(inputByLabel(view.container, text('formatScriptLabel')).getAttribute('aria-invalid')).toBeNull()
    act(() => setInput(inputByLabel(view.container, text('formatScriptLabel')), ''))
    await settle()
    expect(fieldAlert(view.container, text('formatScriptLabel')).textContent).toBe(text('formatErrScriptRequired'))
    expect(inputByLabel(view.container, text('formatScriptLabel')).getAttribute('aria-invalid')).toBe('true')
    expect(view.container.textContent).not.toContain(text('formatErrScriptNotAbsolute'))
    expect(view.container.textContent).not.toContain(text('formatErrTemplateRequired'))
    expect(view.container.textContent).not.toContain(text('formatErrExpressionRequired'))
    expect(button(view.container, text('formatApply')).disabled).toBe(true)
  })

  it('clears the error once the input becomes valid', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    await openCard(view)
    act(() => setInput(inputByLabel(view.container, text('formatValidateLabel')), '('))
    await settle()
    expect(button(view.container, text('formatApply')).disabled).toBe(true)
    act(() => setInput(inputByLabel(view.container, text('formatValidateLabel')), '^ses_'))
    await settle()
    expect(view.container.textContent).not.toContain(text('formatErrValidateRegex'))
    expect(button(view.container, text('formatApply')).disabled).toBe(false)
  })

  it('warns when the stored mode is not one this card offers', async () => {
    const view = harness({ user: { 'dsh-thinking-effort': { opencodeSession: { format: { mode: 'unknown-mode' } } } } })
    cleanup = view.unmount
    await settle()
    await openCard(view)
    // `text(key)` has no params here, so the raw template keeps its `{detail}`
    // placeholder and would never appear rendered; the notice's fixed prefix
    // is the part that is actually shown.
    expect(view.container.textContent).toContain(text('formatUnsupportedStored').split('{detail}')[0]!)
    expect(selectByLabel(view.container, text('formatModeLabel')).value).toBe('ses-derive')
  })

  it('shows the on-invalid policy only when a validate source is set', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    await openCard(view)
    expect(view.container.querySelector(`select[aria-label="${text('formatOnInvalidLabel')}"]`)).toBeNull()
    act(() => setInput(inputByLabel(view.container, text('formatValidateLabel')), '^ses_'))
    await settle()
    expect(view.container.querySelector(`select[aria-label="${text('formatOnInvalidLabel')}"]`)).not.toBeNull()
  })
})
