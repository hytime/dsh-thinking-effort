import { componentSwitchesFrom } from './component-switches.js'
import type { ClientContext } from '../client-types.js'
import type { ComponentKey, ComponentSwitchState, InventorySnapshotLike } from './component-switches.js'

interface RemoteLike {
  pluginInventory?: { list(): Promise<unknown> }
  $on?(event: string, listener: () => void): () => void
}

function snapshotOf(answer: unknown): InventorySnapshotLike | undefined {
  if (typeof answer !== 'object' || answer === null) return undefined
  const envelope = answer as { ok?: unknown; value?: unknown }
  if (envelope.ok === false) return undefined
  const value = envelope.ok === true ? envelope.value : answer
  if (typeof value !== 'object' || value === null) return undefined
  const snapshot = value as InventorySnapshotLike
  return Array.isArray(snapshot.entries) ? snapshot : undefined
}

/**
 * Read the Loader inventory on startup and after plugin-manager changes.
 * Returns a manual read for hosts that only report changes on demand.
 */
export function readComponentSwitches(
  context: ClientContext,
  onChange: (switches: Record<ComponentKey, ComponentSwitchState>) => void,
): () => Promise<boolean> {
  let reread: (() => Promise<boolean>) | undefined
  context.inject(['remote.pluginInventory'], function watchInventory(scope) {
    const remote = scope.get('remote') as RemoteLike | undefined
    const inventory = remote?.pluginInventory
    if (typeof inventory?.list !== 'function') return

    let version = 0
    let active = true
    const read = async (): Promise<boolean> => {
      const request = ++version
      let snapshot: InventorySnapshotLike | undefined
      try {
        snapshot = snapshotOf(await inventory.list())
      } catch {
        return false
      }
      if (!active || request !== version || snapshot === undefined) return false
      onChange(componentSwitchesFrom(snapshot))
      return true
    }

    reread = read
    scope.effect(() => {
      const unsubscribe = remote?.$on?.('plugin-manager/changed', () => { void read() })
      void read()
      return () => {
        active = false
        if (reread === read) reread = undefined
        unsubscribe?.()
      }
    }, 'dsh-thinking-effort: component inventory')
  })

  return () => reread?.() ?? Promise.resolve(false)
}
