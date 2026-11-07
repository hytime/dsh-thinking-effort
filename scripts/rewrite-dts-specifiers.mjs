/**
 * Repoint the emitted declarations' workspace imports at the shipped copies.
 *
 * `packages/*` are `private: true` and never published, but tsc still names them
 * in the declarations it emits (`@hytime/dsh-plugin-kit`, `@hytime/dsh-feature-*`).
 * A consumer type-checking this package would resolve those specifiers against
 * packages absent from the tarball, so the published types were unusable even
 * though the runtime bundle inlines every one of them.
 *
 * The declaration for each workspace package IS shipped: `files` takes
 * `lib/types/**\/*.d.ts`, and `rootDir: "."` makes tsc mirror
 * `packages/x/src/index.ts` to `lib/types/packages/x/src/index.d.ts`. Pointing
 * each specifier at that copy keeps one declaration per source module, which is
 * the same shape the JS entry ships — the emitted tree is the artifact, not a
 * flattened rewrite of it.
 *
 * A specifier with no entry in the map is left alone; external packages stay
 * external, exactly as they do in the JS bundle.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const typesRoot = resolve(root, 'lib/types')

/** Bare specifier -> the declaration tsc emits for it, relative to `lib/types`. */
const WORKSPACE_DECLARATIONS = new Map([
  ['@hytime/dsh-plugin-kit', 'packages/kit/src/index.d.ts'],
  ['@hytime/dsh-plugin-kit/host', 'packages/kit/src/host/marker.d.ts'],
  ['@hytime/dsh-feature-levels', 'packages/levels/src/index.d.ts'],
  ['@hytime/dsh-feature-opencode', 'packages/opencode/src/index.d.ts'],
  ['@hytime/dsh-feature-compaction', 'packages/compaction/src/index.d.ts'],
  ['@hytime/dsh-feature-subagent', 'packages/subagent/src/index.d.ts'],
  ['@hytime/dsh-feature-migration', 'packages/migration/src/index.d.ts'],
  ['@hytime/dsh-feature-settings-ui', 'packages/settings-ui/src/client/index.d.ts'],
  ['@hytime/dsh-feature-composer', 'packages/composer/src/thinking-slider/index.d.ts'],
])

function declarationFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return declarationFiles(full)
    return name.endsWith('.d.ts') ? [full] : []
  })
}

/**
 * The specifier rewritten for `file`, or `undefined` when it is not a workspace
 * package.
 *
 * The target keeps a `.js` extension because that is how every other relative
 * import in these declarations is spelled: TypeScript resolves `./x.js` to
 * `x.d.ts`, and a `.d.ts` suffix in the specifier would not resolve at all.
 */
function rewrite(file, specifier) {
  const target = WORKSPACE_DECLARATIONS.get(specifier)
  if (target === undefined) return undefined
  const targetPath = resolve(typesRoot, target.replace(/\.d\.ts$/, '.js'))
  const relativePath = relative(dirname(file), targetPath).split('\\').join('/')
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`
}

const specifierPattern = /(from\s+|import\s*\(\s*)(['"])([^'"]+)\2/g

let rewritten = 0
for (const file of declarationFiles(typesRoot)) {
  const source = readFileSync(file, 'utf8')
  const next = source.replace(specifierPattern, (match, prefix, quote, specifier) => {
    const replacement = rewrite(file, specifier)
    if (replacement === undefined) return match
    rewritten += 1
    return `${prefix}${quote}${replacement}${quote}`
  })
  if (next !== source) writeFileSync(file, next)
}

if (rewritten === 0) {
  console.error('rewrite-dts-specifiers: no workspace references in lib/types; run tsc first')
  process.exit(1)
}
console.log(`rewrite-dts-specifiers: repointed ${rewritten} workspace reference(s) in lib/types`)
