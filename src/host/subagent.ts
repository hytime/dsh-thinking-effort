import {
  AgentRequestConfig,
  HostContext,
  HostSettings,
  isAgentRequestConfig,
  isUnknownRecord,
} from './types.js'
import { SETTINGS_NAMESPACE } from './settings.js'
import { readSettingsSection, readSettingsSectionUser, settingsEntryId, PLUGIN_ENTRY_ID } from '../compat/settings-model.js'
import { OPENCODE_SESSION_NAMESPACE } from '../compat/opencode-session.js'
import { hasModelSourceConflict } from '../compat/model-source.js'

export const STANDARD_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type StandardLevel = (typeof STANDARD_LEVELS)[number]

const LOG_PREFIX = '[@hytime/dsh-thinking-effort]'

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
 */
export function readSubagentEffort(
  settings: HostSettings | undefined,
  logger: Logger = log,
  ownSectionId: string = PLUGIN_ENTRY_ID,
): string | undefined {
  if (settings === undefined) return undefined
  try {
    const own = effortFromUserLayer(settings, ownSectionId)
    if (own !== undefined) return own
    return effortFromUserLayer(settings, SETTINGS_NAMESPACE)
  } catch (error) {
    logger('read subagent effort error:', error instanceof Error ? error.message : String(error))
    return undefined
  }
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

function isSubagentPayload(payload: unknown): boolean {
  if (!isUnknownRecord(payload) || !isUnknownRecord(payload.agent)) return false
  const session = payload.agent.session
  if (!isUnknownRecord(session) || !isUnknownRecord(session.header)) return false
  return session.header.origin === 'subagent'
}

export async function handleAgentRequest(
  ctx: Pick<HostContext, 'settings' | 'fiber'>,
  payload: unknown,
  next: () => Promise<unknown>,
): Promise<unknown> {
  const config = await next()
  try {
    if (!isSubagentPayload(payload) || !isAgentRequestConfig(config)) return config
    if (config.reasoningEffort !== undefined) return config
    const effort = resolveSubagentEffort(
      ctx.settings,
      config,
      log,
      settingsEntryId(ctx, OPENCODE_SESSION_NAMESPACE),
    )
    return effort === undefined ? config : { ...config, reasoningEffort: effort }
  } catch (error) {
    log('agent/request override error:', error instanceof Error ? error.message : String(error))
    return config
  }
}
