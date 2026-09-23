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
 * publishing the section, so nothing can ever confirm it; `settleAfterReads`
 * models the real race — the host takes a few reads to apply, so the reads
 * immediately after the click still see `pending: true`.
 */
function bridge(
  user: Record<string, unknown>,
  options: { refuseMutate?: boolean; vanishAfterDecision?: boolean; settleAfterReads?: number } = {},
) {
  const writes: Array<{ ns: string; ops: readonly SettingsOp[] }> = []
  let vanished = false
  let decision: 'migrate' | 'dismiss' | undefined
  let readsSinceDecision = 0

  /** What the host publishes right now, lag included. */
  const published = (): Record<string, unknown> => {
    if (decision === undefined) return user
    readsSinceDecision += 1
    if (readsSinceDecision <= (options.settleAfterReads ?? 0)) return user
    return {
      legacyMigration: {
        pending: false,
        candidates: [],
        lastResult: decision === 'migrate' ? 'applied' : 'dismissed',
      },
    }
  }

  const settings: SettingsApi = {
    externalLanguages: false,
    compatibilityProfile: 'modern',
    describe: async () => {
      const state = published()
      return {
        ok: true as const,
        value: {
          namespaces: vanished ? [] : [{ ns: 'thinking-effort', revision: 0, value: state, user: state }],
        },
      }
    },
    mutate: async (ns, ops) => {
      if (options.refuseMutate === true) return { ok: false as const, error: { message: 'refused' } }
      writes.push({ ns, ops })
      const value = ops[0]?.value
      if (value === 'migrate' || value === 'dismiss') decision = value
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

  it('renders its actions with the plugin button primitive, not bare buttons', async () => {
    const { settings } = bridge({ legacyMigration: { pending: true, candidates: CANDIDATES } })
    const element = mount(settings)
    await flush()
    const apply = element.querySelector<HTMLButtonElement>('[data-testid="legacy-apply"]')
    const dismiss = element.querySelector<HTMLButtonElement>('[data-testid="legacy-dismiss"]')
    const later = element.querySelector<HTMLButtonElement>('[data-testid="legacy-later"]')
    // A bare <button> carries none of the primitive's own metrics; this is the
    // regression that shipped once and showed up as three default-styled
    // controls under a card that was otherwise fully themed.
    for (const button of [apply, dismiss, later]) {
      expect(button?.style.height).toBe('28px')
      expect(button?.style.borderRadius).toBe('8px')
    }
    // The hierarchy the question rests on: accepting is the filled action,
    // refusing is an ordinary one, postponing is borderless.
    expect(apply?.style.backgroundColor).not.toBe('')
    expect(apply?.style.backgroundColor).not.toBe(dismiss?.style.backgroundColor)
    expect(later?.style.backgroundColor).toBe('transparent')
    expect(later?.style.borderColor).toBe('transparent')
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

  it('stays submitted while the host has not applied yet, and closes once it has', async () => {
    // The race a real click loses: the read that runs immediately after the
    // click still sees `pending: true` with the candidates intact, because the
    // host has not acted yet. A prompt that reopens on that read strands itself
    // at `asking` — not a polling phase — so it never observes the result: it
    // stayed on screen after a successful migration, buttons live, candidates
    // stale. Seen end to end against a real 0.1.7 host before this case existed.
    vi.useFakeTimers()
    try {
      const { settings, writes } = bridge(
        { legacyMigration: { pending: true, candidates: CANDIDATES } },
        { settleAfterReads: 2 },
      )
      const element = mount(settings)
      await act(async () => { await Promise.resolve() })
      const apply = (): HTMLButtonElement | null =>
        element.querySelector<HTMLButtonElement>('[data-testid="legacy-apply"]')
      expect(apply()?.disabled).toBe(false)

      await act(async () => { apply()?.click() })
      await act(async () => { await Promise.resolve() })
      expect(writes.length).toBe(1)

      // Reads still report the pre-apply state. The prompt must keep waiting
      // (controls disabled) rather than reopen as a question.
      expect(apply()?.disabled).toBe(true)

      await act(async () => { vi.advanceTimersByTime(10_000) })
      await act(async () => { await Promise.resolve() })

      // The host has now applied: the prompt has nothing left to ask.
      expect(element.textContent).toBe('')
    } finally {
      vi.useRealTimers()
    }
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
