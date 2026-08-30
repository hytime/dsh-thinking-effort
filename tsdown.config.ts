import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: { index: 'lib/types/index.js' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    clean: false,
  },
  {
    entry: { client: 'lib/types/client/index.js' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    clean: false,
    deps: {
      neverBundle: (specifier) => specifier === 'react' || specifier === 'react/jsx-runtime',
      alwaysBundle: (specifier) => specifier !== 'react' && specifier !== 'react/jsx-runtime',
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: "window.__ModuleLoader__.load({ id: '@hytime/dsh-thinking-effort', factory: (require) => {",
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
])
