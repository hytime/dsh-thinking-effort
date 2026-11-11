/**
 * The client bundle's single entry.
 *
 * `dsh.client` is declared per package, so the browser artifact is one file no
 * matter how many Cordis entries the profile enables: the Loader fetches and
 * runs this module ONCE. That is why the switches have to be read here rather
 * than inferred from what mounted — a disabled `thinking-effort-opencode` row
 * stops the host from injecting headers, but it does not stop this file from
 * loading, so the settings panel would otherwise keep rendering an OpenCode card
 * for a feature that is not running.
 *
 * Each client package exposes parts rather than one `apply` for exactly this
 * reason: the panel and the Composer seat are separate Loader rows, so turning
 * one off must not take the other with it.
 *
 * Keeping the entry at this path is deliberate — the emitted
 * `window.__ModuleLoader__.load({ id: '@hytime/dsh-thinking-effort' })` banner and
 * the `dsh.client` declaration both assume it.
 */
import { createComponentSwitchStore, readComponentSwitches } from '@hytime/dsh-plugin-kit'
import { apply as applySettings } from '@hytime/dsh-feature-settings-ui'
import { apply as applyComposer } from '@hytime/dsh-feature-composer'
import type { ClientContext } from '@hytime/dsh-plugin-kit'

export const name = '@hytime/dsh-thinking-effort'
export const inject = ['slots', 'connection', 'locale'] as const

// The inventory dependency can arrive after the client starts. Older hosts
// never provide it, so mount with the store's defaults after a bounded wait.
const SWITCHES_TIMEOUT_MS = 3000

export function apply(context: ClientContext): void {
  const { store, update } = createComponentSwitchStore()
  let mounted = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const mount = (): void => {
    if (mounted) return
    mounted = true
    if (timer !== undefined) clearTimeout(timer)
    applySettings(context, {
      switches: store,
      reread,
    })
    applyComposer(context, store)
  }

  const reread = readComponentSwitches(context, (switches) => {
    update(switches)
    mount()
  })
  // The packaged client smoke test runs in a VM without browser timers.
  if (!mounted && typeof setTimeout === 'function') timer = setTimeout(mount, SWITCHES_TIMEOUT_MS)
}
