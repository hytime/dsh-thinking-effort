/**
 * Which of this bundle's components are switched on.
 *
 * The bundle splits into seven Cordis entries so each feature can be turned off
 * on its own, but the browser artifact is ONE file: `dsh.client` is declared per
 * package, so the Loader fetches and runs `lib/client.js` once no matter how
 * many entries the profile enables. Every client surface therefore has to ask
 * the Host which rows are live, or a disabled component keeps rendering
 * controls that no longer do anything — the OpenCode card would still let a user
 * pick a header format for a host plugin that is not running.
 *
 * The inventory's `enabled` is the Loader's effective value, so it already
 * accounts for a disabled ancestor GROUP — but not for one row depending on
 * another row's feature, which is what {@link COMPONENT_DEPENDENCIES} covers.
 *
 * @module @hytime/dsh-plugin-kit/shared/component-switches
 */

/** One switchable component of this bundle: its Loader row id and its host module. */
export interface ComponentRow {
  /** The Cordis composition row id the profile patch addresses. */
  readonly rowId: string
  /** The module that row names. */
  readonly moduleName: string
}

/**
 * Every row this bundle declares, in composition order.
 *
 * The root row keeps the id `thinking-effort` rather than `thinking-effort-levels`
 * because existing profiles already carry it with their whole `config`; see the
 * note in `cordis.patch.yml`.
 */
export const COMPONENT_ROWS = {
  levels: { rowId: 'thinking-effort', moduleName: '@hytime/dsh-thinking-effort' },
  settings: { rowId: 'thinking-effort-settings', moduleName: '@hytime/dsh-thinking-effort/settings' },
  opencode: { rowId: 'thinking-effort-opencode', moduleName: '@hytime/dsh-thinking-effort/opencode' },
  compaction: { rowId: 'thinking-effort-compaction', moduleName: '@hytime/dsh-thinking-effort/compaction' },
  subagent: { rowId: 'thinking-effort-subagent', moduleName: '@hytime/dsh-thinking-effort/subagent' },
  migration: { rowId: 'thinking-effort-migration', moduleName: '@hytime/dsh-thinking-effort/migration' },
  composer: { rowId: 'thinking-effort-composer', moduleName: '@hytime/dsh-thinking-effort/composer' },
} as const satisfies Record<string, ComponentRow>

/** A switchable component's key in {@link COMPONENT_ROWS}. */
export type ComponentKey = keyof typeof COMPONENT_ROWS

/**
 * Which components stop working when another one is switched off.
 *
 * The rows are not peers. Every feature entry reads its configuration from the
 * settings section the ROOT row publishes, and every settings card is rendered
 * by the panel that the `settings` row owns — so switching either of those off
 * leaves the dependants running against a section nobody publishes, or with no
 * surface to configure them.
 *
 * The direction is "these stop when I stop": {@link COMPONENT_DEPENDENCIES}
 * maps a parent to the children it takes down with it. Dependencies are
 * transitive — switching the root off disables everything — and a child may
 * name several parents, any one of which is enough.
 *
 * Deliberately NOT a dependency: `composer`. The seat renders the tiers the
 * OFFICIAL `modelDirectories` service resolves, not anything this plugin
 * writes, so it keeps working with the root off.
 */
export const COMPONENT_DEPENDENCIES = {
  /** The root row publishes the settings section every other feature reads. */
  levels: ['settings', 'opencode', 'compaction', 'subagent', 'migration'],
  /** The panel is the only surface that configures those features. */
  settings: ['opencode', 'compaction', 'subagent', 'migration'],
} as const satisfies Partial<Record<ComponentKey, readonly ComponentKey[]>>

/** Parents of one component: switching any of them off takes this one down too. */
export type ComponentParents = typeof COMPONENT_DEPENDENCIES

/** What one component's switch resolves to. */
export type ComponentSwitchState =
  /** The Host reports the row live. */
  | 'on'
  /** The Host reports the row disabled, or its fiber is not active. */
  | 'off'
  /**
   * The Host could not answer — an older host without the inventory remote, or a
   * read that failed. Treated as ON by {@link componentEnabled}, because hiding
   * a working surface is worse than showing one whose switch may be stale.
   */
  | 'unknown'

/** One row as the Host's inventory reports it. */
export interface InventoryRowLike {
  readonly entryId?: unknown
  readonly moduleName?: unknown
  readonly enabled?: unknown
}

/** The Host's answer, as far as this module needs it. */
export interface InventorySnapshotLike {
  readonly entries?: readonly InventoryRowLike[]
}

/**
 * Resolve every component switch from one inventory snapshot.
 *
 * A row is matched by module name rather than by entry id: the inventory's
 * `entryId` is a Loader-internal branded id, while `moduleName` is the specifier
 * the composition declares — the same string this bundle's `cordis.patch.yml`
 * names. Matching on it keeps the answer correct even if the Loader renumbers
 * entry ids across a reload.
 *
 * @param snapshot - the Host's inventory, or `undefined` when it could not be read.
 * @returns one state per component.
 */
export function componentSwitchesFrom(
  snapshot: InventorySnapshotLike | undefined,
): Record<ComponentKey, ComponentSwitchState> {
  const states = {} as Record<ComponentKey, ComponentSwitchState>
  for (const key of Object.keys(COMPONENT_ROWS) as ComponentKey[]) {
    const { moduleName } = COMPONENT_ROWS[key]
    const row = snapshot?.entries?.find((entry) => entry.moduleName === moduleName)
    // No row at all means the profile does not mount this component, which is
    // indistinguishable from disabled for rendering purposes.
    states[key] = row === undefined
      ? (snapshot === undefined ? 'unknown' : 'off')
      : (row.enabled === true ? 'on' : 'off')
  }
  return cascadeDependencies(states)
}

/**
 * Take a component down when a component it depends on is off.
 *
 * The Host reports each row's OWN switch, so a profile can leave a child row on
 * while the parent it needs is off — and then the child would render controls
 * whose configuration section nobody publishes, or that have no surface to
 * reach them from. Resolving the cascade here means every consumer sees one
 * answer instead of each surface re-deriving it.
 *
 * Only `off` propagates: a parent whose state is `unknown` was not reported as
 * disabled, and cascading that would hide working controls on a host that merely
 * cannot answer.
 *
 * @param states - each row's own state, as the Host reported it.
 * @returns the same map with dependants of a disabled parent switched off.
 */
export function cascadeDependencies(
  states: Record<ComponentKey, ComponentSwitchState>,
): Record<ComponentKey, ComponentSwitchState> {
  const resolved = { ...states }
  // Repeat to a fixed point so a chain (root → settings → opencode) settles no
  // matter which order the table names its keys.
  for (let pass = 0; pass < Object.keys(COMPONENT_ROWS).length; pass += 1) {
    let changed = false
    for (const [parent, children] of Object.entries(COMPONENT_DEPENDENCIES) as Array<[ComponentKey, readonly ComponentKey[]]>) {
      if (resolved[parent] !== 'off') continue
      for (const child of children) {
        if (resolved[child] === 'off') continue
        resolved[child] = 'off'
        changed = true
      }
    }
    if (!changed) break
  }
  return resolved
}

/**
 * Whether a component's client surface should render.
 *
 * `unknown` counts as enabled: a Host that cannot report its inventory is one
 * this plugin supports (the inventory remote is newer than the entry-config
 * settings model), and a working surface is the safer default there.
 *
 * @param state - one resolved switch.
 * @returns whether to render that component's UI.
 */
export function componentEnabled(state: ComponentSwitchState): boolean {
  return state !== 'off'
}

/**
 * Whether every client-visible component is on, which is the common case and
 * lets callers skip the per-part branching entirely.
 *
 * @param switches - the resolved map.
 * @returns whether nothing is switched off.
 */
export function allComponentsOn(switches: Record<ComponentKey, ComponentSwitchState>): boolean {
  return (Object.keys(COMPONENT_ROWS) as ComponentKey[]).every((key) => componentEnabled(switches[key]))
}
