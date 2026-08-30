export const name = '@hytime/dsh-thinking-effort'
export const inject = ['settings', 'timer'] as const

export function apply(_ctx: unknown): void {
  // Client composition is migrated in a later task.
}

type ModuleLoader = {
  load(descriptor: {
    id: string
    factory: (require: unknown) => unknown
  }): void
}

declare global {
  interface Window {
    __ModuleLoader__?: ModuleLoader
  }
}

if (typeof window !== 'undefined') {
  window.__ModuleLoader__?.load({
    id: name,
    factory: () => ({ name, inject, apply }),
  })
}
