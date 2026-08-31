declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void
}

declare module 'node:path' {
  export function join(...parts: string[]): string
}
