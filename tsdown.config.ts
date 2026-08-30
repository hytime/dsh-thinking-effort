import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    format: 'esm',
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'iife',
    platform: 'browser',
    globalName: 'DSHThinkingEffort',
    dts: false,
    sourcemap: true,
    clean: false,
    outputOptions: {
      entryFileNames: '[name].js',
      chunkFileNames: '[name]-[hash].js',
    },
  },
])
