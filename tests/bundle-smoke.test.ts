import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

function readArtifact(relativePath: string): string {
  try {
    return readFileSync(resolve(root, relativePath), 'utf8')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Missing ${relativePath}; run npm run build first. ${detail}`)
  }
}

describe('build artifacts', () => {
  it('emits a lazy client descriptor with the Client entry contract', () => {
    const source = readArtifact('lib/client.js')
    let descriptor: Record<string, unknown> | undefined
    const context = {
      window: {
        __ModuleLoader__: {
          load(value: Record<string, unknown>) {
            descriptor = value
          },
        },
      },
    }

    vm.runInNewContext(source, context)

    expect(descriptor?.id).toBe('@hytime/dsh-thinking-effort')
    expect(typeof descriptor?.factory).toBe('function')
    const factory = descriptor?.factory as (require: (specifier: string) => unknown) => Record<string, unknown>
    const client = factory(() => undefined)

    expect(client).toMatchObject({
      name: '@hytime/dsh-thinking-effort',
      inject: ['slots', 'connection', 'locale'],
    })
    expect(typeof client.apply).toBe('function')
  })

  it('exports the Host entry contract', async () => {
    readArtifact('lib/index.js')
    const host = await import(`${pathToFileURL(resolve(root, 'lib/index.js')).href}?smoke=${Date.now()}`)

    expect(host).toHaveProperty('name')
    expect(host).toHaveProperty('inject')
    expect(host).toHaveProperty('apply')
  })
})
