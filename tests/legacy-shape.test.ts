import { describe, expect, it } from 'vitest'
import { LEGACY_LLM_SHAPE, LEGACY_OWN_SHAPE, leavesOf } from '../src/host/legacy-shape.ts'

describe('legacy shape walker', () => {
  it('emits the plugin schema leaves an old own-section states', () => {
    const section = {
      subagentEffort: 'off',
      opencodeSession: {
        providers: { sub2api: { models: { 'deepseek-flash': true } } },
        format: { mode: 'template', template: 'ses_{hex12}' },
        userAgent: { value: 'ua/1', providers: { p: { enabled: true, models: { m: false } } } },
      },
    }
    expect(leavesOf(LEGACY_OWN_SHAPE, section).sort((a, b) => a.path.join('.').localeCompare(b.path.join('.')))).toEqual([
      { path: ['opencodeSession', 'format', 'mode'], value: 'template' },
      { path: ['opencodeSession', 'format', 'template'], value: 'ses_{hex12}' },
      { path: ['opencodeSession', 'providers', 'sub2api', 'models', 'deepseek-flash'], value: true },
      { path: ['opencodeSession', 'userAgent', 'providers', 'p', 'enabled'], value: true },
      { path: ['opencodeSession', 'userAgent', 'providers', 'p', 'models', 'm'], value: false },
      { path: ['opencodeSession', 'userAgent', 'value'], value: 'ua/1' },
      { path: ['subagentEffort'], value: 'off' },
    ])
  })

  it('never emits an undeclared key, at any depth', () => {
    const section = {
      subagentEffort: 'off',
      profiles: { work: { createdAt: 'x' } },
      autoBackup: { createdAt: 'y' },
      mystery: 'z',
      opencodeSession: {
        providers: { p: { models: { m: true }, unknownSibling: 1 } },
        format: { mode: 'template', unknownFormatKey: 'q' },
        secret: 's',
      },
    }
    const paths = leavesOf(LEGACY_OWN_SHAPE, section).map((leaf) => leaf.path.join('.'))
    expect(paths).toEqual([
      'subagentEffort',
      'opencodeSession.providers.p.models.m',
      'opencodeSession.format.mode',
    ])
  })

  it('keeps "off" a string when the document carries it as one', () => {
    expect(leavesOf(LEGACY_OWN_SHAPE, { subagentEffort: 'off' })).toEqual([
      { path: ['subagentEffort'], value: 'off' },
    ])
  })

  it('skips a value whose type does not match the declared leaf', () => {
    const section = {
      subagentEffort: { nested: true },
      opencodeSession: { providers: { p: { models: { m: 'true' } } } },
    }
    expect(leavesOf(LEGACY_OWN_SHAPE, section)).toEqual([])
  })

  it('emits only the llm-pi-ai key the old documents can hold', () => {
    expect(leavesOf(LEGACY_LLM_SHAPE, { subagentEffort: 'high', providers: { p: {} } })).toEqual([
      { path: ['subagentEffort'], value: 'high' },
    ])
  })

  it('answers nothing for a non-object section', () => {
    expect(leavesOf(LEGACY_OWN_SHAPE, undefined)).toEqual([])
    expect(leavesOf(LEGACY_OWN_SHAPE, 'nope')).toEqual([])
    expect(leavesOf(LEGACY_OWN_SHAPE, [1, 2])).toEqual([])
  })
})
