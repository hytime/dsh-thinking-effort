import {
  AgentRequestConfig,
  HostContext,
  HostSettings,
  isAgentRequestConfig,
  isUnknownRecord,
} from '@hytime/dsh-plugin-kit'
import { readSettingsSection, readSettingsSectionUser, pluginSectionId, LLM_PI_AI_NS, PLUGIN_ENTRY_ID } from '@hytime/dsh-plugin-kit'

/** The `llm-pi-ai` section id, the alias `levels` exports for it. */
const SETTINGS_NAMESPACE = LLM_PI_AI_NS
import { OPENCODE_SESSION_NAMESPACE } from '@hytime/dsh-plugin-kit'
import { hasModelSourceConflict } from '@hytime/dsh-plugin-kit'
import { ALL_LEVELS, LOG_PREFIX } from '@hytime/dsh-plugin-kit'

export const STANDARD_LEVELS = ALL_LEVELS
export type StandardLevel = (typeof STANDARD_LEVELS)[number]

type Logger = (...args: unknown[]) => void

function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args)
}

/**
 * The effort one section's user layer declares, or `undefined` when that
 * section does not override it. Only the user layer can express "unset": the
 * resolved value always carries the schema's empty-string default.
 */
function effortFromUserLayer(settings: HostSettings, namespace: string): string | undefined {
  const user = readSettingsSectionUser(settings, namespace)
  if (!isUnknownRecord(user)) return undefined
  return typeof user.subagentEffort === 'string' && user.subagentEffort.length > 0
    ? user.subagentEffort
    : undefined
}

/**
 * Read the configured subagent effort from the section that stores it.
 *
 * The plugin's own section comes first, because that is where the 0.1.7
 * entry-config model lets the plugin own the field. A miss there is not an
 * error: the releases up to 0.1.6 wrote the value into the `llm-pi-ai` section,
 * so that location stays readable and existing settings keep working. A value
 * present in both places resolves to the plugin's own section.
 *
 * `ownSectionId` is the id the plugin's section carries on the running host:
 * the Loader entry id under `entry-config`, the registered namespace under
 * `namespace`. Callers holding a live context resolve it with
 * `settingsEntryId`; the compile-time default answers for the rest.
 *
 * The logger sits in the signature because callers pass it positionally beside
 * that id; this read has nothing to log, since a missing or unreadable section
 * is `undefined` rather than an error.
 */
export function readSubagentEffort(
  settings: HostSettings | undefined,
  _logger: Logger = log,
  ownSectionId: string = PLUGIN_ENTRY_ID,
): string | undefined {
  if (settings === undefined) return undefined
  // No failure handling here on purpose: both reads go through
  // `readSettingsSectionUser`, which already answers `undefined` for a missing
  // section and swallows a throwing `describe()`, so a `catch` around them
  // could never run.
  const own = effortFromUserLayer(settings, ownSectionId)
  if (own !== undefined) return own
  return effortFromUserLayer(settings, SETTINGS_NAMESPACE)
}

/** A configured child route: both halves are present by construction. */
export interface SubagentModelRoute {
  readonly provider: string
  readonly model: string
}

/**
 * One namespace's user layer read as a route, or `undefined` when it names no
 * complete route. Both halves are required: a provider without a model names no
 * route, and the panel clears both when the user picks "inherit", so a partial
 * pair is stale data rather than a choice.
 */
function routeFromUserLayer(settings: HostSettings, namespace: string): SubagentModelRoute | undefined {
  const user = readSettingsSectionUser(settings, namespace)
  if (!isUnknownRecord(user)) return undefined
  const route = user.subagentModel
  if (!isUnknownRecord(route)) return undefined
  const provider = route.provider
  const model = route.model
  if (typeof provider !== 'string' || provider.length === 0) return undefined
  if (typeof model !== 'string' || model.length === 0) return undefined
  return { provider, model }
}

/**
 * Read the configured subagent default route.
 *
 * Only the user layer can express "unset": the resolved section always carries
 * the schema's empty-string defaults, which would otherwise pin a route the
 * user never chose and silently stop inheritance.
 *
 * The plugin's own section is read first, under both settings models. Under
 * `entry-config` that section is addressed by the Loader entry id, which
 * `settingsEntryId` supplies; under `namespace` it is addressed by the
 * namespace the plugin registers. `llm-pi-ai` is deliberately NOT a fallback:
 * the releases up to 0.1.6 wrote `subagentEffort` there, but `subagentModel`
 * never existed then, so nothing can be stored for it at that location.
 */
export function readSubagentModel(
  settings: HostSettings | undefined,
  ownSectionId: string = PLUGIN_ENTRY_ID,
): SubagentModelRoute | undefined {
  if (settings === undefined) return undefined
  const own = routeFromUserLayer(settings, ownSectionId)
  if (own !== undefined) return own
  if (ownSectionId === OPENCODE_SESSION_NAMESPACE) return undefined
  return routeFromUserLayer(settings, OPENCODE_SESSION_NAMESPACE)
}

function findModel(settings: HostSettings, config: AgentRequestConfig): unknown {
  const section = readSettingsSection(settings, SETTINGS_NAMESPACE)
  if (!isUnknownRecord(section) || !isUnknownRecord(section.providers)) return undefined
  if (typeof config.provider !== 'string' || typeof config.model !== 'string') return undefined

  if (!Object.prototype.hasOwnProperty.call(section.providers, config.provider)) return undefined
  const profile = section.providers[config.provider]
  if (!isUnknownRecord(profile)) return undefined
  if (hasModelSourceConflict(profile)) return undefined
  if (Array.isArray(profile.models)) {
    const model = profile.models.find((entry: unknown) => (
      isUnknownRecord(entry) && entry.id === config.model
    ))
    if (model !== undefined) return model
  }
  if (
    isUnknownRecord(profile.modelOverrides)
    && Object.prototype.hasOwnProperty.call(profile.modelOverrides, config.model)
  ) {
    return profile.modelOverrides[config.model]
  }
  return undefined
}

export function resolveSubagentEffort(
  settings: HostSettings | undefined,
  config: unknown,
  logger: Logger = log,
  ownSectionId: string = PLUGIN_ENTRY_ID,
): StandardLevel | string | undefined {
  const subagentEffort = readSubagentEffort(settings, logger, ownSectionId)
  if (subagentEffort === undefined) return undefined
  if (STANDARD_LEVELS.includes(subagentEffort as StandardLevel)) return subagentEffort
  if (settings === undefined || !isAgentRequestConfig(config)) return undefined

  try {
    const model = findModel(settings, config)
    if (!isUnknownRecord(model) || !isUnknownRecord(model.reasoningEfforts)) return undefined
    for (const [level, wire] of Object.entries(model.reasoningEfforts)) {
      if (typeof wire === 'string' && wire === subagentEffort) return level
    }
    logger('subagent custom effort is not mapped for', `${String(config.provider)}/${String(config.model)}`)
  } catch (error) {
    logger('resolve subagent effort error:', error instanceof Error ? error.message : String(error))
  }
  return undefined
}

function subagentAgentOf(payload: unknown): Record<string, unknown> | undefined {
  if (!isUnknownRecord(payload) || !isUnknownRecord(payload.agent)) return undefined
  const agent = payload.agent
  const session = agent.session
  if (!isUnknownRecord(session) || !isUnknownRecord(session.header)) return undefined
  return session.header.origin === 'subagent' ? agent : undefined
}

function hasAgentModelSelection(agent: Record<string, unknown> | undefined): boolean {
  const model = agent?.model
  return isUnknownRecord(model) && typeof model.current === 'function' && typeof model.select === 'function'
}

/**
 * Record the agents already told that their configured route was not applied.
 *
 * `agent/request` fires once per step, so an unguarded log would repeat for the
 * whole life of a child on an older host. A WeakSet keys that "already logged"
 * fact on the agent itself, so it neither outlives the agent nor leaks.
 */
const unappliedRouteWarned = new WeakSet<object>()

/**
 * Select the configured default route, if any, before the child's first step.
 *
 * This must run before the effort selection: the effort is resolved against
 * the model actually in use, and a custom wire value is only meaningful for the
 * provider/model pair that declares it. Selecting the route first makes the
 * subsequent `current()` read report the new route.
 *
 * No `reasoningEffort` is passed on purpose. Choosing a default model is not a
 * choice of thinking effort: the model's own default applies unless the user
 * configured a separate subagent effort, which the caller applies afterwards.
 */
function applySubagentRoute(
  ctx: Pick<HostContext, 'settings' | 'fiber'>,
  model: Record<string, unknown>,
): void {
  const select = model.select
  if (typeof select !== 'function') return
  const route = readSubagentModel(ctx.settings, pluginSectionId())
  if (route === undefined) return
  Reflect.apply(select, model, [{ provider: route.provider, model: route.model }])
}

/** Select the configured effort against the model selection now in force. */
function applySubagentEffort(
  ctx: Pick<HostContext, 'settings' | 'fiber'>,
  model: Record<string, unknown>,
): void {
  const current = model.current
  const select = model.select
  if (typeof current !== 'function' || typeof select !== 'function') return
  const selection: unknown = Reflect.apply(current, model, [])
  if (!isAgentRequestConfig(selection)
    || typeof selection.provider !== 'string'
    || typeof selection.model !== 'string') return
  const effort = resolveSubagentEffort(
    ctx.settings,
    selection,
    log,
    pluginSectionId(),
  )
  if (effort === undefined || effort === selection.reasoningEffort) return
  Reflect.apply(select, model, [{
    provider: selection.provider,
    model: selection.model,
    reasoningEffort: effort,
  }])
}

/** Select a new-host subagent's configured route and effort before its first model step. */
export function handleAgentCreated(ctx: Pick<HostContext, 'settings' | 'fiber'>, payload: unknown): void {
  const agent = subagentAgentOf(payload)
  if (agent === undefined) return
  const model = isUnknownRecord(agent.model) ? agent.model : undefined
  if (model === undefined) return

  try {
    // Order matters: the route moves the selection, and the effort is then read
    // back from that new selection. Reversing the two would resolve a custom
    // effort against the parent's route, where the model does not declare it.
    applySubagentRoute(ctx, model)
    applySubagentEffort(ctx, model)
  } catch (error) {
    log('subagent model selection error:', error instanceof Error ? error.message : String(error))
  }
}

/**
 * Report, once per agent, that a configured default route never reached the
 * request.
 *
 * `agent/request` cannot fix this: the agent loop rejects a waterfall result
 * whose provider/model differ from the selection fixed during step preparation,
 * and directs callers to `agent.model.select()` before that point instead. All
 * this hook may do is name the misconfiguration; silently ignoring it would
 * leave the user believing the panel setting works.
 */
function noteUnappliedRoute(
  ctx: Pick<HostContext, 'settings' | 'fiber'>,
  agent: Record<string, unknown>,
  config: AgentRequestConfig,
): void {
  if (unappliedRouteWarned.has(agent)) return
  const route = readSubagentModel(ctx.settings, pluginSectionId())
  if (route === undefined) return
  if (config.provider === route.provider && config.model === route.model) return
  unappliedRouteWarned.add(agent)
  log(
    'configured subagent model was not applied:',
    `${route.provider}/${route.model}`,
    'request uses',
    `${String(config.provider)}/${String(config.model)}`,
  )
}

export async function handleAgentRequest(
  ctx: Pick<HostContext, 'settings' | 'fiber'>,
  payload: unknown,
  next: () => Promise<unknown>,
): Promise<unknown> {
  const config = await next()
  try {
    const agent = subagentAgentOf(payload)
    if (agent === undefined || !isAgentRequestConfig(config)) return config
    // The route is applied at `agent/created`, and the request phase may not
    // change it, so a mismatch is only ever observable here.
    noteUnappliedRoute(ctx, agent, config)
    if (hasAgentModelSelection(agent)) return config
    const effort = resolveSubagentEffort(
      ctx.settings,
      config,
      log,
      pluginSectionId(),
    )
    return effort === undefined ? config : { ...config, reasoningEffort: effort }
  } catch (error) {
    log('agent/request override error:', error instanceof Error ? error.message : String(error))
    return config
  }
}
