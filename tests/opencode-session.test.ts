import { describe, expect, it } from 'vitest'
import {
  isOpenCodeSessionEnabled,
  modelPath,
  OPENCODE_SESSION_HEADER,
  OPENCODE_SESSION_NAMESPACE,
} from '../src/compat/opencode-session.ts'
import { openCodeSessionOp } from '../src/client/model-header-ops.ts'

const enabled = {
  opencodeSession: {
    providers: {
      'opencode-go': {
        models: {
          'deepseek-v4-flash': true,
        },
      },
    },
  },
}

describe('OpenCode session settings', () => {
  it('matches an exact provider/model pair', () => {
    expect(isOpenCodeSessionEnabled(undefined, 'opencode-go', 'deepseek-v4-flash')).toBe(false)
    expect(isOpenCodeSessionEnabled(enabled, 'opencode-go', 'deepseek-v4-flash')).toBe(true)
    expect(isOpenCodeSessionEnabled(enabled, 'opencode-go', 'other-model')).toBe(false)
    expect(isOpenCodeSessionEnabled(enabled, 'opencode', 'deepseek-v4-flash')).toBe(false)
  })

  it('fails closed for malformed or inherited settings', () => {
    const inheritedProviders = Object.create({
      'opencode-go': { models: { 'deepseek-v4-flash': true } },
    }) as Record<string, unknown>
    const inherited = { opencodeSession: { providers: inheritedProviders } }

    expect(isOpenCodeSessionEnabled(inherited, 'opencode-go', 'deepseek-v4-flash')).toBe(false)
    expect(isOpenCodeSessionEnabled({ opencodeSession: { providers: [] } }, 'opencode-go', 'deepseek-v4-flash')).toBe(false)
    expect(isOpenCodeSessionEnabled({ opencodeSession: { providers: { 'opencode-go': { models: { 'deepseek-v4-flash': 'true' } } } } }, 'opencode-go', 'deepseek-v4-flash')).toBe(false)
    expect(isOpenCodeSessionEnabled({ opencodeSession: { providers: { 'opencode-go': { models: { 'deepseek-v4-flash': false } } } } }, 'opencode-go', 'deepseek-v4-flash')).toBe(false)
    expect(isOpenCodeSessionEnabled(enabled, '', 'deepseek-v4-flash')).toBe(false)
    expect(isOpenCodeSessionEnabled(enabled, 'opencode-go', '')).toBe(false)
  })

  it('builds a path with model as an independent segment', () => {
    expect(modelPath('opencode-go', 'deepseek-v4-flash')).toEqual([
      'opencodeSession', 'providers', 'opencode-go', 'models', 'deepseek-v4-flash',
    ])
    expect(modelPath('', 'model')).toBeUndefined()
    expect(modelPath('route', '')).toBeUndefined()
  })

  it('exports the namespace and Header constants', () => {
    expect(OPENCODE_SESSION_NAMESPACE).toBe('dsh-thinking-effort')
    expect(OPENCODE_SESSION_HEADER).toBe('x-opencode-session')
  })
})

describe('OpenCode session Settings operations', () => {
  it('sets the exact model path when enabled', () => {
    expect(openCodeSessionOp('opencode-go', 'deepseek-v4-flash', true)).toEqual({
      op: 'set',
      path: ['opencodeSession', 'providers', 'opencode-go', 'models', 'deepseek-v4-flash'],
      value: true,
    })
  })

  it('unsets the exact model path when disabled', () => {
    expect(openCodeSessionOp('opencode-go', 'deepseek-v4-flash', false)).toEqual({
      op: 'unset',
      path: ['opencodeSession', 'providers', 'opencode-go', 'models', 'deepseek-v4-flash'],
    })
  })

  it('does not create operations for an empty route or model', () => {
    expect(openCodeSessionOp('', 'model', true)).toBeUndefined()
    expect(openCodeSessionOp('route', '', true)).toBeUndefined()
  })
})
