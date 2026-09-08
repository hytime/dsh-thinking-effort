export const OPENCODE_SESSION_NAMESPACE = 'dsh-thinking-effort'
export const OPENCODE_SESSION_HEADER = 'x-opencode-session'

export interface OpenCodeSessionSettings {
  readonly opencodeSession?: {
    readonly providers?: Readonly<Record<string, {
      readonly models?: Readonly<Record<string, boolean>>
    }>>
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function ownRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  const object = record(value)
  if (object === undefined || !Object.prototype.hasOwnProperty.call(object, key)) return undefined
  return record(object[key])
}

export function isOpenCodeSessionEnabled(
  settings: unknown,
  provider: string,
  model: string,
): boolean {
  if (provider.length === 0 || model.length === 0) return false
  const opencodeSession = ownRecord(settings, 'opencodeSession')
  const providers = ownRecord(opencodeSession, 'providers')
  const providerSettings = ownRecord(providers, provider)
  const models = ownRecord(providerSettings, 'models')
  return Object.prototype.hasOwnProperty.call(models ?? {}, model) && models?.[model] === true
}

export function modelPath(provider: string, model: string): readonly string[] | undefined {
  if (provider.length === 0 || model.length === 0) return undefined
  return ['opencodeSession', 'providers', provider, 'models', model]
}
