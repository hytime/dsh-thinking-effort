declare const process: {
  readonly env: Record<string, string | undefined>
  readonly pid: number
  cwd(): string
}

declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void
}

declare module 'node:path' {
  export function join(...parts: string[]): string
}
