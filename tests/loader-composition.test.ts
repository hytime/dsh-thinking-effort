import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
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

function packLocalPackage(destination: string): string {
  const packed = JSON.parse(execFileSync('npm', [
    'pack', '--json', '--pack-destination', destination,
  ], {
    cwd: root,
    env: { ...process.env, npm_config_cache: '/tmp/dsh-pi-effort-npm-cache' },
    encoding: 'utf8',
  })) as Array<{ filename: string }>
  const tarball = packed[0]?.filename
  if (tarball === undefined) throw new Error('npm pack did not report a tarball filename')
  return join(destination, basename(tarball))
}

type RunningWeb = {
  readonly url: string
  readonly cookie: string
  readonly stop: () => Promise<void>
}

function extractBundleUrl(html: string, packageName: string): string {
  const prefix = '<script>globalThis["__DSH_BOOT__"] = '
  const start = html.indexOf(prefix)
  if (start === -1) throw new Error('DSH Web page did not inject __DSH_BOOT__')
  const valueStart = start + prefix.length
  const end = html.indexOf('</script>', valueStart)
  if (end === -1) throw new Error('DSH Web page has an unterminated __DSH_BOOT__ injection')
  const graph = JSON.parse(html.slice(valueStart, end)) as {
    entries?: Array<{ id?: string; url?: string }>
  }
  const entry = graph.entries?.find((candidate) => candidate.id === packageName)
  if (entry?.url === undefined) throw new Error(`DSH Web graph did not advertise ${packageName}`)
  return entry.url
}

async function startOfficialWeb(cliRoot: string, home: string): Promise<RunningWeb> {
  const child = spawn('pnpm', ['dsh', '--profile', 'web', '--no-open', '--port', '0'], {
    cwd: cliRoot,
    env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let timer: NodeJS.Timeout | undefined
  let resolveUrl: ((url: string) => void) | undefined
  let rejectUrl: ((error: Error) => void) | undefined
  const url = new Promise<string>((resolveUrlPromise, rejectUrlPromise) => {
    resolveUrl = resolveUrlPromise
    rejectUrl = rejectUrlPromise
  })
  const consume = (chunk: Buffer): void => {
    output += chunk.toString()
    const match = output.match(/https?:\/\/127\.0\.0\.1:\d+(?:\/\?token=[^\s]+)?/)
    if (match !== null) {
      if (timer !== undefined) clearTimeout(timer)
      resolveUrl?.(match[0])
    }
  }
  child.stdout?.on('data', consume)
  child.stderr?.on('data', consume)
  child.once('error', (error) => rejectUrl?.(error))
  child.once('exit', (code, signal) => {
    if (resolveUrl === undefined) return
    rejectUrl?.(new Error(`DSH web exited before announcing a URL (code=${code}, signal=${signal})\n${output}`))
  })
  timer = setTimeout(() => rejectUrl?.(new Error(`timed out waiting for DSH web URL\n${output}`)), 30000)

  const launchUrl = await url
  const baseUrl = new URL(launchUrl)
  let cookie = ''
  if (baseUrl.searchParams.has('token')) {
    const launchResponse = await fetch(launchUrl, { redirect: 'manual' })
    if (launchResponse.status !== 303) {
      throw new Error(`DSH Web token exchange failed with HTTP ${String(launchResponse.status)}`)
    }
    const setCookie = launchResponse.headers.get('set-cookie')
    if (setCookie === null) throw new Error('DSH Web token exchange did not set a session cookie')
    cookie = setCookie.split(';', 1)[0]!
    baseUrl.search = ''
  }

  console.log(`[DSH loader integration] ${cliRoot} ${baseUrl.href}`)

  return {
    url: baseUrl.href,
    cookie,
    stop: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return
      child.kill('SIGTERM')
      await new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()))
    },
  }
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

  it('installs the local tarball through official dsh and serves the actual Web bundle route', { timeout: 60000 }, async () => {
    if (cliRoot === undefined || cliRoot === '') {
      throw new Error('DSH_CLI_ROOT must point to an official DSH checkout when DSH_LOADER_INTEGRATION=1')
    }

    expect(existsSync(profile)).toBe(false)
    const tarball = packLocalPackage(packDestination)

    runOfficialDsh(cliRoot, home, ['plugin', '--profile', 'compat', 'add', tarball])

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
    const marker = JSON.parse(readFileSync(join(home, 'thinking-effort-loaded.json'), 'utf8')) as { event?: string; name?: string }
    expect(marker).toMatchObject({ event: 'apply', name: '@hytime/dsh-thinking-effort' })

    const clientCode = readFileSync(clientEntry, 'utf8')
    const registered: Array<{ id?: string; factory?: unknown }> = []
    const webHome = mkdtempSync(join(tmpdir(), 'dsh-thinking-effort-web-'))
    try {
      runOfficialDsh(cliRoot, webHome, ['plugin', '--profile', 'web', 'add', tarball])
      const web = await startOfficialWeb(cliRoot, webHome)
      try {
        const headers = web.cookie === '' ? {} : { cookie: web.cookie }
        const indexResponse = await fetch(web.url, { headers })
        expect(indexResponse.status).toBe(200)
        const bundleUrl = extractBundleUrl(await indexResponse.text(), '@hytime/dsh-thinking-effort')
        expect(bundleUrl).toMatch(/\/plugins\/(?:\?\?@hytime\/dsh-thinking-effort\/client\.js&rev=|@hytime\/dsh-thinking-effort\/client\.js\?rev=)/)
        const response = await fetch(new URL(bundleUrl, web.url), { headers })
        expect(response.status).toBe(200)
        const servedCode = await response.text()
        expect(servedCode).toContain(clientCode)
        expect(servedCode).toContain("id: '@hytime/dsh-thinking-effort'")
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
        await web.stop()
      }
    } finally {
      rmSync(webHome, { recursive: true, force: true })
    }
    expect(registered).toHaveLength(1)
    expect(registered[0]?.id).toBe('@hytime/dsh-thinking-effort')
    expect(typeof registered[0]?.factory).toBe('function')
  })
})
