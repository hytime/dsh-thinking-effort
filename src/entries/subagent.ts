/** The subagent entry: default thinking effort and default model route. */
import { handleAgentCreated, handleAgentRequest } from '@hytime/dsh-feature-subagent'
import type { HostContext } from '@hytime/dsh-plugin-kit'

export const name = '@hytime/dsh-thinking-effort/subagent'
export const inject = ['settings', 'llm'] as const

// The section split lands in a later step; until then every entry
// publishes the one schema so each still gets a settings form.
export { Config } from '@hytime/dsh-plugin-kit'

export function apply(ctx: HostContext): void {
  ctx.on('agent/created', (...args: unknown[]) => {
    handleAgentCreated(ctx, args[0])
  }, { global: true })
  ctx.on('agent/request', (...args: unknown[]) => {
    const next = args[1] as () => Promise<unknown>
    return handleAgentRequest(ctx, args[0], next)
  }, { global: true })
}
