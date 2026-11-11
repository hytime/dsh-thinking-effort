import { componentEnabled, componentSwitchesFrom } from './component-switches.js'
import type { ComponentKey, ComponentSwitchState } from './component-switches.js'

/** The live switch face a client surface reads. */
export interface ComponentSwitchStore {
  /** The current answer, stable between updates. */
  getSnapshot(): Record<ComponentKey, ComponentSwitchState>
  /** Subscribe to updates; returns the unsubscribe. */
  subscribe(listener: () => void): () => void
}

/**
 * Create a store that starts at "every part on" and is updated from the Host.
 *
 * Starting at all-on matters: the first read is asynchronous, and a store that
 * began at all-off would blank the panel for a frame. All-on also matches what
 * an older host without the inventory remote resolves to.
 *
 * @returns the store plus the setter the reader calls.
 */
export function createComponentSwitchStore(): {
  store: ComponentSwitchStore
  update(next: Record<ComponentKey, ComponentSwitchState>): void
} {
  let current = componentSwitchesFrom(undefined)
  const listeners = new Set<() => void>()

  const notify = (): void => { for (const listener of listeners) listener() }
  return {
    store: {
      getSnapshot: () => current,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },

    },
    update: (next) => {
      const keys = Object.keys(next) as ComponentKey[]
      if (keys.every((key) => next[key] === current[key])) return
      current = next
      notify()
    },
  }
}

/**
 * Whether one part of a surface should render, from a store snapshot.
 *
 * @param snapshot - the store's current answer.
 * @param key - the component row to ask about.
 * @returns whether that part renders.
 */
export function partEnabled(
  snapshot: Record<ComponentKey, ComponentSwitchState>,
  key: ComponentKey,
): boolean {
  return componentEnabled(snapshot[key])
}

/** Keep a slot registered for as long as its component is enabled. */
export function registerComponentSlot(
  switches: ComponentSwitchStore | undefined,
  key: ComponentKey,
  register: () => () => void,
): () => void {
  let unregister: (() => void) | undefined
  const sync = (): void => {
    if (switches === undefined || partEnabled(switches.getSnapshot(), key)) {
      unregister ??= register()
    } else {
      unregister?.()
      unregister = undefined
    }
  }

  sync()
  const unsubscribe = switches?.subscribe(sync)
  return () => {
    unsubscribe?.()
    unregister?.()
  }
}
