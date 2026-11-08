import { describe, expect, it } from 'vitest'
import {
  COMPONENT_ROWS,
  allComponentsOn,
  componentEnabled,
  componentSwitchesFrom,
} from '@hytime/dsh-plugin-kit'

/**
 * The bundle's seven rows share one browser artifact, so the client cannot tell
 * a disabled component from an enabled one by looking at what mounted. These
 * tests pin the mapping it uses instead, including the two cases that decide
 * whether a user sees their controls at all: a row the profile never mounts, and
 * a Host that cannot answer.
 */
describe('component switches', () => {
  const entry = (moduleName: string, enabled: boolean) => ({ moduleName, enabled })

  it('names the same rows cordis.patch.yml declares', () => {
    // A row id that drifts from the composition would make its switch read the
    // wrong row, and the card would never hide.
    expect(Object.values(COMPONENT_ROWS).map((row) => row.rowId)).toEqual([
      'thinking-effort',
      'thinking-effort-settings',
      'thinking-effort-opencode',
      'thinking-effort-compaction',
      'thinking-effort-subagent',
      'thinking-effort-migration',
      'thinking-effort-composer',
    ])
  })

  it('reports each row from the inventory by module name', () => {
    const switches = componentSwitchesFrom({
      entries: [
        entry('@hytime/dsh-thinking-effort', true),
        entry('@hytime/dsh-thinking-effort/opencode', false),
        entry('@hytime/dsh-thinking-effort/composer', true),
      ],
    })
    expect(switches.levels).toBe('on')
    expect(switches.opencode).toBe('off')
    expect(switches.composer).toBe('on')
    // A row the profile does not mount is indistinguishable from disabled.
    expect(switches.subagent).toBe('off')
  })

  it('matches on the module name, not the Loader entry id', () => {
    // Entry ids are Loader-internal and can change across a reload; the module
    // specifier is what the composition declares.
    const switches = componentSwitchesFrom({
      entries: [{ entryId: 'anything-at-all', moduleName: '@hytime/dsh-thinking-effort/compaction', enabled: true }],
    })
    expect(switches.compaction).toBe('on')
  })

  it('treats an unreadable inventory as unknown, which still renders', () => {
    const switches = componentSwitchesFrom(undefined)
    expect(switches.opencode).toBe('unknown')
    // Hiding a working surface because the Host could not answer would be worse
    // than showing one whose switch may be stale.
    expect(componentEnabled(switches.opencode)).toBe(true)
    expect(allComponentsOn(switches)).toBe(true)
  })

  it('counts only an explicit off as hidden', () => {
    expect(componentEnabled('on')).toBe(true)
    expect(componentEnabled('unknown')).toBe(true)
    expect(componentEnabled('off')).toBe(false)
  })

  it('reports whether anything is switched off', () => {
    const all = componentSwitchesFrom({
      entries: Object.values(COMPONENT_ROWS).map((row) => entry(row.moduleName, true)),
    })
    expect(allComponentsOn(all)).toBe(true)
    expect(allComponentsOn({ ...all, migration: 'off' })).toBe(false)
  })
})
