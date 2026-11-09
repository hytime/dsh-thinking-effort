/** The compaction-policy entry: the plugin's own threshold-based compaction. */
import { installCompactionPolicy } from '@hytime/dsh-feature-compaction'
import type { HostContext } from '@hytime/dsh-plugin-kit'

export const name = '@hytime/dsh-thinking-effort/compaction'
export const inject = ['settings', 'llm', 'timer'] as const

// The section split lands in a later step; until then every entry
// publishes the one schema so each still gets a settings form.
export { Config } from '@hytime/dsh-plugin-kit'

export function apply(ctx: HostContext): void {
  installCompactionPolicy(ctx)
}
