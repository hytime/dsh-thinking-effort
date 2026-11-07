/** The OpenCode session-header entry: per-model `x-opencode-session` injection. */
import { installOpenCodeSession } from '@hytime/dsh-feature-opencode'
import type { HostContext } from '@hytime/dsh-plugin-kit'

export const name = '@hytime/dsh-thinking-effort/opencode'
export const inject = ['settings', 'llm'] as const

// The section split lands in a later step; until then every entry
// publishes the one schema so each still gets a settings form.
export { Config } from '@hytime/dsh-plugin-kit'

export function apply(ctx: HostContext): void {
  installOpenCodeSession(ctx)
}
