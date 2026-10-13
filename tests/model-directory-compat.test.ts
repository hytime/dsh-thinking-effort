import { describe, expect, it, vi } from 'vitest'
import { asModelDirectories, createModelDirectoryFaceResolver, modelDirectoryCompatibility } from '../src/compat/model-directory.js'
import type { ClientContext } from '../src/client/types.js'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { Context } from '@deepseek-ai/cordis'
import type { ModelDirectoryState } from '../src/client/thinking-slider/slider.js'

function contextWith(services: Record<string, unknown>): ClientContext {
  return { get: vi.fn((name: string) => services[name]) } as unknown as ClientContext
}

describe('model-directory compatibility layer', () => {
  it('uses the public session projection and disposes retained state with its session scope', () => {
    const saved = { provider: 'p', model: 'session' }
    const fallback = { provider: 'p', model: 'default' }
    const projected = createSnapshotStore<unknown>({ next: saved, lastUsed: null })
    const store = createSnapshotStore<{ -readonly [Key in keyof ModelDirectoryState]: ModelDirectoryState[Key] }>({ current: saved, pending: null, routable: true, groups: [], failures: [], status: 'ready', error: null })
    const instance = { store, load: async () => {}, select: async () => ({ ok: true }) }
    const disposers: Array<() => void> = []
    let reset: () => void = () => {}
    const owner = { effect: (callback: () => () => void) => { disposers.push(callback()) } }
    const binding = { session: { projections: { faceOf: (key: string) => key === 'modelSelection' ? projected : undefined } } }
    const context = {
      get: () => ({ binding: () => binding, scope: () => owner }),
      effect: owner.effect,
      on: (_event: string, callback: () => void) => { reset = callback },
    } as unknown as ClientContext
    const resolve = createModelDirectoryFaceResolver(context, { directoryFor: () => instance })
    const face = resolve('one')
    expect(resolve('one')).toBe(face)
    projected.set({ next: null, lastUsed: null }); store.update(s => { s.current = fallback })
    expect(face.directory.getSnapshot().current).toEqual(saved)
    reset()
    expect(face.directory.getSnapshot().current).toEqual(fallback)
    projected.set({ next: saved, lastUsed: null })
    expect(face.directory.getSnapshot().current).toEqual(saved)
    for (const dispose of disposers) dispose()
    const snapshot = face.directory.getSnapshot()
    projected.set({ next: fallback, lastUsed: null })
    expect(face.directory.getSnapshot()).toBe(snapshot)
  })
  it('does not carry the old selection into a replacement session binding', () => {
    const store = createSnapshotStore<{ -readonly [Key in keyof ModelDirectoryState]: ModelDirectoryState[Key] }>({ current: { provider: 'p', model: 'default' }, pending: null, routable: true, groups: [], failures: [], status: 'ready', error: null })
    const instance = { store, load: async () => {}, select: async () => ({ ok: true }) }
    const disposers: Array<() => void> = []
    const owner = { effect: (callback: () => () => void) => { disposers.push(callback()) } }
    const projection = createSnapshotStore<unknown>({ next: { provider: 'p', model: 'old' }, lastUsed: null })
    let binding = { session: { projections: { faceOf: () => projection } } }
    const context = { get: () => ({ binding: () => binding, scope: () => owner }), effect: owner.effect, on: () => {} } as unknown as ClientContext
    const resolve = createModelDirectoryFaceResolver(context, { directoryFor: () => instance })
    expect(resolve('one').directory.getSnapshot().current?.model).toBe('old')
    const fresh = createSnapshotStore<unknown>({ next: null, lastUsed: null })
    binding = { session: { projections: { faceOf: () => fresh } } }
    expect(resolve('one').directory.getSnapshot().current?.model).toBe('default')
    for (const dispose of disposers) dispose()
  })
  it('releases session-owned cleanup effects when the plugin unloads or a directory is replaced', () => {
    const owner = new Context()
    const count = () => owner.fiber.getEffects().length
    const baseline = count()
    const store = createSnapshotStore<ModelDirectoryState>({ current: null, routable: null, groups: [], failures: [], status: 'loading', error: null })
    const projected = createSnapshotStore<unknown>({ next: null, lastUsed: null })
    const binding = { session: { projections: { faceOf: () => projected } } }
    for (let cycle = 0; cycle < 3; cycle++) {
      let cleanup = () => {}
      let instance = { store, load: async () => {}, select: async () => ({ ok: true }) }
      const context = { get: () => ({ binding: () => binding, scope: () => owner }), effect: (callback: () => () => void) => { cleanup = callback() }, on: () => {} } as unknown as ClientContext
      const resolve = createModelDirectoryFaceResolver(context, { directoryFor: () => instance })
      resolve('one')
      expect(count()).toBe(baseline + 1)
      instance = { ...instance }
      resolve('one')
      expect(count()).toBe(baseline + 1)
      cleanup()
      expect(count()).toBe(baseline)
    }
  })
  it('degrades to the plain directory when the session scope exposes no effect', () => {
    const store = { getSnapshot: () => ({} as ModelDirectoryState), subscribe: () => () => {} }
    const instance = { store, load: async () => {}, select: async () => ({ ok: true }) }
    const projected = createSnapshotStore<unknown>({ next: { provider: 'p', model: 'session' }, lastUsed: null })
    const binding = { session: { projections: { faceOf: () => projected } } }
    for (const scope of [null, {}, { effect: true }]) {
      const context = { get: () => ({ binding: () => binding, scope: () => scope }), effect: () => () => {}, on: () => {} } as unknown as ClientContext
      const resolve = createModelDirectoryFaceResolver(context, { directoryFor: () => instance })
      let face: { directory: unknown } | undefined
      expect(() => { face = resolve('one') }).not.toThrow()
      expect(face?.directory).toBe(store)
    }
  })
  it('serves the plain directory when a closing session refuses the cleanup effect', () => {
    const store = { getSnapshot: () => ({ groups: [], failures: [], status: 'ready', current: null, pending: null, routable: null, error: null } as ModelDirectoryState), subscribe: () => () => {} }
    const instance = { store, load: async () => {}, select: async () => ({ ok: true }) }
    const projected = createSnapshotStore<unknown>({ next: { provider: 'p', model: 'session' }, lastUsed: null })
    const binding = { session: { projections: { faceOf: () => projected } } }
    const owner = { effect: () => { throw new Error('cannot create effect on inactive context') } }
    const context = { get: () => ({ binding: () => binding, scope: () => owner }), effect: () => () => {}, on: () => {} } as unknown as ClientContext
    const resolve = createModelDirectoryFaceResolver(context, { directoryFor: () => instance })
    let face: { directory: unknown } | undefined
    expect(() => { face = resolve('one') }).not.toThrow()
    expect(face?.directory).toBe(store)
  })
  it('preserves the store identity on hosts without public projection access', () => {
    const instance = { store: { getSnapshot: () => ({} as ModelDirectoryState), subscribe: () => () => {} }, load: async () => {}, select: async () => {} }
    const resolve = createModelDirectoryFaceResolver(contextWith({ sessions: {} }), { directoryFor: () => instance })
    expect(resolve('one').directory).toBe(instance.store)
  })

  it('selects the modern remote.session generation by service shape', () => {
    const context = contextWith({ remote: {}, 'remote.session': { modelCatalog: vi.fn() } })
    expect(modelDirectoryCompatibility(context).generation).toBe('session')
    expect(modelDirectoryCompatibility(context).inject).toContain('remote.session')
    expect(modelDirectoryCompatibility(context).inject).toContain('sessions')
  })

  it('selects the connection generation without declaring absent remote.session', () => {
    const context = contextWith({ remote: {}, connection: {} })
    const compatibility = modelDirectoryCompatibility(context)
    expect(compatibility.generation).toBe('connection')
    expect(compatibility.inject).toContain('connection')
    expect(compatibility.inject).not.toContain('remote.session')
  })

  it('narrows only a service exposing directoryFor', () => {
    expect(asModelDirectories(undefined)).toBeUndefined()
    expect(asModelDirectories({})).toBeUndefined()
    expect(asModelDirectories({ directoryFor: () => ({}) })).toEqual(expect.objectContaining({ directoryFor: expect.any(Function) }))
  })
})
