import { defineConfig } from 'tsdown'

const isReactPlatform = (specifier: string): boolean => (
  specifier === 'react' || specifier === 'react/jsx-runtime'
)

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
    banner: "window.__ModuleLoader__.load({ id: '@hytime/dsh-thinking-effort', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
    footer: 'module.exports = exports; return module.exports; } });',
    outputOptions: {
      entryFileNames: 'client.js',
    },
  },
])
