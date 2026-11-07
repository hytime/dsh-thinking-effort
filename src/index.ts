import { mark } from './host/marker.js'
import { installSettingsWatcher } from './host/settings.js'
import { installOpenCodeSession } from './host/opencode-session.js'
import { installLegacyMigration } from './host/legacy-watcher.js'
import { installCompactionPolicy } from './host/compaction.js'
import { handleAgentCreated, handleAgentRequest } from './host/subagent.js'
import type { HostContext } from './host/types.js'

export const name = '@hytime/dsh-thinking-effort'
export const inject = ['settings', 'timer', 'llm'] as const

/**
 * The Loader entry's config schema. DSH 0.1.7 derives the settings form from
 * it, so it must stay exported from the package entry.
 */
export { Config } from './host/plugin-settings.js'

export function apply(ctx: HostContext): void {
  mark('apply')
  installSettingsWatcher(ctx)
  installOpenCodeSession(ctx)
  installLegacyMigration(ctx)
  // The plugin's own compaction policy. It reaches the official backend through
  // `ctx.get()` rather than an injection, because that backend lives inside each
  // agent preset's isolate realm and a static dependency would park this fiber on
  // every deployment that composes neither the preset registry nor a backend.
  installCompactionPolicy(ctx)
  ctx.on('agent/created', (...args: unknown[]) => {
    handleAgentCreated(ctx, args[0])
  }, { global: true })
  ctx.on('agent/request', (...args: unknown[]) => {
    const payload = args[0]
    const next = args[1] as () => Promise<unknown>
    return handleAgentRequest(ctx, payload, next)
  }, { global: true })
}
