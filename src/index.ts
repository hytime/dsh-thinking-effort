import { mark } from './host/marker.js'
import { installSettingsWatcher } from './host/settings.js'
import { installOpenCodeSession } from './host/opencode-session.js'
import { handleAgentRequest } from './host/subagent.js'
import type { HostContext } from './host/types.js'

export const name = '@hytime/dsh-thinking-effort'
export const inject = ['settings', 'timer', 'llm'] as const

export function apply(ctx: HostContext): void {
  mark('apply')
  installSettingsWatcher(ctx)
  installOpenCodeSession(ctx)
  ctx.on('agent/request', (...args: unknown[]) => {
    const payload = args[0]
    const next = args[1] as () => Promise<unknown>
    return handleAgentRequest(ctx, payload, next)
  }, { global: true })
}
