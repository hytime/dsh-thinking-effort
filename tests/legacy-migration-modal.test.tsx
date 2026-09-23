// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LegacyMigrationModal } from '../src/client/components/LegacyMigrationModal.js'
import { zh } from '../src/client/locales.js'
import type { SettingsApi, SettingsOp } from '../src/client/types.js'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const text = (key: string, params?: Record<string, unknown>): string => {
  const value = (zh as Record<string, string>)[key] ?? key
  return value.replace(/\{(\w+)\}/g, (_match: string, name: string) => String(params?.[name] ?? `{${name}}`))
}

const CANDIDATES = [
  { path: ['subagentEffort'], value: 'off', source: 'llm-pi-ai' },
  { path: ['opencodeSession', 'providers', 'sub2api', 'models', 'deepseek-flash'], value: true, source: 'settings.yaml.imported' },
]

/**
 * A settings bridge holding one section whose user layer carries the control
 * object. `refuseMutate` models the CLIENT-side refusal (`ok: false`);
 * `vanishAfterDecision` models a host that accepts the write and then stops
 * publishing the section, so nothing can ever confirm it.
 */
function bridge(
  user: Record<string, unknown>,
  options: { refuseMutate?: boolean; vanishAfterDecision?: boolean } = {},
) {
  const writes: Array<{ ns: string; ops: readonly SettingsOp[] }> = []
  let vanished = false
  const settings: SettingsApi = {
    externalLanguages: false,
    compatibilityProfile: 'modern',
    describe: async () => ({
      ok: true as const,
      value: {
        namespaces: vanished ? [] : [{ ns: 'thinking-effort', revision: 0, value: user, user }],
      },
    }),
    mutate: async (ns, ops) => {
      if (options.refuseMutate === true) return { ok: false as const, error: { message: 'refused' } }
      writes.push({ ns, ops })
      if (options.vanishAfterDecision === true) vanished = true
      return { ok: true as const, value: { ns, revision: 1, value: user, user } }
    },
  }
  return { settings, writes }
}

let root: Root | undefined
let container: HTMLDivElement | undefined

function mount(settings: SettingsApi) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(<LegacyMigrationModal settings={settings} t={text} />)
  })
  return container
}

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

const flush = async (): Promise<void> => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
}

describe('LegacyMigrationModal', () => {
  it('renders nothing when no migration is pending', async () => {
    const { settings } = bridge({ legacyMigration: { pending: false, candidates: [] } })
    const element = mount(settings)
    await flush()
    expect(element.textContent).toBe('')
  })

  it('lists every pending candidate with its provenance', async () => {
    const { settings } = bridge({ legacyMigration: { pending: true, candidates: CANDIDATES } })
    const element = mount(settings)
    await flush()
    expect(element.textContent).toContain(text('legacyMigrationTitle'))
    expect(element.textContent).toContain('subagentEffort')
    expect(element.textContent).toContain('opencodeSession.providers.sub2api.models.deepseek-flash')
    expect(element.querySelectorAll('[data-testid="legacy-candidate"]').length).toBe(2)
  })

  it('writes decision=migrate when the user accepts', async () => {
    const { settings, writes } = bridge({ legacyMigration: { pending: true, candidates: CANDIDATES } })
    const element = mount(settings)
    await flush()
    const button = element.querySelector<HTMLButtonElement>('[data-testid="legacy-apply"]')
    await act(async () => { button?.click() })
    await flush()
    // Exactly one write: a second one (the candidates, or a value) would mean the
    // Client is doing the host's job.
    expect(writes.length).toBe(1)
    expect(writes[0]?.ops).toEqual([{ op: 'set', path: ['legacyMigration', 'decision'], value: 'migrate' }])
  })

  it('writes decision=dismiss when the user opts out', async () => {
    const { settings, writes } = bridge({ legacyMigration: { pending: true, candidates: CANDIDATES } })
    const element = mount(settings)
    await flush()
    await act(async () => {
      element.querySelector<HTMLButtonElement>('[data-testid="legacy-dismiss"]')?.click()
    })
    await flush()
    expect(writes.length).toBe(1)
    expect(writes[0]?.ops).toEqual([{ op: 'set', path: ['legacyMigration', 'decision'], value: 'dismiss' }])
  })

  it('writes nothing when the user postpones', async () => {
    const { settings, writes } = bridge({ legacyMigration: { pending: true, candidates: CANDIDATES } })
    const element = mount(settings)
    await flush()
    await act(async () => {
      element.querySelector<HTMLButtonElement>('[data-testid="legacy-later"]')?.click()
    })
    await flush()
    expect(writes).toEqual([])
    expect(element.textContent).toBe('')
  })

  it('shows a refusal from the host and stays mounted', async () => {
    const { settings } = bridge(
      { legacyMigration: { pending: true, candidates: CANDIDATES } },
      { refuseMutate: true },
    )
    const element = mount(settings)
    await flush()
    await act(async () => {
      element.querySelector<HTMLButtonElement>('[data-testid="legacy-apply"]')?.click()
    })
    await flush()
    expect(element.textContent).toContain('refused')
    expect(element.querySelector('[data-testid="legacy-apply"]')).not.toBeNull()
  })

  it("shows the host's own failure and stays actionable instead of sitting busy", async () => {
    // When a write is refused the HOST keeps `pending: true` with the candidates
    // intact and records `lastResult: 'failed:<reason>'`, precisely so the prompt
    // can show the reason and offer a retry. A prompt that tests `pending` first
    // never reaches that state: the reason stays hidden and every control is
    // disabled for the rest of the page load.
    const { settings } = bridge({
      legacyMigration: {
        pending: true,
        candidates: CANDIDATES,
        lastResult: 'failed: HMR transactions cannot be nested',
      },
    })
    const element = mount(settings)
    await flush()
    expect(element.textContent).toContain('HMR transactions cannot be nested')
    expect(element.querySelector<HTMLButtonElement>('[data-testid="legacy-apply"]')?.disabled).toBe(false)
  })

  it('becomes actionable when the host never confirms the write', async () => {
    vi.useFakeTimers()
    try {
      const { settings, writes } = bridge(
        { legacyMigration: { pending: true, candidates: CANDIDATES } },
        { vanishAfterDecision: true },
      )
      const element = mount(settings)
      await act(async () => { await Promise.resolve() })
      await act(async () => {
        element.querySelector<HTMLButtonElement>('[data-testid="legacy-apply"]')?.click()
      })
      await act(async () => { await Promise.resolve() })
      expect(writes.length).toBe(1)

      // The section stops being published, so nothing will ever confirm the
      // write. The attempt budget is what has to end the wait.
      await act(async () => { vi.advanceTimersByTime(120_000) })
      await act(async () => { await Promise.resolve() })

      expect(element.textContent).toContain(text('legacyMigrationTimedOut'))
      expect(element.querySelector<HTMLButtonElement>('[data-testid="legacy-apply"]')?.disabled).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
