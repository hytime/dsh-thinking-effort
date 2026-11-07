/**
 * The client bundle's single entry.
 *
 * `dsh.client` is declared per package, so the browser artifact is one file no
 * matter how many client packages feed it. This module is the seam: it re-exports
 * the two client packages' registrations under the one `apply` the Loader calls,
 * and `tsdown.config.ts` still builds `lib/client.js` from here.
 *
 * Keeping the entry at this path is deliberate — the emitted
 * `window.__ModuleLoader__.load({ id: '@hytime/dsh-thinking-effort' })` banner and
 * the `dsh.client` declaration both assume it.
 */
import { apply as applySettings } from '@hytime/dsh-feature-settings-ui'
import { apply as applyComposer } from '@hytime/dsh-feature-composer'
import type { ClientContext } from '@hytime/dsh-plugin-kit'

export const name = '@hytime/dsh-thinking-effort'
export const inject = ['slots', 'connection', 'locale'] as const

/**
 * Register every client surface this plugin contributes.
 *
 * The two registrations are independent: the settings panel owns the
 * `settings.section` slot and the legacy-migration overlay, the Composer seat
 * owns `conversation.input.model`. Running both from one entry is what keeps a
 * single client bundle without coupling the two packages.
 */
export function apply(context: ClientContext): void {
  applySettings(context)
  applyComposer(context)
}
