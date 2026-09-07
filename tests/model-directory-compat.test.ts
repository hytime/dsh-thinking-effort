import { describe, expect, it, vi } from 'vitest'
import { asModelDirectories, modelDirectoryCompatibility } from '../src/compat/model-directory.js'
import type { ClientContext } from '../src/client/types.js'

function contextWith(services: Record<string, unknown>): ClientContext {
  return { get: vi.fn((name: string) => services[name]) } as unknown as ClientContext
}

describe('model-directory compatibility layer', () => {
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
