import type {
  CompatibilitySettings,
  DshCompatibilityCapabilities,
} from '../client/types.js'

export type { CompatibilitySettings, DshCompatibilityCapabilities } from '../client/types.js'

type MethodName = 'describe' | 'mutate' | 'get' | 'update'

function hasMethods(value: unknown, methods: readonly MethodName[]): boolean {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false

  return methods.every((method) => {
    let current: object | null = value
    while (current !== null) {
      const descriptor = Object.getOwnPropertyDescriptor(current, method)
      if (descriptor === undefined) {
        current = Object.getPrototypeOf(current)
        continue
      }
      return 'value' in descriptor
        ? typeof descriptor.value === 'function'
        : typeof Reflect.get(value, method) === 'function'
    }
    return false
  })
}

function capabilities(settings: CompatibilitySettings, externalLanguages: boolean): DshCompatibilityCapabilities {
  return { settings, externalLanguages }
}

export function clientCapabilities(input: {
  readonly remoteSettings?: unknown
  readonly legacySettings?: unknown
  readonly addLanguage?: unknown
}): DshCompatibilityCapabilities {
  const settings = hasMethods(input.remoteSettings, ['describe', 'mutate'])
    ? 'remote'
    : hasMethods(input.legacySettings, ['describe', 'mutate'])
      ? 'legacy'
      : 'none'

  return capabilities(settings, typeof input.addLanguage === 'function')
}

export function hostCapabilities(input: {
  readonly settings?: unknown
}): DshCompatibilityCapabilities {
  const settings = hasMethods(input.settings, ['get', 'update', 'describe'])
    ? 'legacy'
    : 'none'

  return capabilities(settings, false)
}
