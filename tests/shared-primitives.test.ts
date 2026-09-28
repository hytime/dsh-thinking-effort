import { describe, expect, it } from 'vitest'
import { isUnknownRecord } from '../src/shared/guards.js'
import {
  ALL_LEVELS,
  DEFAULT_LEVELS,
  FORMAT_INVALID_POLICIES,
  FORMAT_MODES,
  FORMAT_TIMES,
  LLM_PI_AI_NS,
  LOG_PREFIX,
  PLUGIN_ENTRY_ID,
  PLUGIN_NS,
  SNAPSHOT_KIND,
} from '../src/shared/constants.js'
import { isSettingsConflict } from '../src/shared/conflict.js'

describe('shared guards', () => {
  it('accepts plain objects and rejects everything else', () => {
    expect(isUnknownRecord({})).toBe(true)
    expect(isUnknownRecord({ a: 1 })).toBe(true)
    expect(isUnknownRecord(Object.create(null))).toBe(true)
    expect(isUnknownRecord([])).toBe(false)
    expect(isUnknownRecord(null)).toBe(false)
    expect(isUnknownRecord(undefined)).toBe(false)
    expect(isUnknownRecord('x')).toBe(false)
    expect(isUnknownRecord(1)).toBe(false)
    expect(isUnknownRecord(true)).toBe(false)
  })
})

describe('shared constants', () => {
  it('pins each identifier to its single spelling', () => {
    expect(LLM_PI_AI_NS).toBe('llm-pi-ai')
    expect(PLUGIN_NS).toBe('dsh-thinking-effort')
    expect(PLUGIN_ENTRY_ID).toBe('thinking-effort')
    expect(LOG_PREFIX).toBe('[@hytime/dsh-thinking-effort]')
    expect(SNAPSHOT_KIND).toBe('dsh-thinking-effort/config-snapshot')
  })

  it('keeps the reasoning level tables and format vocabularies', () => {
    expect([...ALL_LEVELS]).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
    expect(DEFAULT_LEVELS).toEqual({ off: null, high: 'high', max: 'max' })
    expect([...FORMAT_MODES]).toEqual(['ses-derive', 'passthrough', 'template', 'expression', 'script'])
    expect([...FORMAT_TIMES]).toEqual(['firstUse', 'hash'])
    expect([...FORMAT_INVALID_POLICIES]).toEqual(['warn', 'drop', 'send'])
  })
})

describe('shared conflict predicate', () => {
  it('accepts every spelling the two transports produce', () => {
    expect(isSettingsConflict({ code: 'settings/conflict' })).toBe(true)
    expect(isSettingsConflict({ code: 'SETTINGS_CONFLICT' })).toBe(true)
    expect(isSettingsConflict({ message: 'settings namespace "x" changed since it was read (expected revision 1, now 2)' })).toBe(true)
    expect(isSettingsConflict(new Error('config conflict'))).toBe(true)
  })

  it('rejects unrelated failures and non-objects', () => {
    expect(isSettingsConflict({ code: 'settings/rejected', message: 'bad value' })).toBe(false)
    expect(isSettingsConflict(null)).toBe(false)
    expect(isSettingsConflict('conflict')).toBe(false)
  })
})
