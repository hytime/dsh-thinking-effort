import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { settingsBridge } from '../src/client/settings-bridge.js'
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

type WebStartOptions = {
  readonly command?: string
  readonly args?: readonly string[]
}

type OfficialRpcResponse = {
  readonly status: number
  readonly body: {
    readonly type?: string
    readonly rpcId?: string
    readonly result?: unknown
  }
}

async function callOfficialRpc(
  baseUrl: string,
  headers: Record<string, string>,
  endpoint: string,
  args: Record<string, unknown>,
  wrapArgs = true,
): Promise<OfficialRpcResponse> {
  const response = await fetch(new URL(`/api/${endpoint}`, baseUrl), {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `loader-${endpoint.replaceAll('/', '-')}`,
      method: endpoint,
      payload: wrapArgs ? { args } : args,
    }),
    signal: AbortSignal.timeout(10000),
  })
  return {
    status: response.status,
    body: await response.json() as OfficialRpcResponse['body'],
  }
}

function extractBundleUrl(html: string, packageName: string): string {
  const prefixes = [
    '<script>globalThis["__DSH_BOOT__"] = ',
    '<script>window.__DSH_BOOT__ = ',
  ]
  const matchedPrefix = prefixes.find((candidate) => html.includes(candidate))
  if (matchedPrefix === undefined) throw new Error('DSH Web page did not inject __DSH_BOOT__')
  const start = html.indexOf(matchedPrefix)
  const valueStart = start + matchedPrefix.length
  const end = html.indexOf('</script>', valueStart)
  if (end === -1) throw new Error('DSH Web page has an unterminated __DSH_BOOT__ injection')
  const graph = JSON.parse(html.slice(valueStart, end)) as {
    entries?: Array<{ id?: string; url?: string }>
  }
  const entry = graph.entries?.find((candidate) => candidate.id === packageName)
  if (entry?.url === undefined) throw new Error(`DSH Web graph did not advertise ${packageName}`)
  return entry.url
}

async function startOfficialWeb(cliRoot: string, home: string, options: WebStartOptions = {}): Promise<RunningWeb> {
  const child = spawn(options.command ?? 'pnpm', options.args ?? ['dsh', '--profile', 'web', '--no-open', '--port', '0'], {
    cwd: cliRoot,
    env: { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  let timer: NodeJS.Timeout | undefined
  let resolveUrl: ((url: string) => void) | undefined
  let rejectUrl: ((error: Error) => void) | undefined
  let stopped = false
  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    if (child.exitCode !== null || child.signalCode !== null) return
    await new Promise<void>((resolveExit) => {
      const onExit = (): void => {
        child.removeListener('exit', onExit)
        resolveExit()
      }
      child.once('exit', onExit)
      child.kill('SIGTERM')
      if (child.exitCode !== null || child.signalCode !== null) onExit()
    })
  }
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

  try {
    const launchUrl = await url
    const baseUrl = new URL(launchUrl)
    let cookie = ''
    if (baseUrl.searchParams.has('token')) {
      const launchResponse = await fetch(launchUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(10000),
      })
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
      stop,
    }
  } catch (error) {
    if (timer !== undefined) clearTimeout(timer)
    await stop()
    throw error
  }
}

describe('official DSH web startup cleanup', () => {
  it('stops and waits for the child when token exchange fails', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-thinking-effort-cleanup-'))
    const markerPath = join(directory, 'child-state')
    const script = [
      "import { writeFileSync } from 'node:fs'",
      `const marker = ${JSON.stringify(markerPath)}`,
      "writeFileSync(marker, 'started')",
      "process.on('SIGTERM', () => { writeFileSync(marker, 'stopped'); process.exit(0) })",
      "process.stdout.write('http://127.0.0.1:1/?token=broken\\n')",
      'setInterval(() => {}, 1000)',
    ].join(';')

    try {
      await expect(startOfficialWeb('/tmp', directory, {
        command: process.execPath,
        args: ['--input-type=module', '-e', script],
      })).rejects.toThrow()
      expect(readFileSync(markerPath, 'utf8')).toBe('stopped')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

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
    const marker = JSON.parse(readFileSync(join(home, 'thinking-effort-loaded.json'), 'utf8')) as {
      event?: string
      name?: string
      at?: string
      pid?: number
    }
    expect(marker).toMatchObject({ event: 'apply', name: '@hytime/dsh-thinking-effort' })
    expect(marker.at).toEqual(expect.any(String))
    expect(marker.pid).toEqual(expect.any(Number))

    const clientCode = readFileSync(clientEntry, 'utf8')
    const registered: Array<{ id?: string; factory?: unknown }> = []
    const webHome = mkdtempSync(join(tmpdir(), 'dsh-thinking-effort-web-'))
    try {
      runOfficialDsh(cliRoot, webHome, ['plugin', '--profile', 'web', 'add', tarball])
      const web = await startOfficialWeb(cliRoot, webHome, {
        args: cliRoot.includes('dsh-v0.1.0-rc.7')
          ? ['dsh', '--profile', 'web', '--port', '0']
          : ['dsh', '--profile', 'web', '--no-open', '--port', '0'],
      })
      try {
        const headers = web.cookie === '' ? {} : { cookie: web.cookie }
        const legacyRpc = cliRoot.includes('dsh-v0.1.1-rc.2') || cliRoot.includes('dsh-v0.1.0-rc.7')
        const describeEndpoint = legacyRpc ? 'settings.describe' : 'settings/describe'
        const mutateEndpoint = legacyRpc ? 'settings.mutate' : 'settings/mutate'
        const settingsDescribe = await callOfficialRpc(web.url, headers, describeEndpoint, {}, !legacyRpc)
        expect(settingsDescribe.status).toBe(200)
        expect(settingsDescribe.body).toMatchObject({
          type: 'server-response',
          result: { ok: true },
        })
        const described = settingsDescribe.body.result as {
          ok: boolean
          value?: { namespaces?: Array<{ ns?: string; revision?: number }> }
        }
        expect(described.value?.namespaces?.length).toBeGreaterThan(0)
        const namespace = described.value?.namespaces?.[0]
        expect(namespace?.ns).toEqual(expect.any(String))
        expect(namespace?.revision).toEqual(expect.any(Number))
        const settingsMutate = await callOfficialRpc(web.url, headers, mutateEndpoint, {
          ns: namespace!.ns,
          ops: [],
          expectedRevision: namespace!.revision,
        }, !legacyRpc)
        expect(settingsMutate.status).toBe(200)
        expect(settingsMutate.body).toMatchObject({
          type: 'server-response',
          result: { ok: true },
        })
        const liveResult = (endpoint: string, args: Record<string, unknown>): Promise<unknown> => (
          callOfficialRpc(web.url, headers, endpoint, args, !legacyRpc).then((response) => (
            legacyRpc ? { result: response.body.result } : response.body.result
          ))
        )
        const settings = legacyRpc
          ? settingsBridge({ api: { settings: {
            describe: () => liveResult(describeEndpoint, {}),
            mutate: (args) => liveResult(mutateEndpoint, args),
          } } })
          : settingsBridge(undefined, {
            describe: () => liveResult(describeEndpoint, {}),
            mutate: (ns, ops, expectedRevision) => liveResult(mutateEndpoint, { ns, ops, expectedRevision }),
          })
        expect(settings).toBeDefined()
        const bridgedDescription = await settings!.describe()
        expect(bridgedDescription).toMatchObject({
          ok: true,
          value: { namespaces: expect.any(Array) },
        })
        await expect(settings!.mutate(namespace!.ns!, [], namespace!.revision!)).resolves.toMatchObject({
          ok: true,
          value: { ns: namespace!.ns },
        })
        const indexResponse = await fetch(web.url, {
          headers,
          signal: AbortSignal.timeout(10000),
        })
        expect(indexResponse.status).toBe(200)
        const bundleUrl = extractBundleUrl(await indexResponse.text(), '@hytime/dsh-thinking-effort')
        expect(bundleUrl).toMatch(/\/plugins\/(?:\?\?@hytime\/dsh-thinking-effort\/client\.js&rev=|@hytime\/dsh-thinking-effort\/client\.js\?rev=)/)
        const response = await fetch(new URL(bundleUrl, web.url), {
          headers,
          signal: AbortSignal.timeout(10000),
        })
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
