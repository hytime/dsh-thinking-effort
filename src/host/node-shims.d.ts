declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void
}

declare module 'node:path' {
  export function join(...parts: string[]): string
}

declare module '@deepseek-ai/dsh-settings' {
  import type { Context } from '@deepseek-ai/cordis'
  import type z from '@deepseek-ai/schemastery'

  export function settingsNamespace(value: string): string
  export function installSettingsSection<T>(
    ctx: Context,
    namespace: string,
    schema: z<T>,
    entry: T,
    hooks: {
      setSource(source: () => T): void
      onChange(): void
      validate?: (value: T) => void
    },
  ): void
}
