import { describe, expect, it } from 'vitest'

import { pluginEntrySection, pluginSection, pluginSectionId, subagentEffortTarget } from '../src/client/subagent-section.ts'
import type { SettingsNamespace } from '../src/client/types.ts'

const llmNamespace = (): SettingsNamespace => ({
  ns: 'llm-pi-ai',
  revision: 4,
  value: { providers: {} },
  user: { subagentEffort: 'high' },
})

const entryNamespace = (overrides: Partial<SettingsNamespace> = {}): SettingsNamespace => ({
  ns: 'thinking-effort',
  revision: 9,
  value: { opencodeSession: { providers: {} }, subagentEffort: 'medium', profiles: {}, autoBackup: {} },
  user: { subagentEffort: 'medium' },
  ...overrides,
})

/** The registered namespace the pre-0.1.7 releases own; it is not an entry id. */
const registeredNamespace = (): SettingsNamespace => ({
  ns: 'dsh-thinking-effort',
  revision: 17,
  value: { opencodeSession: { providers: {} } },
})

describe('plugin entry section', () => {
  it('finds the plugin section the entry-config model publishes', () => {
    const entry = entryNamespace()
    expect(pluginEntrySection([llmNamespace(), entry])).toBe(entry)
  })

  it('does not mistake the legacy registered namespace for the entry section', () => {
    expect(pluginEntrySection([llmNamespace(), registeredNamespace()])).toBeUndefined()
    expect(pluginEntrySection([llmNamespace()])).toBeUndefined()
    expect(pluginEntrySection([])).toBeUndefined()
  })
})

describe('active plugin section resolution', () => {
  it('resolves the entry section and its id under the entry-config model', () => {
    const entry = entryNamespace()
    expect(pluginSection([llmNamespace(), entry])).toBe(entry)
    expect(pluginSectionId([llmNamespace(), entry])).toBe('thinking-effort')
  })

  it('keeps resolving the registered namespace and its id on legacy hosts', () => {
    const registered = registeredNamespace()
    expect(pluginSection([llmNamespace(), registered])).toBe(registered)
    expect(pluginSectionId([llmNamespace(), registered])).toBe('dsh-thinking-effort')
  })

  it('falls back to the legacy id when the host publishes neither section', () => {
    expect(pluginSection([llmNamespace()])).toBeUndefined()
    expect(pluginSectionId([llmNamespace()])).toBe('dsh-thinking-effort')
    expect(pluginSectionId([])).toBe('dsh-thinking-effort')
  })

  it('never resolves an unrelated namespace, even when it looks like a configured section', () => {
    const unrelated = { ns: 'llm-pi-ai', revision: 2, value: { providers: {} } }
    expect(pluginSection([unrelated])).toBeUndefined()
    expect(pluginSectionId([unrelated])).toBe('dsh-thinking-effort')
  })
})

describe('subagent effort write target', () => {
  it('writes the plugin section under the entry-config model, with that section revision', () => {
    const entry = entryNamespace()
    expect(subagentEffortTarget(entry, 4)).toEqual({
      ns: 'thinking-effort',
      revision: 9,
      ownSection: true,
    })
  })

  it('writes the llm-pi-ai section on legacy hosts, with the llm-pi-ai revision', () => {
    expect(subagentEffortTarget(undefined, 4)).toEqual({
      ns: 'llm-pi-ai',
      revision: 4,
      ownSection: false,
    })
    expect(subagentEffortTarget(null, 4)).toEqual({
      ns: 'llm-pi-ai',
      revision: 4,
      ownSection: false,
    })
  })
})
