import {
  AgentRequestConfig,
  HostContext,
  HostSettings,
  isAgentRequestConfig,
  isUnknownRecord,
} from './types.js'
import { SETTINGS_NAMESPACE } from './settings.js'

export const STANDARD_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type StandardLevel = (typeof STANDARD_LEVELS)[number]

const LOG_PREFIX = '[@hytime/dsh-thinking-effort]'

type Logger = (...args: unknown[]) => void

function log(...args: unknown[]): void {
  console.log(LOG_PREFIX, ...args)
}

function readDescriptorUser(settings: HostSettings): unknown {
  const descriptors = settings.describe()
  if (!Array.isArray(descriptors)) return undefined
  const descriptor = descriptors.find((entry: unknown) => (
    isUnknownRecord(entry) && entry.ns === SETTINGS_NAMESPACE
  ))
  return isUnknownRecord(descriptor) ? descriptor.user : undefined
}

export function readSubagentEffort(
  settings: HostSettings | undefined,
  logger: Logger = log,
): string | undefined {
  if (settings === undefined) return undefined
  try {
    const user = readDescriptorUser(settings)
    if (!isUnknownRecord(user)) return undefined
    return typeof user.subagentEffort === 'string' && user.subagentEffort.length > 0
      ? user.subagentEffort
      : undefined
  } catch (error) {
    logger('read subagent effort error:', error instanceof Error ? error.message : String(error))
    return undefined
  }
}

function findModel(settings: HostSettings, config: AgentRequestConfig): unknown {
  const section = settings.get(SETTINGS_NAMESPACE)
  if (!isUnknownRecord(section) || !isUnknownRecord(section.providers)) return undefined
  if (typeof config.provider !== 'string' || typeof config.model !== 'string') return undefined

  const profile = section.providers[config.provider]
  if (!isUnknownRecord(profile)) return undefined
  if (Array.isArray(profile.models)) {
    const model = profile.models.find((entry: unknown) => (
      isUnknownRecord(entry) && entry.id === config.model
    ))
    if (model !== undefined) return model
  }
  if (isUnknownRecord(profile.modelOverrides)) return profile.modelOverrides[config.model]
  return undefined
}

export function resolveSubagentEffort(
  settings: HostSettings | undefined,
  config: unknown,
  logger: Logger = log,
): StandardLevel | string | undefined {
  const subagentEffort = readSubagentEffort(settings, logger)
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
  ctx: Pick<HostContext, 'settings'>,
  payload: unknown,
  next: () => Promise<unknown>,
): Promise<unknown> {
  const config = await next()
  try {
    if (!isSubagentPayload(payload) || !isAgentRequestConfig(config)) return config
    if (config.reasoningEffort !== undefined) return config
    const effort = resolveSubagentEffort(ctx.settings, config)
    return effort === undefined ? config : { ...config, reasoningEffort: effort }
  } catch (error) {
    log('agent/request override error:', error instanceof Error ? error.message : String(error))
    return config
  }
}
