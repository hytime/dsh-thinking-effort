import { hasMethods } from './capabilities.js'
import { isUnknownRecord } from '../shared/guards.js'
import { createSelectionDirectory, type SelectionDirectoryFace, type SelectionProjectionFace } from './model-selection-directory.js'
import type { ClientContext } from '../client/types.js'
import type { ModelDirectoryState, ModelSelection } from '../client/thinking-slider/slider.js'

/** Runtime generation selected by the DSH remote surface. */
export type ModelDirectoryGeneration = 'connection' | 'session'

/** Minimal runtime face shared by the official model-directory generations. */
export interface ModelDirectoriesSeam {
  directoryFor(sessionId: string): {
    readonly store: Readonly<{ getSnapshot(): ModelDirectoryState; subscribe(fn: () => void): () => void }>
    load(): Promise<unknown>
    select(selection: ModelSelection): Promise<unknown>
  }
}

export type ModelDirectoryFace = Pick<SelectionDirectoryFace, 'directory' | 'load' | 'select'>

interface SessionProjectionBinding {
  readonly session: { readonly projections: { faceOf(key: string): unknown } }
}
interface SessionScopes {
  binding(sessionId: string): SessionProjectionBinding | undefined
  scope(sessionId: string): Pick<ClientContext, 'effect'> | undefined
}

/** The plain directory face used whenever the retained-selection overlay cannot run. */
function plainFace(instance: ReturnType<ModelDirectoriesSeam['directoryFor']>): ModelDirectoryFace {
  return {
    directory: instance.store,
    load: () => { void instance.load().catch(() => {}) },
    select: (selection) => instance.select(selection).then(result => !isUnknownRecord(result) || result.ok !== false, () => false),
  }
}

/** Resolve public projection access without reading the directory's private fields. */
export function createModelDirectoryFaceResolver(
  context: ClientContext,
  directories: ModelDirectoriesSeam,
): (sessionId: string) => ModelDirectoryFace {
  const value = context.get('sessions')
  const sessions = isUnknownRecord(value) && typeof value.binding === 'function' && typeof value.scope === 'function'
    ? value as unknown as SessionScopes : undefined
  const cached = new WeakMap<SessionProjectionBinding, { instance: object; projected: SelectionProjectionFace; face: SelectionDirectoryFace; dispose: () => void }>()
  const active = new Map<SelectionDirectoryFace, () => void>()
  if (sessions !== undefined) {
    context.on('connection/reset', () => { for (const face of active.keys()) face.reset() })
    context.effect(() => () => {
      for (const dispose of active.values()) dispose()
      active.clear()
    })
  }
  return (sessionId) => {
    const instance = directories.directoryFor(sessionId)
    const binding = sessions?.binding(sessionId)
    const owner: unknown = sessions?.scope(sessionId)
    const scope = typeof (owner as { effect?: unknown } | null | undefined)?.effect === 'function'
      ? owner as Pick<ClientContext, 'effect'>
      : undefined
    const projections = binding?.session?.projections
    const projected = typeof projections?.faceOf === 'function' ? projections.faceOf('modelSelection') : undefined
    if (binding === undefined || scope === undefined
      || !isUnknownRecord(projected)
      || typeof projected.getSnapshot !== 'function' || typeof projected.subscribe !== 'function') {
      return plainFace(instance)
    }
    const projection = projected as unknown as SelectionProjectionFace
    const previous = cached.get(binding)
    if (previous?.instance === instance && previous.projected === projection) return previous.face
    const face = createSelectionDirectory(instance, projection)
    let disposed = false
    let releaseOwner: unknown
    const dispose = (): void => {
      if (disposed) return
      disposed = true
      face.dispose()
      active.delete(face)
      if (cached.get(binding)?.face === face) cached.delete(binding)
      if (typeof releaseOwner === 'function') releaseOwner()
    }
    // Register the session-scoped cleanup BEFORE caching the wrapper: a closing
    // session can refuse the effect, and caching first would hand out a live
    // wrapper that no scope ever disposes.
    try {
      releaseOwner = scope.effect(() => dispose)
    } catch {
      face.dispose()
      return plainFace(instance)
    }
    previous?.dispose()
    cached.set(binding, { instance, projected: projection, face, dispose })
    active.set(face, dispose)
    return face
  }
}

/** Read and narrow the optional host model-directory service. */
export function asModelDirectories(value: unknown): ModelDirectoriesSeam | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const service = value as { directoryFor?: unknown }
  return typeof service.directoryFor === 'function' ? value as ModelDirectoriesSeam : undefined
}

/**
 * Detect the modern session Remote namespace by method shape. DSH rc.7/rc.8
 * use `connection.api.sessions` and do not provide `remote.session`.
 * @param context - Client context with inject-free service reads.
 * @returns Whether the session Remote generation is installed.
 */
export function hasSessionRemote(context: ClientContext): boolean {
  return hasMethods(context.get('remote.session'), ['modelCatalog'])
}

/**
 * Build the exact Cordis dependencies for the official model-directory
 * generation. Older DSH builds must not inject the missing `remote.session`
 * service: Cordis parks such a fiber until the service exists.
 * @param context - Client context used for the generation probe.
 * @returns The generation and its required injected services.
 */
export function modelDirectoryCompatibility(context: ClientContext): {
  readonly generation: ModelDirectoryGeneration
  readonly inject: readonly string[]
} {
  return hasSessionRemote(context)
    ? {
        generation: 'session',
        inject: ['slots', 'modelDirectories', 'sessions', 'remote', 'remote.session'],
      }
    : {
        generation: 'connection',
        inject: ['slots', 'modelDirectories', 'sessions', 'connection', 'remote'],
      }
}
