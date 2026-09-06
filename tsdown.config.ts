import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve as resolvePath, sep } from 'node:path'
import { defineConfig } from 'tsdown'
import { transform } from 'lightningcss'

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
const GLOBAL_CSS_VIRTUAL_PREFIX = '\0dsh-global-css:'
const INLINE_CSS_VIRTUAL_PREFIX = '\0dsh-inline-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'
const INLINE_CSS_QUERY = '?inline'

/** Path segment tsc emits under (`/lib/types/`), re-rooted onto `src/`. */
const TYPES_MARKER = `${sep}lib${sep}types${sep}`

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
  const boundary = emitted.indexOf(TYPES_MARKER)
  if (boundary < 0) return emitted
  return resolvePath(emitted.slice(0, boundary), 'src', emitted.slice(boundary + TYPES_MARKER.length))
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
}, {
  name: 'dsh-css-text-inline',
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith(`.css${INLINE_CSS_QUERY}`)) return null
    const stylesheet = source.slice(0, -INLINE_CSS_QUERY.length)
    const abs = importer !== undefined ? sourceAssetPath(stylesheet, importer) : stylesheet
    return INLINE_CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
  },
  async load(virtualId: string) {
    if (!virtualId.startsWith(INLINE_CSS_VIRTUAL_PREFIX)) return null
    const fileId = virtualId.slice(INLINE_CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
    this.addWatchFile(fileId)
    const source = await readFile(fileId)
    const { code } = transform({ filename: fileId, code: source, minify: true })
    return `export default ${JSON.stringify(code.toString())};`
  },
}, {
  name: 'dsh-css-global-inline',
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith('.css') || source.endsWith('.module.css')) return null
    const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
    return GLOBAL_CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
  },
  async load(virtualId: string) {
    if (!virtualId.startsWith(GLOBAL_CSS_VIRTUAL_PREFIX)) return null
    const fileId = virtualId.slice(GLOBAL_CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
    this.addWatchFile(fileId)
    const source = await readFile(fileId)
    const { code } = transform({ filename: fileId, code: source, minify: true })
    return styleInjectionModule('@hytime/dsh-thinking-effort', fileId, code.toString())
  },
}]

export default defineConfig([
  {
    entry: { index: 'lib/types/index.js' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    fixedExtension: false,
    clean: false,
  },
  {
    entry: { client: 'lib/types/client/index.js' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    clean: false,
    deps: {
      neverBundle: isReactPlatform,
      alwaysBundle: (specifier) => !isReactPlatform(specifier),
    },
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