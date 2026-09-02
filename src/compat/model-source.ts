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
