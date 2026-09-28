/**
 * The one plain-object guard both bundles import. `src/host/types.ts`
 * re-exports it so existing host callers keep their import path, and the
 * `record()`/`isRecord()` helpers each module used to declare privately now
 * delegate here.
 *
 * A plain data object is anything non-null, non-array, and `typeof 'object'`,
 * which deliberately admits class instances: every call site treats the value
 * as an untrusted settings/document read, where an instance is no more
 * trustworthy than a literal. `src/compat/model-source.ts` keeps its own
 * `isPlainObject` because it must EXCLUDE instances to distinguish a
 * hand-written profile from a constructed one.
 */
export function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
