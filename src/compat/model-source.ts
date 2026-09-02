function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function hasModelSourceConflict(profile: unknown): boolean {
  if (!isPlainObject(profile) || !Array.isArray(profile.models) || profile.models.length === 0) return false
  const overrides = profile.modelOverrides
  return isPlainObject(overrides) && Object.getOwnPropertyNames(overrides).length > 0
}

export function hasLayeredModelSourceConflict(namespace: unknown, route: string): boolean {
  if (route.trim() === '' || !isPlainObject(namespace)) return false
  let hasModels = false
  let hasOverrides = false
  for (const layerName of ['value', 'base', 'user'] as const) {
    if (!Object.prototype.hasOwnProperty.call(namespace, layerName)) continue
    const layer = namespace[layerName]
    if (!isPlainObject(layer)) continue
    const providers = layer.providers
    if (!isPlainObject(providers) || !Object.prototype.hasOwnProperty.call(providers, route)) continue
    const profile = providers[route]
    if (!isPlainObject(profile)) continue
    hasModels ||= Array.isArray(profile.models) && profile.models.length > 0
    hasOverrides ||= isPlainObject(profile.modelOverrides) && Object.getOwnPropertyNames(profile.modelOverrides).length > 0
    if (hasModels && hasOverrides) return true
  }
  return false
}
