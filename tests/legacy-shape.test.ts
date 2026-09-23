import { describe, expect, it } from 'vitest'
import { schemaNodeAtPath } from '../src/compat/gateway/validation.ts'
import { LEGACY_LLM_SHAPE, LEGACY_OWN_SHAPE, leavesOf, type LegacyShape } from '../src/host/legacy-shape.ts'
import { PLUGIN_SETTINGS_SCHEMA } from '../src/host/plugin-settings.ts'

/**
 * Every leaf the shape table declares, with a dynamic dict segment written as
 * `*` — the token `schemaNodeAtPath` uses to descend into a dict's inner node.
 * The shape's own structure is the source, so this enumeration cannot drift from
 * the table the way a hand-written path list would.
 */
function collectLeaves(shape: LegacyShape, prefix: readonly string[] = []): Array<{ path: string[]; type: string }> {
  if (shape.kind === 'scalar') return [{ path: [...prefix], type: shape.type }]
  if (shape.kind === 'dict') {
    return collectLeaves(shape.of, [...prefix, '*'])
  }
  return Object.entries(shape.fields).flatMap(([key, child]) => collectLeaves(child, [...prefix, key]))
}

/**
 * The settings schema in the form `schemaNodeAtPath` reads.
 *
 * `PLUGIN_SETTINGS_SCHEMA` is a live schemastery Schema, and a Schema value is
 * callable (`typeof schema === 'function'`), which the accessor's plain-node
 * read rejects — every path through the live schema answers `undefined`.
 * `toJSON()` is the `{ uid, refs }` envelope `settings/describe` publishes, and
 * the accessor resolves it. The node types are the live schema's own, so moving
 * a leaf from `z.string()` to `z.boolean()` changes the type compared below.
 */
const PUBLISHED_SETTINGS_SCHEMA = PLUGIN_SETTINGS_SCHEMA.toJSON()

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
    // Sorted, so an unrelated reordering of the shape table's fields cannot fail
    // this case in a confusing way.
    const paths = leavesOf(LEGACY_OWN_SHAPE, section).map((leaf) => leaf.path.join('.')).sort()
    expect(paths).toEqual([
      'opencodeSession.format.mode',
      'opencodeSession.providers.p.models.m',
      'subagentEffort',
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

  it('drops a reserved key a document states inside a dict', () => {
    // `JSON.parse` keeps `__proto__` as an own enumerable property, so a parsed
    // document really can carry it into a dict node. It must never reach a path.
    const section = JSON.parse(
      '{"opencodeSession":{"providers":{"__proto__":{"models":{"m":true}},"p":{"models":{"m":true}}}}}',
    )
    expect(leavesOf(LEGACY_OWN_SHAPE, section)).toEqual([
      { path: ['opencodeSession', 'providers', 'p', 'models', 'm'], value: true },
    ])
  })

  it('declares, for every leaf, the type the plugin schema declares at that path', () => {
    // The shape table mirrors the plugin's own schema, and nothing else in this
    // file ties the two together. Without this case, changing a schema leaf's
    // type would leave every other case green while the migration produced a
    // path write the host refuses for the whole batch — the exact accident the
    // per-leaf types exist to prevent.
    const declared = [...collectLeaves(LEGACY_OWN_SHAPE), ...collectLeaves(LEGACY_LLM_SHAPE)]
      .sort((left, right) => left.path.join('.').localeCompare(right.path.join('.')))
    expect(declared.length).toBe(14)
    for (const leaf of declared) {
      const node = schemaNodeAtPath(PUBLISHED_SETTINGS_SCHEMA, leaf.path)
      expect(node, `${leaf.path.join('.')} must exist in the plugin schema`).toBeDefined()
      expect(node?.['type'], `${leaf.path.join('.')} must be a ${leaf.type}`).toBe(leaf.type)
    }
  })

  it('covers all thirteen distinct declared paths', () => {
    const distinct = new Set([
      ...collectLeaves(LEGACY_OWN_SHAPE),
      ...collectLeaves(LEGACY_LLM_SHAPE),
    ].map((leaf) => leaf.path.join('.')))
    // `subagentEffort` is declared by both shapes, so the union is one shorter
    // than the two enumerations together.
    expect(distinct.size).toBe(13)
  })
})
