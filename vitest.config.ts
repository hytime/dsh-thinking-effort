import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

/**
 * The plugin version is a build-time constant (`tsdown`'s `define`), because the
 * client packages must not import the root manifest — the root package imports
 * them, so that edge would be a cycle. Tests run against source, not the built
 * bundle, so the same constant is injected here from the one source of truth.
 */
const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  define: {
    __PLUGIN_VERSION__: JSON.stringify(manifest.version),
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    environment: 'node',
  },
})
