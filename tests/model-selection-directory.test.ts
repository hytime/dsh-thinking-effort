import { describe, expect, it } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { createSelectionDirectory } from '../src/compat/model-selection-directory.js'
import type { ModelDirectoryState, ModelSelection } from '../src/client/thinking-slider/slider.js'

const saved: ModelSelection = { provider: 'custom', model: 'session', reasoningEffort: 'high' }
const fallback: ModelSelection = { provider: 'custom', model: 'default', reasoningEffort: 'medium' }
function fixture(next: ModelSelection | null = saved) {
  const projected = createSnapshotStore<unknown>({ lastUsed: null, next })
  const store = createSnapshotStore<{ -readonly [Key in keyof ModelDirectoryState]: ModelDirectoryState[Key] }>({ current: next ?? fallback, pending: null, routable: true,
    groups: [{ id: 'custom', name: 'Custom', models: [
      { id: 'session', name: 'Session', reasoning: { efforts: [{ id: 'off', name: 'Off' }, { id: 'high', name: 'High' }] } },
      { id: 'default', name: 'Default', reasoning: { efforts: [{ id: 'medium', name: 'Medium' }] } },
    ] }], failures: [], status: 'ready', error: null })
  let settle: (value: unknown) => void = () => {}
  const submitted: ModelSelection[] = []
  const instance = { store, load: async () => store.getSnapshot(), select: (selection: ModelSelection) => {
    submitted.push(selection)
    store.update(s => { s.status = 'selecting'; s.pending = selection })
    return new Promise(resolve => { settle = resolve })
  } }
  const face = createSelectionDirectory(instance, projected)
  const gap = (value: unknown = { lastUsed: null, next: null }) => {
    projected.set(value)
    store.update(s => { s.current = fallback; s.status = 'ready' })
  }
  const confirm = (selection: ModelSelection) => {
    projected.set({ lastUsed: null, next: selection })
    store.update(s => { s.current = selection; s.pending = null; s.status = 'ready' })
  }
  return { face, instance, store, projected, gap, confirm, submitted, get settle() { return settle } }
}

describe('session selection directory', () => {
  it.each([{ next: null, lastUsed: null }, undefined])('retains confirmed selection through a projection gap %s', value => {
    const f = fixture(); f.projected.set(value); f.store.update(s => { s.current = fallback })
    expect(f.face.directory.getSnapshot().current).toEqual(saved)
    expect(f.face.directory.getSnapshot().routable).toBe(true)
    expect(f.face.directory.getSnapshot()).toBe(f.face.directory.getSnapshot())
    f.face.dispose()
  })
  it('keeps the initial catalog default until a session selection exists', () => {
    const f = fixture(null)
    expect(f.face.directory.getSnapshot().current).toEqual(fallback)
    f.confirm(saved); f.gap()
    expect(f.face.directory.getSnapshot().current).toEqual(saved)
    f.face.dispose()
  })
  it('accepts external model and effort changes immediately, including the default model', () => {
    const f = fixture(); f.confirm(fallback)
    expect(f.face.directory.getSnapshot().current).toEqual(fallback)
    f.confirm({ ...fallback, reasoningEffort: 'high' })
    expect(f.face.directory.getSnapshot().current?.reasoningEffort).toBe('high')
    f.face.dispose()
  })
  it('rolls back a fulfilled Remote failure after displaying the submitted model', async () => {
    const f = fixture(); const result = f.face.select(fallback)
    expect(f.face.directory.getSnapshot().current).toEqual(fallback)
    f.store.update(s => { s.status = 'error'; s.pending = null; s.error = 'Denied' })
    f.settle({ ok: false, error: { message: 'Denied' } })
    expect(await result).toBe(false)
    expect(f.face.directory.getSnapshot().current).toEqual(saved)
    expect(f.face.directory.getSnapshot().error).toBe('Denied')
    f.face.dispose()
  })
  it('retains an accepted selection while its projection confirmation is missing', async () => {
    const f = fixture(); const result = f.face.select(fallback)
    f.store.update(s => { s.status = 'ready'; s.pending = null })
    f.settle({ ok: true }); expect(await result).toBe(true)
    f.gap()
    expect(f.face.directory.getSnapshot().current).toEqual(fallback)
    const external = { ...saved, reasoningEffort: 'off' }
    f.confirm(external)
    expect(f.face.directory.getSnapshot().current).toEqual(external)
    f.face.dispose()
  })
  it('does not let an older completion replace the newest selection', async () => {
    const f = fixture(); const oldResult = f.face.select(fallback)
    const settleOld = f.settle
    const newer = { ...saved, reasoningEffort: 'off' }
    const newResult = f.face.select(newer)
    f.confirm(newer); f.settle({ ok: true }); await newResult
    settleOld({ ok: true }); expect(await oldResult).toBe(false)
    expect(f.face.directory.getSnapshot().current).toEqual(newer)
    f.face.dispose()
  })
  it('keeps an unavailable confirmed model instead of silently selecting the default', () => {
    const f = fixture(); f.store.update(s => { s.groups = []; s.routable = false }); f.gap()
    expect(f.face.directory.getSnapshot().current).toEqual(saved)
    expect(f.face.directory.getSnapshot().routable).toBe(false)
    f.face.dispose()
  })
  it('notifies consumers when the projection changes before the directory', () => {
    const f = fixture(); const seen: Array<ModelSelection | null> = []
    const unsubscribe = f.face.directory.subscribe(() => seen.push(f.face.directory.getSnapshot().current))
    f.projected.set({ next: fallback, lastUsed: null })
    expect(seen.at(-1)).toEqual(fallback)
    unsubscribe(); f.face.dispose()
  })
  it('clears retained state on reset and ignores outstanding selections', async () => {
    const f = fixture(); const result = f.face.select(fallback)
    f.projected.set({ next: null, lastUsed: null }); f.store.update(s => { s.current = null; s.pending = null; s.status = 'loading'; s.groups = [] })
    f.face.reset()
    expect(f.face.directory.getSnapshot().current).toBeNull()
    f.settle({ ok: true }); expect(await result).toBe(false)
    f.confirm(fallback)
    expect(f.face.directory.getSnapshot().current).toEqual(fallback)
    f.face.dispose()
  })
  it('lets a newer external pending selection supersede a local operation', async () => {
    const f = fixture(); const oldResult = f.face.select(fallback)
    const external = { ...saved, reasoningEffort: 'off' }
    f.store.update(s => { s.pending = external; s.status = 'selecting' })
    expect(f.face.directory.getSnapshot().current).toEqual(external)
    f.confirm(external); f.settle({ ok: true })
    expect(await oldResult).toBe(false)
    expect(f.face.directory.getSnapshot().current).toEqual(external)
    f.face.dispose()
  })
  it('rolls back a rejected selection without dropping the confirmed model', async () => {
    const f = fixture()
    f.instance.select = async (selection) => {
      f.store.update(s => { s.status = 'selecting'; s.pending = selection })
      throw new Error('Disconnected')
    }
    expect(await f.face.select(fallback)).toBe(false)
    expect(f.face.directory.getSnapshot().current).toEqual(saved)
    expect(f.face.directory.getSnapshot()).toMatchObject({ pending: null, status: 'error', error: 'Disconnected' })
    f.face.dispose()
  })
  it('does not replace a newer projected selection when a local response arrives', async () => {
    const f = fixture(); const result = f.face.select(fallback)
    const external = { ...saved, reasoningEffort: 'off' }
    f.confirm(external); f.settle({ ok: true }); await result
    expect(f.face.directory.getSnapshot().current).toEqual(external)
    f.face.dispose()
  })
  it('retains an accepted selection when only lastUsed changes during its request', async () => {
    const f = fixture(); const result = f.face.select(fallback)
    f.projected.set({ next: { ...saved }, lastUsed: saved })
    f.store.update(s => { s.status = 'ready'; s.pending = null })
    f.settle({ ok: true }); expect(await result).toBe(true)
    // A later frame repeating the pre-acceptance value is indistinguishable
    // from the stale echo already handled above, so the accepted value wins.
    f.projected.set({ next: { ...saved }, lastUsed: fallback })
    expect(f.face.directory.getSnapshot().current).toEqual(fallback)
    f.gap()
    expect(f.face.directory.getSnapshot().current).toEqual(fallback)
    f.face.dispose()
  })
  it('immediately shows a new external projection even while the old pending is retained', async () => {
    const f = fixture(); const result = f.face.select(fallback)
    const external = { ...saved, reasoningEffort: 'off' }
    f.projected.set({ next: external, lastUsed: null })
    f.store.update(s => { s.current = external })
    expect(f.store.getSnapshot().pending).toEqual(fallback)
    expect(f.face.directory.getSnapshot().current).toEqual(external)
    f.settle({ ok: true }); expect(await result).toBe(false)
    expect(f.face.directory.getSnapshot().current).toEqual(external)
    f.face.dispose()
  })
  it('clears a rejected selection once the host finishes its own failed operation', async () => {
    const f = fixture()
    f.instance.select = async (selection) => {
      f.store.update(s => { s.status = 'selecting'; s.pending = selection })
      throw new Error('Disconnected')
    }
    expect(await f.face.select(fallback)).toBe(false)
    expect(f.face.directory.getSnapshot()).toMatchObject({ status: 'error', error: 'Disconnected', pending: null })
    f.store.update(s => { s.pending = null; s.status = 'ready'; s.error = null })
    expect(f.face.directory.getSnapshot()).toMatchObject({ status: 'ready', error: null, current: saved })
    f.face.dispose()
  })
  it('ignores malformed projection values while keeping status and catalog updates', () => {
    const f = fixture()
    f.gap({ next: { provider: 'p', model: 42 } })
    f.store.update(s => { s.status = 'loading'; s.routable = null; s.error = 'Loading' })
    expect(f.face.directory.getSnapshot()).toMatchObject({ current: saved, status: 'loading', routable: null, error: 'Loading' })
    f.face.dispose()
  })
  it('releases source subscriptions on disposal', () => {
    const f = fixture(); let changes = 0
    f.face.directory.subscribe(() => { changes++ })
    const snapshot = f.face.directory.getSnapshot()
    f.face.dispose(); f.confirm(fallback)
    expect(changes).toBe(0)
    expect(f.face.directory.getSnapshot()).toBe(snapshot)
  })
})
