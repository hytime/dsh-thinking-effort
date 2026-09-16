// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigBackupCard } from '../src/client/components/ConfigBackupCard.js'
import { AUTO_BACKUP_PATH } from '../src/client/config-snapshot/library.js'
import { SNAPSHOT_KIND, SNAPSHOT_VERSION } from '../src/client/config-snapshot/types.js'
import { zh } from '../src/client/locales.js'
import { iosPalette } from '../src/client/theme.js'
import type { ClientResult, SettingsApi, SettingsDescribeValue, SettingsNamespace, SettingsOp, Translation } from '../src/client/types.js'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const text = (key: string, params?: Record<string, unknown>): string => {
  const value = (zh as Record<string, string>)[key] ?? key
  return value.replace(/\{(\w+)\}/g, (_match: string, name: string) => String(params?.[name] ?? `{${name}}`))
}

const storedSnapshot = (sections: Record<string, Record<string, unknown>>, createdAt = '2026-09-16T12:00:00.000Z') => ({
  kind: SNAPSHOT_KIND,
  version: SNAPSHOT_VERSION,
  createdAt,
  pluginVersion: '0.2.4',
  sourceProfile: 'modern',
  sections: { 'dsh-thinking-effort': {}, 'llm-pi-ai': {}, ...sections },
})

interface HarnessOptions {
  user?: Record<string, Record<string, unknown>>
  /** Per-describe-call user layers, so a later read can answer with edited state. Index 0 is the mount read. */
  userByCall?: readonly Record<string, Record<string, unknown>>[]
  writable?: boolean
  describeError?: string
  /** Describe call ordinals that fail; omit to fail on every call. */
  describeErrorCalls?: readonly number[]
  /** Message for a describe that throws synchronously instead of answering. */
  describeThrow?: string
  /** Describe call ordinals that throw; omit to throw on every call. */
  describeThrowCalls?: readonly number[]
  /** Per-describe-call namespace revisions, so a later read can answer with a revision an editor-side write bumped. */
  revisionByCall?: readonly Record<string, number>[]
  /** Refuse a mutate whose revision is not the one the latest describe reported, the way the host does. */
  enforceRevisions?: boolean
  /** Namespaces whose write is refused with a plain rejection, the way a rejected provider profile is. */
  failOn?: readonly string[]
  /** `applies` flags the host reports per namespace, so a write can require a restart. */
  applies?: Readonly<Record<string, string>>
  /** Refuse the pre-import backup write, so an applied import has no rollback copy. */
  failAutoBackup?: boolean
}

/** The op list `autoBackupOps` builds — what separates the rollback copy from a namespace write. */
function isAutoBackup(ops: readonly SettingsOp[]): boolean {
  return ops.some((op) => op.op === 'set' && op.path.length === 1 && op.path[0] === AUTO_BACKUP_PATH[0])
}

function harness(options: HarnessOptions = {}) {
  // The revisions the host reports: llm-pi-ai 4, plugin namespace 8. A later
  // describe can answer with a bumped revision, and a stale mutate is then
  // refused with settings/conflict just like the real provider.
  const revisions: Record<string, number> = { 'llm-pi-ai': 4, 'dsh-thinking-effort': 8 }
  const mutate = vi.fn(async (ns: string, ops: readonly SettingsOp[], revision: number): Promise<ClientResult<SettingsNamespace>> => {
    if (options.failAutoBackup === true && isAutoBackup(ops)) {
      return { ok: false, error: { message: 'settings rejected the backup' } }
    }
    if (options.failOn?.includes(ns) === true) {
      return { ok: false, error: { message: `settings rejected ${ns}` } }
    }
    if (options.enforceRevisions === true && revision !== revisions[ns]) {
      return { ok: false, error: { message: 'settings/conflict' } }
    }
    revisions[ns] = revision + 1
    return { ok: true, value: { ns, revision: revision + 1, value: {} } }
  })
  let describeCalls = 0
  // Deliberately not `async`: a synchronous throw is the failure mode under
  // test, and an async function would turn it into an ordinary rejection.
  const describe = vi.fn((): Promise<ClientResult<SettingsDescribeValue>> => {
    const call = describeCalls++
    const thrown = options.describeThrow
    if (thrown !== undefined && (options.describeThrowCalls === undefined || options.describeThrowCalls.includes(call))) {
      throw new Error(thrown)
    }
    const failure = options.describeError
    if (failure !== undefined && (options.describeErrorCalls === undefined || options.describeErrorCalls.includes(call))) {
      return Promise.resolve({ ok: false, error: { message: failure } })
    }
    const bumped = options.revisionByCall?.[call]
    if (bumped !== undefined) Object.assign(revisions, bumped)
    const user = options.userByCall?.[call] ?? options.user
    return Promise.resolve({
      ok: true,
      value: {
        writable: options.writable ?? true,
        namespaces: [
          { ns: 'llm-pi-ai', revision: revisions['llm-pi-ai'], value: {}, user: user?.['llm-pi-ai'] ?? { subagentEffort: 'off' }, applies: options.applies?.['llm-pi-ai'] },
          { ns: 'dsh-thinking-effort', revision: revisions['dsh-thinking-effort'], value: {}, user: user?.['dsh-thinking-effort'] ?? {}, applies: options.applies?.['dsh-thinking-effort'] },
        ],
      },
    })
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
    describe,
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

function modeSelect(container: HTMLElement): HTMLSelectElement {
  const found = container.querySelector('select')
  if (found === null) throw new Error('missing preview mode select')
  return found
}

function setProfileName(container: HTMLElement, name: string): void {
  const input = container.querySelector('input[type="text"]') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, name)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function chooseFile(container: HTMLElement, file: File): Promise<void> {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve() })
  await settle()
}

interface DeferredRead {
  readonly file: File
  /** Let `file.text()` settle; does nothing until the test calls it. */
  readonly release: () => void
}

/**
 * A file whose read finishes only when the test says so, so two selections can
 * complete out of order. `failure` makes the read reject instead of answering.
 */
function deferredFile(name: string, content: string, failure?: string): DeferredRead {
  const file = new File([content], name, { type: 'application/json' })
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  Object.defineProperty(file, 'text', {
    value: async (): Promise<string> => {
      await gate
      if (failure !== undefined) throw new Error(failure)
      return content
    },
    configurable: true,
  })
  return { file, release: () => release() }
}

/** Select a deferred file; its read stays pending. */
async function chooseDeferredFile(container: HTMLElement, read: DeferredRead): Promise<void> {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [read.file], configurable: true })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await Promise.resolve() })
}

async function releaseRead(read: DeferredRead): Promise<void> {
  act(() => { read.release() })
  await settle()
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
    expect(modeSelect(view.container).value).toBe('merge')
    expect(view.container.textContent).toContain(text('backupSummary', { added: 0, overwritten: 1, removed: 0 }))
    expect(view.mutate).not.toHaveBeenCalled()

    act(() => button(view.container, text('backupConfirmImport')).click())
    await settle()

    expect(view.mutate).toHaveBeenCalledWith('llm-pi-ai', [{ op: 'set', path: ['subagentEffort'], value: 'high' }], 4)
    expect(view.onApplied).toHaveBeenCalled()
  })

  // The apply reports the namespaces that only take effect after a DSH restart,
  // and a rollback copy that could not be written. Both are consequences of a
  // successful apply, so they belong in the status block beside it, not in the
  // error block that means "the configuration was not applied".
  it('names the namespaces that need a restart after a successful apply', async () => {
    const view = harness({ applies: { 'llm-pi-ai': 'restart' } })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()
    await chooseFile(view.container, new File([JSON.stringify(storedSnapshot({ 'llm-pi-ai': { subagentEffort: 'high' } }))], 'snapshot.json', { type: 'application/json' }))

    act(() => button(view.container, text('backupConfirmImport')).click())
    await settle()

    const status = view.container.querySelector('[role="status"]')?.textContent ?? ''
    expect(status).toContain(text('backupApplied'))
    expect(status).toContain(text('backupRestartRequired', { namespaces: 'llm-pi-ai' }))
    expect(view.container.querySelector('[role="alert"]')).toBeNull()
    expect(view.onApplied).toHaveBeenCalled()
  })

  it('reports a rollback copy that could not be written without failing the apply', async () => {
    const view = harness({ failAutoBackup: true })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()
    await chooseFile(view.container, new File([JSON.stringify(storedSnapshot({ 'llm-pi-ai': { subagentEffort: 'high' } }))], 'snapshot.json', { type: 'application/json' }))

    act(() => button(view.container, text('backupConfirmImport')).click())
    await settle()

    const status = view.container.querySelector('[role="status"]')?.textContent ?? ''
    expect(status).toContain(text('backupApplied'))
    expect(status).toContain(text('backupAutoBackupFailed', { message: 'settings rejected the backup' }))
    // Only the copy failed: the write landed and the card must not call it an error.
    expect(view.container.querySelector('[role="alert"]')).toBeNull()
    expect(view.mutate).toHaveBeenCalledWith('llm-pi-ai', [{ op: 'set', path: ['subagentEffort'], value: 'high' }], 4)
    expect(view.onApplied).toHaveBeenCalled()
  })

  // A half-applied plan is one outcome, not two: the namespaces that landed keep
  // their consequences — a restart requirement, a rollback copy that could not be
  // written — and dropping them here would hide them exactly where they matter,
  // beside a failure the user is already being asked to read.
  it('reports what applied, the restart, and the failed rollback copy when only part of the plan lands', async () => {
    const view = harness({ applies: { 'dsh-thinking-effort': 'restart' }, failOn: ['llm-pi-ai'], failAutoBackup: true })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()
    await chooseFile(view.container, new File([JSON.stringify(storedSnapshot({
      'dsh-thinking-effort': { opencodeSession: { providers: { p: { models: { m: true } } } } },
      'llm-pi-ai': { subagentEffort: 'high' },
    }))], 'snapshot.json', { type: 'application/json' }))

    act(() => button(view.container, text('backupConfirmImport')).click())
    await settle()

    // The failure stays an error, with the namespace and the reason.
    const alert = view.container.querySelector('[role="alert"]')?.textContent ?? ''
    expect(alert).toContain(text('backupAppliedPartial', { detail: 'llm-pi-ai: settings rejected llm-pi-ai' }))

    // The half that applied is still reported, with the restart it needs and the
    // copy that could not be written.
    const status = view.container.querySelector('[role="status"]')?.textContent ?? ''
    expect(status).toContain(text('backupAppliedPartial', { detail: 'dsh-thinking-effort' }))
    expect(status).toContain(text('backupRestartRequired', { namespaces: 'dsh-thinking-effort' }))
    expect(status).toContain(text('backupAutoBackupFailed', { message: 'settings rejected the backup' }))
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

  it('keeps the card mounted when the preview mode switches to replace', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()
    await chooseFile(view.container, new File([JSON.stringify(storedSnapshot({ 'llm-pi-ai': { subagentEffort: 'high' } }))], 'snapshot.json', { type: 'application/json' }))

    const select = modeSelect(view.container)
    expect(select.value).toBe('merge')
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    act(() => {
      setter?.call(select, 'replace')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()

    expect(view.container.textContent).toContain(text('backupPreviewTitle'))
    expect(view.container.querySelectorAll('button').length).toBeGreaterThan(0)
    expect(modeSelect(view.container).value).toBe('replace')
  })

  it('drops the preview when a later file fails to parse', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()
    await chooseFile(view.container, new File([JSON.stringify(storedSnapshot({ 'llm-pi-ai': { subagentEffort: 'high' } }))], 'good.json', { type: 'application/json' }))
    expect(view.container.textContent).toContain(text('backupPreviewTitle'))

    await chooseFile(view.container, new File(['{"kind":"something-else"}'], 'bad.json', { type: 'application/json' }))

    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(text('backupParseKindMismatch'))
    expect(view.container.textContent).not.toContain(text('backupPreviewTitle'))
    expect([...view.container.querySelectorAll('button')].some((candidate) => candidate.textContent?.includes(text('backupConfirmImport')))).toBe(false)
    expect(view.mutate).not.toHaveBeenCalled()
  })

  // Only one selection is ever the user's last one, and confirmation writes what
  // the preview holds. Two reads can be in flight at once, so the slower earlier
  // read must not be able to install its snapshot afterwards — that would attach
  // consent to a file the user moved on from.
  it('keeps the last chosen file\'s preview when an earlier read finishes later', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    const first = deferredFile('first.json', JSON.stringify(storedSnapshot({ 'llm-pi-ai': { subagentEffort: 'low' } }, '2020-01-01T00:00:00.000Z')))
    const second = deferredFile('second.json', JSON.stringify(storedSnapshot({ 'llm-pi-ai': { subagentEffort: 'high' } }, '2026-09-16T12:00:00.000Z')))

    await chooseDeferredFile(view.container, first)
    await chooseDeferredFile(view.container, second)
    // Neither read has resolved, so there is nothing to preview yet.
    expect(view.container.textContent).not.toContain(text('backupPreviewTitle'))

    await releaseRead(second)
    expect(view.container.textContent).toContain(text('backupPreviewTitle'))
    expect(view.container.textContent).toContain('2026-09-16')

    // The earlier, slower read lands last and must change nothing at all.
    await releaseRead(first)
    expect(view.container.textContent).toContain('2026-09-16')
    expect(view.container.textContent).not.toContain('2020-01-01')
    expect(view.container.querySelector('[role="alert"]')).toBeNull()

    act(() => button(view.container, text('backupConfirmImport')).click())
    await settle()

    expect(view.mutate).toHaveBeenCalledWith('llm-pi-ai', [{ op: 'set', path: ['subagentEffort'], value: 'high' }], 4)
  })

  // The failure path installs state too — an alert and no preview — so it needs
  // the same token: a superseded read that failed must not clear the preview the
  // newer read just installed.
  it('ignores a superseded read\'s failure instead of clearing a newer preview', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    const failing = deferredFile('broken.json', '', 'the file could not be read')
    const second = deferredFile('second.json', JSON.stringify(storedSnapshot({ 'llm-pi-ai': { subagentEffort: 'high' } })))

    await chooseDeferredFile(view.container, failing)
    await chooseDeferredFile(view.container, second)
    await releaseRead(second)
    expect(view.container.textContent).toContain(text('backupPreviewTitle'))

    await releaseRead(failing)
    expect(view.container.textContent).toContain(text('backupPreviewTitle'))
    expect(view.container.querySelector('[role="alert"]')).toBeNull()

    // The surviving preview is still the one confirmation would write.
    act(() => button(view.container, text('backupConfirmImport')).click())
    await settle()
    expect(view.mutate).toHaveBeenCalledWith('llm-pi-ai', [{ op: 'set', path: ['subagentEffort'], value: 'high' }], 4)
  })

  it('previews the pre-import auto backup without writing', async () => {
    const view = harness({
      user: { 'dsh-thinking-effort': { autoBackup: { ...storedSnapshot({ 'llm-pi-ai': { subagentEffort: 'high' } }), createdAt: '2026-09-15T08:30:00.000Z' } } },
    })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    act(() => button(view.container, text('backupAutoBackupRestore')).click())
    await settle()

    expect(view.container.textContent).toContain(text('backupSourceAutoBackup'))
    expect(modeSelect(view.container).value).toBe('merge')
    expect(view.mutate).not.toHaveBeenCalled()
  })

  // An editor-side save (model reasoning levels, subagent default, gateway
  // compat) changes the namespaces without remounting this card, so both
  // snapshot actions must describe again instead of trusting the mount read.
  const editedAfterMount = (before: Record<string, Record<string, unknown>>, after: Record<string, Record<string, unknown>>): HarnessOptions => ({ userByCall: [before, after] })
  const off = { 'llm-pi-ai': { subagentEffort: 'off' } }
  const high = { 'llm-pi-ai': { subagentEffort: 'high' } }

  it('exports the freshly described configuration, not the mount-time copy', async () => {
    const view = harness(editedAfterMount(off, high))
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    act(() => button(view.container, text('backupExportCurrent')).click())
    await settle()

    expect(view.describe).toHaveBeenCalledTimes(2)
    expect(view.download).toHaveBeenCalledTimes(1)
    const [, body] = view.download.mock.calls[0] as [string, string]
    const parsed = JSON.parse(body) as { sections: Record<string, unknown> }
    expect(parsed.sections['llm-pi-ai']).toEqual({ subagentEffort: 'high' })
  })

  it('saves a profile from the freshly described configuration, not the mount-time copy', async () => {
    const view = harness(editedAfterMount(off, high))
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    setProfileName(view.container, 'work')
    act(() => button(view.container, text('backupSaveCurrent')).click())
    await settle()

    expect(view.mutate).toHaveBeenCalledWith('dsh-thinking-effort', [
      {
        op: 'set',
        path: ['profiles', 'work'],
        value: expect.objectContaining({ sections: expect.objectContaining({ 'llm-pi-ai': { subagentEffort: 'high' } }) }),
      },
    ], 8)
  })

  it('surfaces a failed describe on export instead of downloading an empty snapshot', async () => {
    const view = harness({ describeError: 'settings unavailable', describeErrorCalls: [1] })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()
    expect(view.container.querySelector('[role="alert"]')).toBeNull()

    act(() => button(view.container, text('backupExportCurrent')).click())
    await settle()

    expect(view.download).not.toHaveBeenCalled()
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('settings unavailable')
  })

  it('exports a fresh snapshot while the settings source is read-only', async () => {
    const view = harness({ ...editedAfterMount(off, high), writable: false })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    const exportButton = button(view.container, text('backupExportCurrent'))
    expect(exportButton.disabled).toBe(false)
    act(() => exportButton.click())
    await settle()

    expect(view.download).toHaveBeenCalledTimes(1)
    const [, body] = view.download.mock.calls[0] as [string, string]
    const parsed = JSON.parse(body) as { sections: Record<string, unknown> }
    expect(parsed.sections['llm-pi-ai']).toEqual({ subagentEffort: 'high' })
  })

  // The Header's OpenCode session switch writes the plugin namespace and saves
  // on toggle, so an editor-side write can bump that namespace without
  // remounting this card. A save or delete that guards the mount-time revision
  // is then refused as a conflict while the fresh read it was built from is
  // perfectly valid.
  it('guards a profile save with the revision read alongside the fresh snapshot', async () => {
    const view = harness({ revisionByCall: [{}, { 'dsh-thinking-effort': 9 }], enforceRevisions: true })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    setProfileName(view.container, 'work')
    act(() => button(view.container, text('backupSaveCurrent')).click())
    await settle()

    expect(view.mutate).toHaveBeenCalledWith('dsh-thinking-effort', [
      { op: 'set', path: ['profiles', 'work'], value: expect.objectContaining({ kind: SNAPSHOT_KIND }) },
    ], 9)
    expect(view.container.querySelector('[role="alert"]')).toBeNull()
    expect(view.container.textContent).toContain(text('backupSavedProfile', { name: 'work' }))
  })

  it('guards a profile delete with the revision read at delete time', async () => {
    const view = harness({
      user: { 'dsh-thinking-effort': { profiles: { work: storedSnapshot({ 'llm-pi-ai': { a: 1 } }) } } },
      revisionByCall: [{}, { 'dsh-thinking-effort': 9 }],
      enforceRevisions: true,
    })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    act(() => button(view.container, text('backupDeleteProfile')).click())
    await settle()
    expect(view.mutate).not.toHaveBeenCalled()

    act(() => button(view.container, text('backupDeleteConfirm')).click())
    await settle()

    expect(view.mutate).toHaveBeenCalledWith('dsh-thinking-effort', [{ op: 'unset', path: ['profiles', 'work'] }], 9)
    expect(view.container.querySelector('[role="alert"]')).toBeNull()
    expect([...view.container.querySelectorAll('button')].some((candidate) => candidate.textContent?.includes(text('backupDeleteConfirm')))).toBe(false)
  })

  it('recovers when describe throws synchronously instead of rejecting', async () => {
    const view = harness({ describeThrow: 'describe exploded', describeThrowCalls: [1] })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    act(() => button(view.container, text('backupExportCurrent')).click())
    await settle()

    expect(view.download).not.toHaveBeenCalled()
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain('describe exploded')

    // The throw must not leave `busy` set: the next click has to still work.
    const retry = button(view.container, text('backupExportCurrent'))
    expect(retry.disabled).toBe(false)
    act(() => retry.click())
    await settle()

    expect(view.download).toHaveBeenCalledTimes(1)
  })

  // The preview summary is the consent surface for a replace, so it must be
  // diffed against the configuration the apply will see: a namespace edited
  // after mount would otherwise have its removals under-reported.
  it('previews the summary against the settings read when the preview opened', async () => {
    const view = harness({
      userByCall: [
        { 'llm-pi-ai': { subagentEffort: 'off' } },
        { 'llm-pi-ai': { subagentEffort: 'off', gateway: 'external' } },
      ],
    })
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    await chooseFile(view.container, new File([JSON.stringify(storedSnapshot({ 'llm-pi-ai': { subagentEffort: 'high' } }))], 'snapshot.json', { type: 'application/json' }))

    const select = modeSelect(view.container)
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    act(() => {
      setter?.call(select, 'replace')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()

    // `gateway` exists only after mount, so a replace removes it: the mount
    // copy reports one removal fewer than the apply will perform.
    expect(view.container.textContent).toContain(text('backupSummary', { added: 0, overwritten: 1, removed: 1 }))
    expect(view.container.textContent).not.toContain(text('backupSummary', { added: 0, overwritten: 1, removed: 0 }))
    expect(view.describe).toHaveBeenCalledTimes(2)
  })

  // An empty plan has two causes and they are not the same sentence. A file whose
  // plugin section holds only the excluded library keys carried no configuration
  // at all, so "already matches this configuration" would claim an equivalence
  // the file never expressed — during a migration, exactly when a user is most
  // likely to meet such a file.
  it('says a library-only file was discarded instead of claiming it already matches', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    const libraryOnly = {
      profiles: { work: storedSnapshot({ 'llm-pi-ai': { a: 1 } }) },
      autoBackup: storedSnapshot({ 'llm-pi-ai': { a: 2 } }),
    }
    await chooseFile(view.container, new File([JSON.stringify(storedSnapshot({ 'dsh-thinking-effort': libraryOnly }))], 'library.json', { type: 'application/json' }))

    expect(view.container.textContent).toContain(text('backupSummaryLibraryOnly'))
    expect(view.container.textContent).not.toContain(text('backupSummaryEmpty'))
    // Nothing is discarded silently either: the file carries no writable op, so
    // the confirmation stays out of reach.
    expect(button(view.container, text('backupConfirmImport')).disabled).toBe(true)
    expect(view.mutate).not.toHaveBeenCalled()
  })

  it('keeps the counts for a file that does carry writable configuration beside those keys', async () => {
    const view = harness()
    cleanup = view.unmount
    await settle()
    act(() => button(view.container, text('backupCardTitle')).click())
    await settle()

    await chooseFile(view.container, new File([JSON.stringify(storedSnapshot({
      'dsh-thinking-effort': { profiles: { work: storedSnapshot({ 'llm-pi-ai': { a: 1 } }) } },
      'llm-pi-ai': { subagentEffort: 'high' },
    }))], 'mixed.json', { type: 'application/json' }))

    expect(view.container.textContent).toContain(text('backupSummary', { added: 0, overwritten: 1, removed: 0 }))
    expect(view.container.textContent).not.toContain(text('backupSummaryLibraryOnly'))
    expect(button(view.container, text('backupConfirmImport')).disabled).toBe(false)
  })
})