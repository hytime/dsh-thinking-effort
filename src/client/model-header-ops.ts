import type { SettingsOp } from './types.js'
import { modelPath } from '../compat/opencode-session.js'

export function openCodeSessionOp(
  provider: string,
  model: string,
  enabled: boolean,
): SettingsOp | undefined {
  const path = modelPath(provider, model)
  if (path === undefined) return undefined
  return enabled
    ? { op: 'set', path, value: true }
    : { op: 'unset', path }
}
