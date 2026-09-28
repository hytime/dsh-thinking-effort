/**
 * Hand-written declarations for the plain-`.mjs` guard: `tests/conventions.test.ts`
 * imports it, and `npm run typecheck:test` compiles that test (NodeNext), which
 * needs a declaration file for the sibling `.mjs`.
 */
export interface ConventionViolation {
  readonly rule: string
  readonly path: string
  readonly line: number
  readonly text: string
}

export function findViolations(
  files: readonly { readonly path: string; readonly source: string }[],
): ConventionViolation[]
