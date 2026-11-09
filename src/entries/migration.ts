/** The legacy-migration entry: scans pre-0.1.7 settings and offers to migrate. */
import { installLegacyMigration } from '@hytime/dsh-feature-migration'
import type { HostContext } from '@hytime/dsh-plugin-kit'

export const name = '@hytime/dsh-thinking-effort/migration'
export const inject = ['settings', 'timer'] as const

// The section split lands in a later step; until then every entry
// publishes the one schema so each still gets a settings form.
export { Config } from '@hytime/dsh-plugin-kit'

export function apply(ctx: HostContext): void {
  installLegacyMigration(ctx)
}
