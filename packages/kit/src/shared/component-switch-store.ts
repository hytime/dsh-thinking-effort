/**
 * A live view of which of this bundle's components are switched on.
 *
 * The value cannot be captured once at mount: a user can toggle a row in the
 * plugin page and expect the settings panel to lose that card without a page
 * reload. Slots are registered once and cannot be re-registered, so the panel
 * has to READ the switches per render instead of receiving them as fixed props.
 *
 * This is the smallest thing that supports that: a snapshot plus subscribers,
 * which is the shape React's `useSyncExternalStore` consumes.
 *
 * @module @hytime/dsh-plugin-kit/shared/component-switch-store
 */
import { componentEnabled } from './component-switches.js'
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
  let current: Record<ComponentKey, ComponentSwitchState> = {
    levels: 'unknown',
    settings: 'unknown',
    opencode: 'unknown',
    compaction: 'unknown',
    subagent: 'unknown',
    migration: 'unknown',
    composer: 'unknown',
  }
  const listeners = new Set<() => void>()
  return {
    store: {
      getSnapshot: () => current,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    update: (next) => {
      // Identity is what `useSyncExternalStore` compares, so a re-read that
      // answers the same thing must not hand back a new object: doing so would
      // re-render every subscriber on every unrelated host event.
      if ((Object.keys(next) as ComponentKey[]).every((key) => next[key] === current[key])) return
      current = next
      for (const listener of listeners) listener()
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
