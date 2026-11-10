/**
 * Read the Host's component switches from the browser, and keep them current.
 *
 * The bundle is one artifact for seven Cordis entries (see
 * `shared/component-switches`), so the client cannot infer a switch from what
 * the Loader mounted — it has to ask. `remote.pluginInventory.list()` answers the
 * effective enablement of every Loader row, which is the same value the plugin
 * page shows.
 *
 * The read goes through `context.inject`, NOT `context.get`:
 * `remote.pluginInventory` is a namespace on the one `remote` service, and that
 * service is only reachable through a declared dependency. A `get('remote')`
 * answers undefined on every host, so a `get`-based read would silently fall
 * back to "unknown" and render every part — which is exactly the bug this module
 * exists to prevent. `inject` also degrades safely: a host without the remote
 * simply never calls back, and the caller keeps its all-on default.
 *
 * @module @hytime/dsh-plugin-kit/shared/read-component-switches
 */
import { componentSwitchesFrom } from './component-switches.js'
import type { ComponentKey, ComponentSwitchState, InventorySnapshotLike } from './component-switches.js'

/** The inventory namespace, as far as this module needs it. */
interface InventoryNamespaceLike {
  list(): Promise<unknown>
}

/** The `remote` service face: the inventory namespace plus the event subscription. */
interface RemoteLike {
  pluginInventory?: InventoryNamespaceLike
  $on?(event: string, listener: (payload: unknown) => void): () => void
}

/** The client context surface this module uses. */
interface SwitchReaderContextLike {
  inject(options: string[], callback: (scope: SwitchReaderContextLike) => void): unknown
  get(name: string): unknown
}

/** Every switch unknown, which `componentEnabled` renders as on. */
function unknownSwitches(): Record<ComponentKey, ComponentSwitchState> {
  return componentSwitchesFrom(undefined)
}

/**
 * Unwrap the Remote envelope.
 *
 * The typert Remote answers `{ ok: true, value }` or `{ ok: false, error }`;
 * the plugin page's own store unwraps the same way. A failed answer is not a
 * disabled component, so it resolves to "unknown" rather than hiding anything.
 *
 * @param answer - whatever `list()` resolved to.
 * @returns the snapshot, or `undefined` when the Host refused.
 */
function snapshotOf(answer: unknown): InventorySnapshotLike | undefined {
  if (typeof answer !== 'object' || answer === null) return undefined
  const envelope = answer as { ok?: unknown; value?: unknown }
  if (envelope.ok === false) return undefined
  const value = envelope.ok === true ? envelope.value : answer
  if (typeof value !== 'object' || value === null) return undefined
  return value as InventorySnapshotLike
}

/**
 * Read the switches once and keep reading while the profile changes.
 *
 * A component switch is a Loader fact, so the Host only applies it on reload —
 * but the SWITCH itself changes the moment the user toggles the row, and the
 * panel has to reflect that without a page refresh. `plugin-manager/changed` is
 * the Host's announcement for exactly that, so this re-reads on every one.
 *
 * @param context - the client context, used only to declare the dependency.
 * @param onChange - called with each resolved map, starting with the first read.
 * @returns a disposer that stops the subscription, or undefined when the Host
 *   publishes no inventory remote (nothing was subscribed).
 */
export function readComponentSwitches(
  context: SwitchReaderContextLike,
  onChange: (switches: Record<ComponentKey, ComponentSwitchState>) => void,
): (() => void) | undefined {
  let dispose: (() => void) | undefined
  let called = false
  context.inject(['remote.pluginInventory'], (scope) => {
    called = true
    const remote = scope.get('remote') as RemoteLike | undefined
    const inventory = remote?.pluginInventory
    const list = inventory?.list
    if (typeof list !== 'function') {
      onChange(unknownSwitches())
      return
    }
    const read = (): void => {
      list.call(inventory).then(
        (answer) => { onChange(componentSwitchesFrom(snapshotOf(answer))) },
        // A failed read keeps the panel rendering rather than hiding controls
        // on a transport hiccup.
        () => { onChange(unknownSwitches()) },
      )
    }
    read()
    // `$on` exists on every host that publishes the inventory remote; the
    // optional call keeps this working on one that does not.
    // The Host announces every profile change here, including a row toggle made
    // in the plugin page. Re-reading on it is what makes the panel react without
    // a page refresh.
    dispose = remote?.$on?.('plugin-manager/changed', read)
  })
  return dispose
}
