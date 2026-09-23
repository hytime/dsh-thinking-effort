/**
 * Which paths of a legacy settings document are fields this plugin owns.
 *
 * The traversal is driven by a declared shape, not by the document: dynamic keys
 * (`providers`, `models`) are declared as dicts so their live keys are read,
 * while every fixed key must be listed. A key the shape does not declare is
 * dropped at any depth, so arbitrary content a user hand-wrote into their
 * settings document can never become a write into the plugin's own section.
 */

/** One declared node of a legacy section. A scalar declares its own type. */
export type LegacyShape =
  | { readonly kind: 'scalar'; readonly type: 'string' | 'boolean' }
  | { readonly kind: 'dict'; readonly of: LegacyShape }
  | { readonly kind: 'object'; readonly fields: Readonly<Record<string, LegacyShape>> }

/** One declared leaf found in a document. */
export interface LegacyLeaf {
  readonly path: readonly string[]
  readonly value: string | boolean
}

/**
 * A text leaf: an effort level, a mode name, a template, a regex.
 *
 * The type is declared per leaf rather than inferred from the value, because a
 * hand-edited document can put a string where the schema declares a boolean.
 * Emitting it would send a wrongly-typed path write, and under the entry-config
 * model the host refuses a write batch WHOLE when a value does not fit the
 * schema — so one bad leaf would take every good one down with it. Dropping it
 * here is what keeps a malformed document from costing the rest of the batch.
 */
const TEXT: LegacyShape = { kind: 'scalar', type: 'string' }

/** A boolean leaf: a per-model or per-route toggle. */
const FLAG: LegacyShape = { kind: 'scalar', type: 'boolean' }

/**
 * Keys a path must never contain, whatever a document states.
 *
 * A dict node takes its keys from the document, and a parsed `{"__proto__": {...}}`
 * carries an own enumerable `__proto__`, so without this filter a document could
 * put `__proto__` (or `constructor`) into a leaf path that later becomes a path
 * write. The Client's `RESERVED_PATH_KEYS` in `src/client/config-snapshot/types.ts`
 * holds the same three names; this is a host-side copy because the Host bundle
 * must not import client code.
 */
const RESERVED_PATH_KEYS = ['__proto__', 'constructor', 'prototype'] as const

/** `{ models: { <model>: boolean } }` — a provider's per-model toggles. */
const MODEL_TOGGLES: LegacyShape = {
  kind: 'object',
  fields: { models: { kind: 'dict', of: FLAG } },
}

/** The `opencodeSession` subtree as released versions wrote it. */
const OPENCODE_SESSION: LegacyShape = {
  kind: 'object',
  fields: {
    providers: { kind: 'dict', of: MODEL_TOGGLES },
    format: {
      kind: 'object',
      fields: {
        mode: TEXT,
        time: TEXT,
        template: TEXT,
        expression: TEXT,
        script: TEXT,
        validate: TEXT,
        onInvalid: TEXT,
      },
    },
    userAgent: {
      kind: 'object',
      fields: {
        value: TEXT,
        providers: {
          kind: 'dict',
          of: {
            kind: 'object',
            fields: { enabled: FLAG, value: TEXT, models: { kind: 'dict', of: FLAG } },
          },
        },
      },
    },
  },
}

/**
 * The legacy `dsh-thinking-effort` namespace. `profiles` and `autoBackup` are
 * deliberately absent: they hold the user's saved backup library, which the
 * migration does not move. `legacyMigration` is absent for a different reason —
 * it is this feature's own control object, not a user setting, so a document
 * stating one has nothing worth migrating. All three omissions are deliberate;
 * do not "fix" them by adding the keys.
 */
export const LEGACY_OWN_SHAPE: LegacyShape = {
  kind: 'object',
  fields: {
    subagentEffort: TEXT,
    opencodeSession: OPENCODE_SESSION,
  },
}

/**
 * The legacy `llm-pi-ai` namespace, of which this plugin ever wrote exactly one
 * key before 0.1.7. `providers` is absent for the same reason.
 */
export const LEGACY_LLM_SHAPE: LegacyShape = {
  kind: 'object',
  fields: { subagentEffort: TEXT },
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Whether a document value is exactly the type its declared leaf requires. */
function matches(value: unknown, type: 'string' | 'boolean'): value is string | boolean {
  return typeof value === type
}

function walk(
  shape: LegacyShape,
  value: unknown,
  path: readonly string[],
  out: LegacyLeaf[],
): void {
  if (shape.kind === 'scalar') {
    // A value of the wrong type is one the plugin's schema does not declare
    // there; dropping it is what keeps a malformed document from producing a
    // path write the host would refuse for the whole batch.
    if (matches(value, shape.type)) out.push({ path, value })
    return
  }

  const object = record(value)
  if (object === undefined) return

  if (shape.kind === 'dict') {
    for (const [key, member] of Object.entries(object)) {
      // A document supplies these keys; a reserved one must never reach a path.
      if ((RESERVED_PATH_KEYS as readonly string[]).includes(key)) continue
      walk(shape.of, member, [...path, key], out)
    }
    return
  }

  for (const [key, member] of Object.entries(shape.fields)) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) continue
    walk(member, object[key], [...path, key], out)
  }
}

/**
 * Every declared leaf one document section states.
 * @param shape - the declared shape for that section.
 * @param section - the section as parsed from the document.
 * @returns leaf paths and their scalar values; empty for a non-object section.
 */
export function leavesOf(shape: LegacyShape, section: unknown): LegacyLeaf[] {
  const out: LegacyLeaf[] = []
  walk(shape, section, [], out)
  return out
}
