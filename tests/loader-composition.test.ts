import { createServer } from 'node:http'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { afterAll, describe, expect, it } from 'vitest'

type PackageManifest = {
  readonly name?: string
  readonly version: string
  readonly main?: string
  readonly types?: string
  readonly exports: Record<string, string | { readonly types?: string; readonly default?: string }>
  readonly files: readonly string[]
  readonly dsh?: { readonly client?: { readonly platform?: string; readonly external?: readonly string[] } }
}

const root = resolve(import.meta.dirname, '..')
const integrationEnabled = process.env.DSH_LOADER_INTEGRATION === '1'
const integrationDescribe = integrationEnabled ? describe : describe.skip

function readPackage(): PackageManifest {
  return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as PackageManifest
}

function runOfficialDsh(cliRoot: string, home: string, args: readonly string[]): string {
  const result = spawnSync('pnpm', ['dsh', ...args], {
    cwd: cliRoot,
    env: { ...process.env, DSH_HOME: home },
    encoding: 'utf8',
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`official dsh command failed (${result.status ?? 'no status'}): pnpm dsh ${args.join(' ')}\n${output}`)
  }
  return output
}

describe('published package composition', () => {
  it('exposes built Host and Client artifacts with declarations', () => {
    const manifest = readPackage()

    expect(manifest.version).toBe('0.1.11')
    expect(manifest.main).toBe('./lib/index.js')
    expect(manifest.types).toBe('./lib/types/index.d.ts')
    expect(manifest.exports['.']).toEqual({
      types: './lib/types/index.d.ts',
      default: './lib/index.js',
    })
    expect(manifest.exports['./client']).toEqual({
      types: './lib/types/client/index.d.ts',
      default: './lib/client.js',
    })
    expect(manifest.dsh?.client).toEqual({ platform: 'web' })
    expect(manifest.files).toContain('lib/index.js')
    expect(manifest.files).toContain('lib/client.js')
    expect(manifest.files).toContain('lib/types/**/*.d.ts')
    expect(manifest.files).toContain('cordis.patch.yml')
    expect(manifest.files).toContain('README.md')
    expect(manifest.files).toContain('INSTALL.md')
    expect(manifest.files).toContain('CHANGELOG.md')
    expect(manifest.files).toContain('docs/assets/')
  })
})

integrationDescribe('official DSH loader composition', () => {
  const cliRoot = process.env.DSH_CLI_ROOT
  const home = mkdtempSync(join(tmpdir(), 'dsh-thinking-effort-loader-'))
  const packDestination = mkdtempSync(join(tmpdir(), 'dsh-thinking-effort-pack-'))
  const profile = join(home, 'profiles', 'compat')

  afterAll(() => {
    rmSync(home, { recursive: true, force: true })
    rmSync(packDestination, { recursive: true, force: true })
  })

  it('installs the local tarball through official dsh and composes both faces', async () => {
    if (cliRoot === undefined || cliRoot === '') {
      throw new Error('DSH_CLI_ROOT must point to an official DSH checkout when DSH_LOADER_INTEGRATION=1')
    }

    expect(existsSync(profile)).toBe(false)
    const packed = JSON.parse(execFileSync('npm', [
      'pack', '--json', '--pack-destination', packDestination,
    ], {
      cwd: root,
      env: { ...process.env, npm_config_cache: '/tmp/dsh-pi-effort-npm-cache' },
      encoding: 'utf8',
    })) as Array<{ filename: string }>
    const tarball = packed[0]?.filename
    if (tarball === undefined) throw new Error('npm pack did not report a tarball filename')

    runOfficialDsh(cliRoot, home, ['plugin', '--profile', 'compat', 'add', join(packDestination, tarball)])

    const profileManifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(profileManifest.dependencies?.['@hytime/dsh-thinking-effort']).toBeDefined()
    expect(profileManifest.dependencies?.['dsh-thinking-effort']).toBeUndefined()

    const dump = runOfficialDsh(cliRoot, home, ['--profile', 'compat', '--dump-default-config'])
    expect(dump).toContain('id: thinking-effort')
    expect(dump).toContain("name: '@hytime/dsh-thinking-effort'")
    expect(dump).not.toContain('name: dsh-thinking-effort')

    const installedDir = join(profile, 'node_modules', '@hytime', 'dsh-thinking-effort')
    const installedManifest = JSON.parse(readFileSync(join(installedDir, 'package.json'), 'utf8')) as PackageManifest
    expect(installedManifest.name).toBe('@hytime/dsh-thinking-effort')
    expect(installedManifest.version).toBe('0.1.11')

    const hostEntry = join(installedDir, 'lib', 'index.js')
    const clientEntry = join(installedDir, 'lib', 'client.js')
    expect(existsSync(hostEntry)).toBe(true)
    expect(existsSync(clientEntry)).toBe(true)

    execFileSync(process.execPath, ['--input-type=module', '-e', [
      `const host = await import(${JSON.stringify(pathToFileURL(hostEntry).href)})`,
      'host.apply({ settings: undefined, timeout: () => {}, on: () => {} })',
    ].join(';')], {
      cwd: cliRoot,
      env: { ...process.env, DSH_HOME: home },
      encoding: 'utf8',
    })
    const marker = JSON.parse(readFileSync(join(home, 'thinking-effort-loaded.json'), 'utf8')) as { event?: string }
    expect(marker.event).toBe('apply')

    const clientCode = readFileSync(clientEntry, 'utf8')
    const registered: Array<{ id?: string; factory?: unknown }> = []
    const server = createServer((request, response) => {
      if (request.url !== '/plugins/@hytime/dsh-thinking-effort/client.js') {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, { 'content-type': 'text/javascript' }).end(clientCode)
    })
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen)
      server.listen(0, '127.0.0.1', resolveListen)
    })
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('temporary bundle server did not expose a port')
      const response = await fetch(`http://127.0.0.1:${address.port}/plugins/@hytime/dsh-thinking-effort/client.js`)
      expect(response.status).toBe(200)
      const servedCode = await response.text()
      expect(servedCode).toBe(clientCode)
      runInNewContext(servedCode, {
        window: {
          __ModuleLoader__: {
            load(entry: { id?: string; factory?: unknown }) {
              registered.push(entry)
            },
          },
        },
      })
    } finally {
      await new Promise<void>((resolveClose) => { server.close(() => resolveClose()) })
    }
    expect(registered).toHaveLength(1)
    expect(registered[0]?.id).toBe('@hytime/dsh-thinking-effort')
    expect(typeof registered[0]?.factory).toBe('function')
  })
})
