/**
 * The default-levels entry: fills missing `reasoningEfforts` on models the user
 * declared, and owns the plugin's settings section.
 *
 * This entry keeps the `thinking-effort` id its bundle row always had. Existing
 * profiles carry a `- id: thinking-effort` row with their whole `config` under
 * it; renaming the id would strand that configuration.
 */
import { installSettingsWatcher } from '@hytime/dsh-feature-levels'
import type { HostContext } from '@hytime/dsh-plugin-kit'

export const name = '@hytime/dsh-thinking-effort'
export const inject = ['settings', 'timer'] as const

export { Config } from '@hytime/dsh-feature-levels'

export function apply(ctx: HostContext): void {
  installSettingsWatcher(ctx)
}
