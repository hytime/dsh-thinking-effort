import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve as resolvePath, sep } from 'node:path'
import { defineConfig } from 'tsdown'
import { transform } from 'lightningcss'
import { readFileSync } from 'node:fs'

/**
 * The version the settings panel renders.
 *
 * It is a `define` rather than an import because the client packages must not
 * import the root manifest: the root package imports them, so that edge would
 * be a cycle. `vitest.config.ts` injects the same constant for tests.
 */
const PLUGIN_VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version
const versionDefine = { __PLUGIN_VERSION__: JSON.stringify(PLUGIN_VERSION) }

const isReactPlatform = (specifier: string): boolean => (
  specifier === 'react' || specifier === 'react/jsx-runtime'
)

/**
 * Virtual-id wrapper keeping module CSS away from tsdown's own css pipeline
 * (which requires @tsdown/css). The suffix matters: tsdown's guard matches ids
 * ending in `.css`, so the virtual id must not. Mirrors the official
 * packages/client/tsdown.client.ts pipeline.
 */
const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** Path segment tsc emits under, re-rooted onto the source tree.
 *
 * `rootDir` is the repository root so that `packages/*` emit declarations too,
 * which means tsc mirrors the whole tree: `src/client/x.ts` becomes
 * `lib/types/src/client/x.js`. The marker therefore includes `src`; stripping
 * only `/lib/types/` would look for `src/client/x.ts` at the wrong depth once
 * a file lives under `packages/`.
 */
const TYPES_MARKER = `${sep}lib${sep}types${sep}src${sep}`
/** The same marker for a file emitted from `packages/*`. */
const PACKAGES_MARKER = `${sep}lib${sep}types${sep}packages${sep}`

/** Emit one plugin-owned style injector and an optional CSS Modules export. */
function styleInjectionModule(
  id: string,
  fileId: string,
  css: string,
  classMap?: Readonly<Record<string, string>>,
): string {
  const source = [
    `const css = ${JSON.stringify(css)};`,
    `const tagId = ${JSON.stringify(`${id}/${basename(fileId)}`)};`,
    'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
    '  const tag = document.createElement(\'style\');',
    `  tag.dataset.plugin = ${JSON.stringify(id)};`,
    '  tag.dataset.pluginCss = tagId;',
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
  ]
  source.push(classMap === undefined ? 'export {};' : `export default ${JSON.stringify(classMap)};`)
  return source.join('\n')
}

/** Resolve an emitted JS asset import against its source-tree counterpart. */
function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  // `src/**` and `packages/*/src/**` both emit under `lib/types/`, so either
  // marker can appear depending on which package the importing module came from.
  const srcBoundary = emitted.indexOf(TYPES_MARKER)
  if (srcBoundary >= 0) {
    return resolvePath(emitted.slice(0, srcBoundary), 'src', emitted.slice(srcBoundary + TYPES_MARKER.length))
  }
  const pkgBoundary = emitted.indexOf(PACKAGES_MARKER)
  if (pkgBoundary >= 0) {
    return resolvePath(emitted.slice(0, pkgBoundary), 'packages', emitted.slice(pkgBoundary + PACKAGES_MARKER.length))
  }
  return emitted
}

/** CSS handling plugins for the browser client bundle (official clientConfig). */
const cssPlugins = [{
  name: 'dsh-css-modules-inline',
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith('.module.css')) return null
    const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
    return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
  },
  async load(virtualId: string) {
    if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
    const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
    // The virtual id otherwise hides the physical stylesheet from Rolldown's watch graph.
    this.addWatchFile(fileId)
    const source = await readFile(fileId)
    const { code, exports: cssExports } = transform({
      filename: fileId,
      code: source,
      cssModules: { pattern: '[hash]_[local]' },
      minify: true,
    })
    const classMap: Record<string, string> = {}
    const exportEntries = Object.entries(cssExports ?? {})
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    for (const [local, exp] of exportEntries) classMap[local] = exp.name
    return styleInjectionModule('@hytime/dsh-thinking-effort', fileId, code.toString(), classMap)
  },
}]

export default defineConfig([
  {
    entry: { index: 'lib/types/src/index.js' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    fixedExtension: false,
    clean: false,
    define: versionDefine,
  },
  {
    entry: { client: 'lib/types/src/client/index.js' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    clean: false,
    deps: {
      neverBundle: isReactPlatform,
      alwaysBundle: (specifier) => !isReactPlatform(specifier),
    },
    define: versionDefine,
    inputOptions: {
      plugins: cssPlugins,
    },
    banner: "window.__ModuleLoader__.load({ id: '@hytime/dsh-thinking-effort', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
    footer: 'module.exports = exports; return module.exports; } });',
    outputOptions: {
      entryFileNames: 'client.js',
    },
  },
])