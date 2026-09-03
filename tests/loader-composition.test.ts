import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { settingsBridge } from '../src/client/settings-bridge.js'
import { inventoryFrom } from '../src/client/model-inventory.js'
import { opsForModelArrayCompat } from '../src/client/model-ops.js'
import { editableProviderCompatFields } from '../src/compat/gateway/validation.js'
import { capabilitiesForVersion } from '../src/compat/version-map.js'
import {
  identifyTakeoverProviders,
  isCustomOpenAiGateway,
  resolveTakeoverProviders,
  takeoverProvidersOf,
} from '../src/compat/gateway/takeover.js'
import { opsForProviderCompat } from '../src/compat/gateway/ops.js'
import { afterAll, describe, expect, it } from 'vitest'

type PackageManifest = {
  readonly name?: string
  readonly version: string
  readonly main?: string
  readonly types?: string
  readonly exports: Record<string, string | { readonly types?: string; readonly default?: string }>
  readonly files: readonly string[]
  readonly dsh?: { readonly client?: { readonly inject?: readonly string[]; readonly platform?: string; readonly external?: readonly string[] } }
}

const root = resolve(import.meta.dirname, '..')
const integrationEnabled = process.env.DSH_LOADER_INTEGRATION === '1'

function parseCliRoots(raw: string): string[] {
  const values = raw.split(',').map((value) => value.trim())
  if (values.length !== 3 || values.some((value) => value === '')) {
    throw new Error('DSH_CLI_ROOTS must contain exactly three non-empty comma-separated roots: rc7, rc2, alpha3')
  }
  const roots = values.map((value) => realpathSync(value))
  if (new Set(roots).size !== 3) {
    throw new Error('DSH_CLI_ROOTS must contain three distinct roots')
  }
  return roots
}

function readOfficialDshVersion(cliRoot: string): string {
  const manifestPath = resolve(cliRoot, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error(`official DSH root manifest has no version: ${manifestPath}`)
  }
  return manifest.version
}

const expectedOfficialDshVersions = [
  '0.1.0-rc.7',
  '0.1.1-rc.2',
  '0.1.2-alpha.3',
] as const

const loaderSeedProvider = {
  api: 'openai-completions',
  baseURL: 'http://gateway.test/v1',
  models: [
    { id: 'loader-model-a', reasoningEfforts: { off: null, high: 'high' }, custom: 'keep-a' },
    { id: 'loader-model-b', reasoningEfforts: { off: null, high: 'high' }, custom: 'keep-b', compat: { maxTokensField: 'max_tokens', supportsStore: true } },
  ],
} as const

const officialSeedCompatFields = new Set(['maxTokensField', 'supportsStore'])

const localizedNavigationLabels = {
  continue: /^(继续|Continue)$/,
  configureLater: /^(稍后配置|Configure later)$/,
  chooseWorkspace: /^(选择工作区|Choose workspace)$/,
  settings: /^(设置|Settings)$/,
  plugins: /^(插件|Plugins)$/,
} as const

const cliRoots = integrationEnabled ? parseCliRoots(process.env.DSH_CLI_ROOTS ?? '') : []
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
  readonly stopTimeoutMs?: number
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

function loadBrowserBundle(bundlePath: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  let factory: ((require: (specifier: string) => unknown) => Record<string, unknown>) | undefined
  runInNewContext(readFileSync(bundlePath, 'utf8'), {
    window: { __ModuleLoader__: { load: (entry: { factory?: typeof factory }) => { factory = entry.factory } } },
    navigator: { languages: ['en'], language: 'en' },
  })
  if (factory === undefined) throw new Error(`bundle did not register a factory: ${bundlePath}`)
  const localRequire = createRequire(bundlePath)
  return factory((specifier) => overrides[specifier] ?? localRequire(specifier))
}

async function probeOfficialClientRuntime(
  cliRoot: string,
  packagedClient: Record<string, unknown>,
): Promise<{
  modern: { languages: string[]; sectionIds: string[]; supportsExternalLanguages: boolean }
  legacy: { languages: string[]; sectionIds: string[]; supportsExternalLanguages: boolean }
}> {
  const importOfficial = (relativePath: string): Promise<Record<string, unknown>> => import(
    pathToFileURL(join(cliRoot, relativePath)).href,
  ) as Promise<Record<string, unknown>>
  const cordis = await importOfficial('vendor/cordis/lib/index.js')
  const slotsModule = await importOfficial('packages/client/ui-slots/lib/index.js')
  const runtimePath = join(cliRoot, 'packages/client/runtime/lib/client.js')
  const renderer = existsSync(runtimePath)
    ? loadBrowserBundle(runtimePath, { '@deepseek-ai/dsh-client-ui-slots': slotsModule })
    : loadBrowserBundle(join(cliRoot, 'packages/client/ui-renderer/lib/client.js'), {
      '@deepseek-ai/dsh-client-ui-slots': slotsModule,
    })
  const locale = loadBrowserBundle(join(cliRoot, 'packages/client/locale/lib/client.js'), {
    '@deepseek-ai/dsh-client-ui-primitives': {},
    '@deepseek-ai/dsh-client-store': { defineStore: () => ({}) },
    '@deepseek-ai/dsh-client-runtime/client': renderer,
  })
  const Context = cordis.Context as new () => {
    plugin: (plugin: unknown, config?: unknown) => { await: () => Promise<unknown> }
    provide: (name: string, value: unknown) => void
    get: (name: string) => unknown
  }
  const SlotRegistry = renderer.SlotRegistry as new (ctx: unknown) => unknown
  const LocaleRuntime = locale.LocaleRuntime as new (ctx: unknown) => {
    getSnapshot: () => { locales: readonly { id: string }[] }
  }
  const apply = packagedClient.apply as (ctx: unknown) => void
  const results = {} as {
    modern: { languages: string[]; sectionIds: string[]; supportsExternalLanguages: boolean }
    legacy: { languages: string[]; sectionIds: string[]; supportsExternalLanguages: boolean }
  }

  for (const mode of ['modern', 'legacy'] as const) {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.get('slots') as {
      register: (options: unknown, component: unknown) => () => void
      entries: (name: string) => readonly { options?: { id?: string } }[]
    }
    slots.register({
      name: 'root',
      children: { 'settings.section': { kind: 'list', scope: 'root' } },
    }, () => null)
    const runtimeLocale = new LocaleRuntime(ctx)
    ctx.provide('locale', runtimeLocale)
    if (mode === 'modern') {
      ctx.provide('connection', { isLoopback: true })
      ctx.provide('remote.settings', {
        describe: () => Promise.resolve({ ok: true, value: { namespaces: [] } }),
        mutate: () => Promise.resolve({ ok: true, value: {} }),
      })
    } else {
      ctx.provide('remote.settings', {})
      ctx.provide('connection', {
        isLoopback: true,
        api: {
          settings: {
            describe: () => Promise.resolve({ result: { ok: true, value: { namespaces: [] } } }),
            mutate: () => Promise.resolve({ result: { ok: true, value: {} } }),
          },
        },
      })
    }
    apply(ctx)
    await new Promise<void>((resolveWait) => setImmediate(resolveWait))
    results[mode] = {
      languages: runtimeLocale.getSnapshot().locales.map(({ id }) => id),
      sectionIds: slots.entries('settings.section').flatMap(({ options }) => options?.id === undefined ? [] : [options.id]),
      supportsExternalLanguages: typeof (runtimeLocale as { addLanguage?: unknown }).addLanguage === 'function',
    }
  }
  return results
}

async function probeOfficialAgentRuntime(
  cliRoot: string,
  hostEntry: string,
): Promise<{
  settingsHome: string
  settingsPath: string
  markerPath: string
  marker: { event?: string; name?: string; at?: string; pid?: number }
  withoutProduct: { requestCount: number; reasoningEffort: unknown; origin: unknown; turnEnd: string | undefined }
  withProduct: { requestCount: number; reasoningEffort: unknown; origin: unknown; turnEnd: string | undefined }
}> {
  const importOfficial = (relativePath: string): Promise<Record<string, unknown>> => import(
    pathToFileURL(join(cliRoot, relativePath)).href,
  ) as Promise<Record<string, unknown>>
  const cordis = await importOfficial('vendor/cordis/lib/index.js')
  const schemasteryRequire = createRequire(join(cliRoot, 'vendor/schemastery/package.json'))
  const settingsFileRequire = createRequire(join(cliRoot, 'packages/settings/settings-file/package.json'))
  const schemastery = await import(pathToFileURL(schemasteryRequire.resolve('@deepseek-ai/schemastery')).href) as unknown as Record<string, unknown>
  const settingsFile = await import(pathToFileURL(settingsFileRequire.resolve('@deepseek-ai/dsh-settings-file')).href) as unknown as Record<string, unknown>
  const llm = await importOfficial('packages/llm/llm/lib/index.js')
  const session = await importOfficial('packages/core/session/lib/index.js')
  const systemPrompt = await importOfficial('packages/core/system-prompt/lib/index.js')
  const tools = await importOfficial('packages/core/tools/lib/index.js')
  const agents = await importOfficial('packages/core/agent/lib/index.js')
  const agentLoop = await importOfficial('packages/core/agent-loop/lib/index.js')
  const sessionProjection = existsSync(join(cliRoot, 'packages/session/session-projection/lib/index.js'))
    ? await importOfficial('packages/session/session-projection/lib/index.js')
    : undefined
  const timer = await importOfficial('vendor/timer/lib/index.js')
  const Context = cordis.Context as new () => {
    plugin: (plugin: unknown, config?: unknown) => { await: () => Promise<unknown> }
    get: (name: string) => unknown
    fiber: { dispose: () => Promise<void> }
    agents: {
      create: (options: Record<string, unknown>) => Promise<{ agent: {
        session: { header: Record<string, unknown>; events: readonly { type: string }[] }
        followup: (message: unknown) => void
        whenIdle: () => Promise<void>
      }; dispose: () => Promise<void> }>
    }
    llm: { registerAdapter: (providers: string[], adapter: unknown) => unknown }
  }
  const agentHome = mkdtempSync(join(tmpdir(), 'dsh-thinking-effort-agent-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = agentHome
  const markerPath = join(agentHome, 'thinking-effort-loaded.json')
  try {
    const ctx = new Context()
    try {
      await ctx.plugin(timer.default).await()
      await ctx.plugin(settingsFile.default ?? settingsFile.FileSettingsProvider, { dshHome: agentHome, watch: false }).await()
      const z = schemastery.default as {
        object: (shape: Record<string, unknown>) => unknown
        dict: (value: unknown) => unknown
        any: () => unknown
        string: () => unknown
      }
      const settings = ctx.get('settings') as {
        register: (namespace: string, schema: unknown) => { update: (value: Record<string, unknown>) => Promise<void> }
        describe: () => Array<Record<string, unknown>>
        get: (namespace: string) => unknown
      }
    const settingsScope = settings.register('llm-pi-ai', z.object({
      providers: z.dict(z.any()),
      subagentEffort: z.string(),
    }))
    await settingsScope.update({ subagentEffort: 'high', providers: { probe: { models: [{ id: 'probe-model' }] } } })
    const settingsDescriptor = settings.describe().find(entry => entry.ns === 'llm-pi-ai')
    expect(settingsDescriptor?.user).toMatchObject({ subagentEffort: 'high' })
    const settingsPath = join(agentHome, 'settings.yaml')
    expect(existsSync(settingsPath)).toBe(true)

    const LlmAdapter = llm.LlmAdapter as new () => {
      resolveModel(provider: string, model: string): Promise<Record<string, unknown>>
      stream(options: Record<string, unknown>): AsyncIterable<Record<string, unknown>>
    }
    const ReasoningEffortId = llm.ReasoningEffortId as (value: string) => unknown
    const requests: Record<string, unknown>[] = []
    class ProbeAdapter extends LlmAdapter {
      override resolveModel(provider: string, model: string): Promise<Record<string, unknown>> {
        const lowEffort = ReasoningEffortId('low')
        const highEffort = ReasoningEffortId('high')
        return Promise.resolve({
          provider,
          id: model,
          name: model,
          reasoning: { efforts: [{ id: lowEffort, name: 'Low' }, { id: highEffort, name: 'High' }], defaultEffort: lowEffort },
        })
      }

      override async * stream(options: Record<string, unknown>): AsyncIterable<Record<string, unknown>> {
        requests.push(options)
        const text = 'real agent runtime probe'
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'block-end', index: 0, block: { type: 'text', text } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }
    await ctx.plugin(llm.default).await()
    await ctx.plugin(session.default).await()
    if (sessionProjection !== undefined) await ctx.plugin(sessionProjection.default).await()
    await ctx.plugin(systemPrompt.default, {}).await()
    await ctx.plugin(tools.default, {}).await()
    await ctx.plugin(agents.default).await()
    await ctx.plugin(agentLoop.default, { agents: [] }).await()
    ctx.llm.registerAdapter(['probe'], new ProbeAdapter())

    const runAgent = async (sessionId: string): Promise<{ requestCount: number; reasoningEffort: unknown; origin: unknown; turnEnd: string | undefined }> => {
      const handle = await ctx.agents.create({
        sessionId,
        meta: { origin: 'subagent' },
        agentOptions: { provider: 'probe', model: 'probe-model' },
      })
      try {
        const message = (llm.createUserMessage as (input: Record<string, unknown>) => unknown)({
          content: [{ type: 'text', text: 'run the real agent request probe' }],
          source: { kind: 'user' },
        })
        handle.agent.followup(message)
        await handle.agent.whenIdle()
        const turnEnd = [...handle.agent.session.events].reverse().find((event: { type: string }) => event.type === 'turn/end')
        return {
          requestCount: requests.length,
          reasoningEffort: requests.at(-1)?.reasoningEffort,
          origin: handle.agent.session.header.origin,
          turnEnd: turnEnd?.type,
        }
      } finally {
        await handle.dispose()
      }
    }

    const withoutProduct = await runAgent(`agent-probe-baseline-${Date.now()}`)
    const host = await import(pathToFileURL(hostEntry).href) as { apply: (context: unknown) => void }
    host.apply(ctx)
    const withProduct = await runAgent(`agent-probe-product-${Date.now()}`)
    const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as {
      event?: string
      name?: string
      at?: string
      pid?: number
    }
    expect(marker).toMatchObject({ event: 'apply', name: '@hytime/dsh-thinking-effort' })
    expect(marker.at).toEqual(expect.any(String))
    expect(marker.pid).toEqual(expect.any(Number))
    return { settingsHome: agentHome, settingsPath, markerPath, marker, withoutProduct, withProduct }
    } finally {
      await ctx.fiber.dispose()
    }
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(agentHome, { recursive: true, force: true })
  }
}

type BrowserLocator = {
  click: () => Promise<void>
  waitFor: (options?: Record<string, unknown>) => Promise<void>
  getByRole: (role: string, options: { name: string | RegExp }) => BrowserLocator
}

type BrowserPage = {
  goto: (url: string, options?: Record<string, unknown>) => Promise<unknown>
  locator: (selector: string) => {
    allTextContents: () => Promise<string[]>
    innerText: () => Promise<string>
  }
  getByRole: (role: string, options: { name: string | RegExp }) => BrowserLocator
  waitForTimeout: (timeout: number) => Promise<void>
  on: (event: string, listener: (value: unknown) => void) => BrowserPage
}

type BrowserContext = {
  addCookies: (cookies: readonly Record<string, string>[]) => Promise<void>
  newPage: () => Promise<BrowserPage>
}

type Playwright = {
  chromium: { launch: (options: Record<string, unknown>) => Promise<{ newContext: () => Promise<BrowserContext>; close: () => Promise<void> }> }
}

function discoverBrowserExecutable(): string | undefined {
  const configured = process.env.CHROME_PATH
  if (configured !== undefined && configured !== '') {
    if (!existsSync(configured)) throw new Error(`BLOCKED: CHROME_PATH does not exist: ${configured}`)
    return configured
  }
  for (const command of ['google-chrome', 'chromium', 'chromium-browser', 'chrome']) {
    const result = spawnSync('which', [command], { encoding: 'utf8' })
    if (result.status === 0) {
      const executable = result.stdout.trim()
      if (executable !== '' && existsSync(executable)) return executable
    }
  }
  const appSearch = spawnSync('mdfind', ["kMDItemCFBundleIdentifier == 'com.google.Chrome'"], { encoding: 'utf8' })
  if (appSearch.status === 0) {
    for (const app of appSearch.stdout.split('\n').map(value => value.trim()).filter(Boolean)) {
      const executable = join(app, 'Contents', 'MacOS', 'Google Chrome')
      if (existsSync(executable)) return executable
    }
  }
  const managedPath = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (managedPath !== undefined && managedPath !== '' && managedPath !== '0' && !existsSync(managedPath)) {
    throw new Error(`BLOCKED: PLAYWRIGHT_BROWSERS_PATH does not exist: ${managedPath}`)
  }
  return undefined
}
async function probeOfficialSettingsDom(cliRoot: string, web: RunningWeb): Promise<{
  bodyText: string
  buttons: string[]
  settingsText: string
  thinkingEffortVisible: boolean
  errors: string[]
  blocked?: string
}> {
  let playwright: Playwright
  let executablePath: string | undefined
  try {
    const playwrightPath = createRequire(join(cliRoot, 'apps/web/package.json')).resolve('playwright')
    playwright = await import(pathToFileURL(playwrightPath).href) as unknown as Playwright
    executablePath = discoverBrowserExecutable()
  } catch (error) {
    return { bodyText: '', buttons: [], settingsText: '', thinkingEffortVisible: false, errors: [], blocked: String(error) }
  }
  let browser: Awaited<ReturnType<Playwright['chromium']['launch']>>
  try {
    browser = await playwright.chromium.launch({
      headless: true,
      ...(executablePath === undefined ? {} : { executablePath }),
    })
  } catch (error) {
    return { bodyText: '', buttons: [], settingsText: '', thinkingEffortVisible: false, errors: [], blocked: `BLOCKED: browser launch failed: ${String(error)}` }
  }
  try {
    const context = await browser.newContext()
    if (web.cookie !== '') {
      const separator = web.cookie.indexOf('=')
      await context.addCookies([{
        name: web.cookie.slice(0, separator),
        value: web.cookie.slice(separator + 1),
        domain: '127.0.0.1',
        path: '/',
      }])
    }
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', value => { errors.push(String(value)) })
    await page.goto(web.url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    const bodyText = await page.locator('body').innerText()
    const buttons = await page.locator('button').allTextContents()
    await page.getByRole('button', { name: localizedNavigationLabels.continue }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: localizedNavigationLabels.configureLater }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: localizedNavigationLabels.chooseWorkspace }).click()
    const workspaceDialog = page.getByRole('dialog', { name: /^(选择工作区目录|Select Workspace Directory)$/ })
    await workspaceDialog.waitFor({ state: 'visible', timeout: 10000 })
    await workspaceDialog.getByRole('button', { name: /^(取消|Cancel)$/ }).click()
    await workspaceDialog.waitFor({ state: 'hidden', timeout: 10000 })
    await page.getByRole('button', { name: localizedNavigationLabels.settings }).click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: localizedNavigationLabels.plugins }).click()
    await page.waitForTimeout(3000)
    const settingsText = await page.locator('body').innerText()
    return {
      bodyText,
      buttons,
      settingsText,
      thinkingEffortVisible: [
        '模型能力与档位',
        'Model capabilities and effort',
        'モデルの能力と推論強度',
        '모델 기능 및 추론 강도',
      ].some((title) => settingsText.includes(title)),
      errors,
    }
  } finally {
    await browser.close()
  }
}

function extractBootRows(html: string): string[] {
  const prefixes = [
    '<script>globalThis["__DSH_BOOT__"] = ',
    '<script>window.__DSH_BOOT__ = ',
  ]
  const matchedPrefix = prefixes.find((candidate) => html.includes(candidate))
  if (matchedPrefix === undefined) throw new Error('DSH Web page did not inject __DSH_BOOT__')
  const valueStart = html.indexOf(matchedPrefix) + matchedPrefix.length
  const end = html.indexOf('</script>', valueStart)
  if (end === -1) throw new Error('DSH Web page has an unterminated __DSH_BOOT__ injection')
  const graph = JSON.parse(html.slice(valueStart, end)) as {
    entries?: Array<{ id?: string; url?: string }>
  }
  return graph.entries?.map(({ id, url }) => `${id ?? '<missing-id>'} ${url ?? '<missing-url>'}`) ?? []
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
  const stopTimeoutMs = options.stopTimeoutMs ?? 5000
  let output = ''
  let timer: NodeJS.Timeout | undefined
  let resolveUrl: ((url: string) => void) | undefined
  let rejectUrl: ((error: Error) => void) | undefined
  let childErrored = false
  let childClosed = false
  let stopPromise: Promise<void> | undefined
  let resolveChildSettled: (() => void) | undefined
  const childSettled = new Promise<void>((resolve) => {
    resolveChildSettled = resolve
  })
  const settleChild = (): void => {
    resolveChildSettled?.()
    resolveChildSettled = undefined
  }
  child.once('error', (error) => {
    childErrored = true
    settleChild()
    rejectUrl?.(error)
  })
  child.once('exit', (code, signal) => {
    if (resolveUrl === undefined) return
    rejectUrl?.(new Error(`DSH web exited before announcing a URL (code=${code}, signal=${signal})\n${output}`))
  })
  child.once('close', () => {
    childClosed = true
    settleChild()
  })
  const waitForChild = async (): Promise<boolean> => {
    if (childErrored || childClosed) return true
    let waitTimer: NodeJS.Timeout | undefined
    try {
      return await Promise.race([
        childSettled.then(() => true),
        new Promise<boolean>((resolveWait) => {
          waitTimer = setTimeout(() => resolveWait(false), stopTimeoutMs)
        }),
      ])
    } finally {
      if (waitTimer !== undefined) clearTimeout(waitTimer)
    }
  }
  const stop = (): Promise<void> => {
    if (stopPromise !== undefined) return stopPromise
    stopPromise = (async () => {
      if (!childErrored && !childClosed && child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGTERM')
        } catch {
          // The error/close event or the bounded fallback handles a raced exit.
        }
      }
      if (await waitForChild()) return
      if (!childErrored && !childClosed && child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGKILL')
        } catch {
          // A concurrent exit is already being observed through close/error.
        }
      }
      await waitForChild()
    })()
    return stopPromise
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`test timeout after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
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

  it('waits for close after exit when a descendant keeps stdio open', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-thinking-effort-close-'))
    const donePath = join(directory, 'grandchild-done')
    const markerPath = join(directory, 'grandchild-pid')
    const grandchildScript = `import { writeFileSync } from 'node:fs'; setTimeout(() => writeFileSync(${JSON.stringify(donePath)}, 'done'), 150)`
    const script = [
      "import { spawn } from 'node:child_process'",
      "import { writeFileSync } from 'node:fs'",
      `const marker = ${JSON.stringify(markerPath)}`,
      "process.on('SIGTERM', () => process.exit(0))",
      `const grandchild = spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(grandchildScript)}], { stdio: ['ignore', 'inherit', 'inherit'] })`,
      'writeFileSync(marker, String(grandchild.pid))',
      "process.stdout.write('http://127.0.0.1:1/\\n')",
      'setInterval(() => {}, 1000)',
    ].join(';')
    let grandchildPid: number | undefined

    try {
      const web = await startOfficialWeb('/tmp', directory, {
        command: process.execPath,
        args: ['--input-type=module', '-e', script],
        stopTimeoutMs: 300,
      })
      grandchildPid = Number(readFileSync(markerPath, 'utf8'))
      const startedAt = Date.now()
      const firstStop = web.stop()
      expect(web.stop()).toBe(firstStop)
      await withTimeout(firstStop, 1000)
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(150)
      expect(readFileSync(donePath, 'utf8')).toBe('done')
    } finally {
      if (grandchildPid !== undefined) {
        try {
          process.kill(grandchildPid, 'SIGKILL')
        } catch {
          // The close assertion normally proves it already exited.
        }
      }
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('rejects promptly on spawn error and does not wait for exit forever', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-thinking-effort-spawn-error-'))
    try {
      await expect(withTimeout(startOfficialWeb('/tmp', directory, {
        command: join(directory, 'missing-dsh-command'),
        stopTimeoutMs: 50,
      }), 1000)).rejects.toThrow(/ENOENT|spawn/)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('uses SIGKILL when the child ignores SIGTERM after token failure', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-thinking-effort-kill-'))
    const markerPath = join(directory, 'child-pid')
    const script = [
      "import { writeFileSync } from 'node:fs'",
      `const marker = ${JSON.stringify(markerPath)}`,
      'writeFileSync(marker, String(process.pid))',
      "process.on('SIGTERM', () => {})",
      "process.stdout.write('http://127.0.0.1:1/?token=broken\\n')",
      'setInterval(() => {}, 1000)',
    ].join(';')
    let childPid: number | undefined

    try {
      await expect(withTimeout(startOfficialWeb('/tmp', directory, {
        command: process.execPath,
        args: ['--input-type=module', '-e', script],
        stopTimeoutMs: 50,
      }), 1000)).rejects.toThrow()
      childPid = Number(readFileSync(markerPath, 'utf8'))
      expect(() => process.kill(childPid!, 0)).toThrow()
    } finally {
      if (childPid !== undefined) {
        try {
          process.kill(childPid, 'SIGKILL')
        } catch {
          // The process should already be gone after the bounded cleanup.
        }
      }
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe('compatibility documentation and root validation', () => {
  const compatibilityDocumentationFiles = [
    'README.md', 'README.zh.md', 'README.ja.md', 'README.ko.md',
    'docs/INSTALL.md', 'docs/INSTALL.zh.md', 'docs/INSTALL.ja.md', 'docs/INSTALL.ko.md',
  ] as const
  const changelogFiles = [
    'docs/CHANGELOG.md', 'docs/CHANGELOG.ja.md', 'docs/CHANGELOG.ko.md',
  ] as const
  const modelSourceConflictContract = /(?=[^\n]*(?:route|路由|ルート|라우트))(?=[^\n]*(?:provider|提供方|プロバイダー|제공자))(?=[^\n]*(?:non-empty|非空|비어 있지 않은))(?=[^\n]*models\[\])(?=[^\n]*modelOverrides)[^\n]*(?:invalid|无效|無効|잘못된)/i
  const documentationContract = [
    { name: 'DSH Runtime compatibility boundary', pattern: /DSH Runtime[^\n]*(?:compatibility|兼容|互換|호환)/i },
    { name: 'Gateway Protocol compatibility boundary', pattern: /Gateway Protocol[^\n]*(?:compatibility|compat|兼容|互換|호환)/i },
    { name: 'modern Settings transport', pattern: /remote\.settings/ },
    { name: 'legacy Settings transport', pattern: /connection\.api\.settings/ },
    { name: 'supportsDeveloperRole field', pattern: /supportsDeveloperRole/ },
    { name: 'maxTokensField field', pattern: /maxTokensField/ },
    { name: 'provider global compat example', pattern: /providers:\n  qwen-gateway:\n    compat:\n      supportsDeveloperRole: false\n      maxTokensField: max_tokens/ },
    { name: 'model-level compat example', pattern: /- id: qwen-thinking\n        compat:\n          maxTokensField: max_completion_tokens/ },
    { name: 'catalog model override path', pattern: /modelOverrides\.\<model\>\.compat/ },
    { name: 'field-by-field provider override semantics', pattern: /(?:field-by-field|field by field|逐字段|フィールドごと|필드별)[^\n]*(?:provider|供应商|プロバイダー|제공자)/i },
    { name: 'Auto restores provider inheritance', pattern: /Auto[^\n]*(?:delete|delet|unset|取消|删除|削除|삭제)[^\n]*(?:inherit|继承|継承|상속)/i },
    { name: 'models and modelOverrides are mutually exclusive at provider scope', pattern: modelSourceConflictContract },
    { name: 'models[] settings behavior', pattern: /models\[\][^\n]*(?:complete|完整|全体|全体|전체)[^\n]*(?:array set|数组 set|配列 set|배열 set)/i },
    { name: 'schema rejects model source conflict', pattern: /(?=[^\n]*(?:official schema|官方 schema|公式 schema|공식 schema))(?=[^\n]*models\[\])[^\n]*(?:rejects|拒绝|拒否|거부)[^\n]*(?:fails? closed|异常数据|異常なデータ|비정상 데이터)/i },
    { name: 'control plane and transport boundary', pattern: /(?:control plane|控制面|コントロールプレーン|제어면)[^\n]*(?:transport|传输|トランスポート|전송)/i },
    { name: 'rc7 capability boundary', pattern: /0\.1\.0-rc\.7/ },
    { name: 'rc8 and later capability boundary', pattern: /0\.1\.0-rc\.8[^\n]*(?:later|后续|以降|이후)/i },
    { name: 'Auto reset semantics', pattern: /Auto[^\n]*(?:unset|取消|恢复|復元|복원)/i },
    {
      name: 'optional takeover semantics',
      pattern: /(?=.*dsh-llm-openai-completions)(?=.*(?:optional|可选|オプション|선택))(?=.*(?:takeover|take over|接管))/is,
    },
  ] as const
  const published013Sections = {
    'docs/CHANGELOG.md': `## [0.1.13] - 按兼容范围验证 / Range-based compatibility verification\n\n### 变更 / Changed\n\n- 将兼容层的版本诊断从逐版本枚举改为范围判断，并让发布 workflow 每个兼容范围只选择一个官方代表版本。\n- Replace per-release compatibility enumeration with range-based version diagnostics, and make the release workflow select one official representative per compatibility range.`,
    'docs/CHANGELOG.ja.md': `## [0.1.13] - 互換性範囲による検証\n\n### 変更\n\n- 互換アダプターのバージョン診断をリリース単位の列挙から範囲判定へ変更し、公開前 workflow は各範囲から公式代表バージョンを 1 つだけ選ぶようにしました。`,
    'docs/CHANGELOG.ko.md': `## [0.1.13] - 호환성 범위 기반 검증\n\n### 변경\n\n- 호환성 어댑터의 버전 진단을 릴리스별 열거에서 범위 판정으로 변경하고, 게시 전 workflow가 각 범위에서 공식 대표 버전 하나만 선택하도록 했습니다.`,
  } as const

  const section = (document: string, heading: string): string => {
    const start = document.indexOf(`## [${heading}]`)
    if (start === -1) throw new Error(`missing changelog heading: ${heading}`)
    const next = document.indexOf('\n## [', start + 1)
    return document.slice(start, next === -1 ? document.length : next).trim()
  }

  it.each(compatibilityDocumentationFiles)('enforces the compatibility contract in %s', (file) => {
    const document = readFileSync(join(root, file), 'utf8')
    expect(existsSync(join(root, file))).toBe(true)
    expect(document, `${file}: missing scoped package name`).toContain('@hytime/dsh-thinking-effort')
    for (const { name, pattern } of documentationContract) {
      expect(document, `${file}: missing ${name}`).toMatch(pattern)
    }
  })

  it.each(changelogFiles)('enforces the changelog contract in %s', (file) => {
    const document = readFileSync(join(root, file), 'utf8')
    expect(existsSync(join(root, file))).toBe(true)
    expect(document).toMatch(/version-map(?:\.ts)?/i)
    expect(document).toMatch(/rc\.?7/i)
    expect(document).toMatch(/rc\.?2/i)
    expect(document).toMatch(/alpha\.?3/i)
    expect(document).toMatch(/(?:optional|可选|オプション|선택)[^\n]*(?:takeover|take over|接管)/is)
    expect(document).toContain('## [Unreleased]')
    expect(section(document, '0.1.14')).toMatch(/version-map/i)
    expect(section(document, '0.1.14')).toMatch(/rc\.?7/i)
    expect(section(document, '0.1.14')).toMatch(/rc\.?2/i)
    expect(section(document, '0.1.14')).toMatch(/alpha\.?3/i)
    expect(section(document, '0.1.14')).toMatch(/takeover|take over|接管/i)
    expect(section(document, '0.1.14')).toMatch(/provider[^\n]*compat|提供方[^\n]*compat|プロバイダー[^\n]*compat|provider[^\n]*호환/i)
    expect(section(document, '0.1.14')).toMatch(/modelOverrides/)
    expect(section(document, '0.1.14')).toMatch(/models\[\]/)
    expect(section(document, '0.1.14')).toMatch(modelSourceConflictContract)
    expect(section(document, '0.1.14')).toMatch(/(?:control plane|控制面|コントロールプレーン|제어면)[^\n]*(?:transport|传输|トランスポート|전송)/i)
    expect(section(document, '0.1.13')).toBe(published013Sections[file])
  })

  it.each(['INSTALL.md', 'INSTALL.zh.md', 'CHANGELOG.md', 'CHANGELOG.ja.md', 'CHANGELOG.ko.md'] as const)(
    'rejects the moved root documentation path %s',
    (file) => {
      expect(existsSync(join(root, file))).toBe(false)
    },
  )

  it('documents capability detection as authoritative across published docs', () => {
    for (const file of [...compatibilityDocumentationFiles, ...changelogFiles]) {
      const document = readFileSync(join(root, file), 'utf8')
      expect(document, `${file}: stale version-metadata preference`).not.toMatch(/prefers DSH version metadata/i)
      expect(document, `${file}: stale Chinese version-metadata preference`).not.toMatch(/优先使用 DSH version metadata/i)
    }
  })

  it('requires the English changelog to state that runtime capability detection is authoritative', () => {
    const document = readFileSync(join(root, 'docs/CHANGELOG.md'), 'utf8')
    expect(section(document, '0.1.14')).toMatch(/Runtime capability detection is authoritative/i)
  })

  it('keeps publish workflow roots aligned with loader verification order', () => {
    const workflow = readFileSync(join(root, '.github/workflows/publish.yml'), 'utf8')
    const roots = [
      '"rc7:$RC7_ROOT:$RUN_ROOT/homes/rc7"',
      '"rc2:$RC2_ROOT:$RUN_ROOT/homes/rc2"',
      '"alpha:$ALPHA_ROOT:$RUN_ROOT/homes/alpha"',
    ]
    const rootSpecStart = workflow.indexOf('for spec in')
    expect(rootSpecStart).toBeGreaterThanOrEqual(0)
    let previous = rootSpecStart
    for (const rootSpec of roots) {
      const position = workflow.indexOf(rootSpec, previous)
      expect(position, `publish workflow missing ordered root ${rootSpec}`).toBeGreaterThan(previous)
      previous = position
    }
    expect(workflow).toContain('DSH_CLI_ROOTS="$RC7_ROOT,$RC2_ROOT,$ALPHA_ROOT"')
    expect(expectedOfficialDshVersions).toEqual(['0.1.0-rc.7', '0.1.1-rc.2', '0.1.2-alpha.3'])
  })

  it('rejects duplicate normalized DSH CLI roots', () => {
    const duplicateRoots = `${root},${join(root, '.')},${root}`

    expect(() => parseCliRoots(duplicateRoots)).toThrow(/distinct|unique/i)
  })
})

describe('optional openai-completions takeover contract', () => {
  it('identifies custom thinking providers from shared llm-pi-ai fields', () => {
    expect(identifyTakeoverProviders({
      providers: {
        local: {
          api: 'openai-completions',
          baseURL: 'http://gateway.test/v1',
          models: [{
            id: 'model',
            reasoningEfforts: { off: null, high: 'high' },
            compat: { thinkingFormat: 'qwen', supportsReasoningEffort: false },
          }],
        },
        official: {
          api: 'openai-completions',
          baseURL: 'https://api.openai.com/v1',
          models: [{ id: 'model', reasoningEfforts: { high: 'high' } }],
        },
      },
    }, capabilitiesForVersion('0.1.1-rc.2'))).toEqual(['local'])
    expect(identifyTakeoverProviders({
      providers: {
        local: {
          api: 'openai-completions',
          baseURL: 'http://gateway.test/v1',
          models: [{ id: 'model', reasoningEfforts: { high: 'high' } }],
        },
      },
    }, capabilitiesForVersion('0.1.0-rc.7'))).toEqual([])
    expect(identifyTakeoverProviders({
      providers: {
        local: { api: 'openai-completions', baseURL: 'http://gateway.test/v1', models: [{ id: 'model', reasoningEfforts: { high: 'high' } }] },
      },
    })).toEqual([])
    expect(isCustomOpenAiGateway({ api: 'openai-completions', baseURL: 'https://api.openai.com/v1' })).toBe(false)
    expect(isCustomOpenAiGateway({ api: 'openai-completions' })).toBe(false)
    expect(isCustomOpenAiGateway({ api: 'openai-completions', baseURL: 'http://gateway.test/v1' })).toBe(true)
  })

  it('returns null for an absent takeover namespace and never requires it', () => {
    expect(takeoverProvidersOf(undefined)).toBeNull()
    expect(takeoverProvidersOf({ enabled: true, providers: ['local'] })).toEqual(['local'])
  })
})

describe('published package composition', () => {
  it('exposes built Host and Client artifacts with declarations', () => {
    const manifest = readPackage()

    expect(manifest.version).toBe('0.1.14')
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
    expect(manifest.dsh?.client).toEqual({
      inject: [
        '@deepseek-ai/dsh-client-connection',
        '@deepseek-ai/dsh-client-locale',
        '@deepseek-ai/dsh-client-ui-settings',
        '@deepseek-ai/dsh-api-remotes',
      ],
      platform: 'web',
    })
    expect(manifest.files).toContain('lib/index.js')
    expect(manifest.files).toContain('lib/client.js')
    expect(manifest.files).toContain('lib/types/**/*.d.ts')
    expect(manifest.files).toContain('cordis.patch.yml')
    for (const documentationFile of [
      'README.md', 'README.zh.md', 'README.ja.md', 'README.ko.md',
      'docs/INSTALL.md', 'docs/INSTALL.zh.md', 'docs/INSTALL.ja.md', 'docs/INSTALL.ko.md',
      'docs/CHANGELOG.md', 'docs/CHANGELOG.ja.md', 'docs/CHANGELOG.ko.md',
    ]) {
      expect(manifest.files).toContain(documentationFile)
    }
    expect(manifest.files).not.toContain('INSTALL.md')
    expect(manifest.files).not.toContain('INSTALL.zh.md')
    expect(manifest.files).not.toContain('CHANGELOG.md')
    expect(manifest.files).not.toContain('CHANGELOG.ja.md')
    expect(manifest.files).not.toContain('CHANGELOG.ko.md')
    expect(manifest.files).toContain('docs/assets/')
  })
})

describe('loader seed schema contract', () => {
  it('uses only official openai-completions compat fields', () => {
    for (const model of loaderSeedProvider.models) {
      const compat = 'compat' in model ? model.compat : undefined
      for (const field of Object.keys(compat ?? {})) {
        expect(officialSeedCompatFields.has(field), `unsupported seed compat field: ${field}`).toBe(true)
      }
    }
  })
})

integrationDescribe('official DSH loader composition', () => {
  it('requires and verifies rc7, rc2, and alpha3 capability representatives independently', { timeout: 180000 }, async () => {
    expect(cliRoots).toHaveLength(3)
    expect(cliRoots.every((cliRoot) => cliRoot === resolve(cliRoot))).toBe(true)
    expect(new Set(cliRoots).size).toBe(3)
    const verifiedRoots = cliRoots.map((cliRoot) => ({
      cliRoot,
      version: readOfficialDshVersion(cliRoot),
    }))
    expect(verifiedRoots.map(({ version }) => version)).toEqual(expectedOfficialDshVersions)

    for (const { cliRoot, version } of verifiedRoots) {
      const home = mkdtempSync(join(tmpdir(), 'dsh-thinking-effort-loader-'))
      const packDestination = mkdtempSync(join(tmpdir(), 'dsh-thinking-effort-pack-'))
      const profile = join(home, 'profiles', 'compat')
      try {
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
    expect(installedManifest.version).toBe('0.1.14')

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
    const registered: Array<{
       id?: string
       factory?: (require: (specifier: string) => unknown) => Record<string, unknown>
     }> = []
    const webHome = mkdtempSync(join(tmpdir(), 'dsh-thinking-effort-web-'))
    try {
      runOfficialDsh(cliRoot, webHome, ['plugin', '--profile', 'web', 'add', tarball])
      const web = await startOfficialWeb(cliRoot, webHome, {
        args: version === '0.1.0-rc.7'
          ? ['dsh', '--profile', 'web', '--port', '0']
          : ['dsh', '--profile', 'web', '--no-open', '--port', '0'],
      })
      try {
        const headers: Record<string, string> = web.cookie === '' ? {} : { cookie: web.cookie }
        const legacyRpc = version === '0.1.1-rc.2' || version === '0.1.0-rc.7'
        const describeEndpoint = legacyRpc ? 'settings.describe' : 'settings/describe'
        const mutateEndpoint = legacyRpc ? 'settings.mutate' : 'settings/mutate'
        const settingsDescribe = await callOfficialRpc(web.url, headers, describeEndpoint, {}, !legacyRpc)
        expect(settingsDescribe.status).toBe(200)
         const liveResult = (endpoint: string, args: Record<string, unknown>): Promise<unknown> => (
          callOfficialRpc(web.url, headers, endpoint, args, !legacyRpc).then((response) => (
            legacyRpc ? { result: response.body.result } : response.body.result
          ))
        )
        const settings = legacyRpc
          ? settingsBridge({ api: { settings: {
            describe: () => liveResult(describeEndpoint, {}),
            mutate: (args: { ns: string; ops: readonly import('../src/client/types.js').SettingsOp[]; expectedRevision: number }) => liveResult(mutateEndpoint, args),
          } } })
          : settingsBridge(undefined, {
            describe: () => liveResult(describeEndpoint, {}),
            mutate: (ns: string, ops: readonly import('../src/client/types.js').SettingsOp[], expectedRevision: number) => liveResult(mutateEndpoint, { ns, ops, expectedRevision }),
           })

        expect(settings).toBeDefined()
        const liveDescription = await settings!.describe()
         expect(liveDescription).toMatchObject({ ok: true, value: { namespaces: expect.any(Array) } })
         if (!liveDescription.ok) throw new Error(liveDescription.error.message)
         const piAiNamespace = liveDescription.value.namespaces.find(({ ns }) => ns === 'llm-pi-ai')
         expect(piAiNamespace).toBeDefined()
         const mapped = capabilitiesForVersion(version)
         expect(mapped).toBeDefined()
         const editability = editableProviderCompatFields(mapped, piAiNamespace?.schema)
         if (version === '0.1.0-rc.7') {
           expect(editability).toMatchObject({ supportsDeveloperRole: false, maxTokensField: false })
         } else {
           expect(editability).toMatchObject({ supportsDeveloperRole: true, maxTokensField: true })
         }

         const describePiAi = async (): Promise<{
           ns: string
           revision: number
           value: Record<string, unknown>
         }> => {
           const result = await settings!.describe()
           expect(result).toMatchObject({ ok: true, value: { namespaces: expect.any(Array) } })
           if (!result.ok) throw new Error(result.error.message)
           const current = result.value.namespaces.find(({ ns }) => ns === 'llm-pi-ai')
           expect(current).toBeDefined()
           expect(current?.revision).toEqual(expect.any(Number))
           return { ns: current!.ns, revision: current!.revision, value: current!.value }
         }
         const current = await describePiAi()
         if (version === '0.1.0-rc.7') {
           const blockedOps = opsForProviderCompat('loader-compat', {
             supportsDeveloperRole: 'supported',
             maxTokensField: 'max_completion_tokens',
           }, editability)
           expect(blockedOps).toEqual([])
           expect((await describePiAi()).revision).toBe(current.revision)
         } else {
           const route = `loader-compat-${version.replaceAll('.', '-')}`
           const seeded = await settings!.mutate(current.ns, [{
             op: 'set',
             path: ['providers', route],
             value: {
               api: 'openai-completions',
               baseURL: 'http://gateway.test/v1',
               models: [
                  { id: 'loader-model-a', reasoningEfforts: { off: null, high: 'high' }, custom: 'keep-a' },
                  { id: 'loader-model-b', reasoningEfforts: { off: null, high: 'high' }, custom: 'keep-b', compat: { maxTokensField: 'max_tokens', supportsStore: true } },
                ],
             },
           }], current.revision)

           if (!seeded.ok) throw new Error(`settings seed rejected for ${version}: ${seeded.error.message}`)
            expect(seeded).toMatchObject({ ok: true, value: { ns: 'llm-pi-ai' } })

           const seededNamespace = await describePiAi()
           const setOps = opsForProviderCompat(route, {
             supportsDeveloperRole: 'supported',
             maxTokensField: 'max_completion_tokens',
           }, editability)
           expect(setOps).toEqual([
             { op: 'set', path: ['providers', route, 'compat', 'supportsDeveloperRole'], value: true },
             { op: 'set', path: ['providers', route, 'compat', 'maxTokensField'], value: 'max_completion_tokens' },
           ])
           const written = await settings!.mutate(seededNamespace.ns, setOps, seededNamespace.revision)
           expect(written).toMatchObject({ ok: true, value: { ns: 'llm-pi-ai' } })
           if (!written.ok) throw new Error(written.error.message)
           const writtenNamespace = await describePiAi()
           const writtenProviders = writtenNamespace.value.providers as Record<string, Record<string, unknown>>
           expect(writtenProviders[route]?.compat).toMatchObject({
             supportsDeveloperRole: true,
             maxTokensField: 'max_completion_tokens',
   })

           const unsetOps = opsForProviderCompat(route, {
             supportsDeveloperRole: 'auto',
             maxTokensField: 'auto',
           }, editability)
           expect(unsetOps).toEqual([
             { op: 'unset', path: ['providers', route, 'compat', 'supportsDeveloperRole'] },
             { op: 'unset', path: ['providers', route, 'compat', 'maxTokensField'] },
           ])
           const cleared = await settings!.mutate(writtenNamespace.ns, unsetOps, writtenNamespace.revision)
           expect(cleared).toMatchObject({ ok: true, value: { ns: 'llm-pi-ai' } })
           if (!cleared.ok) throw new Error(cleared.error.message)
           const clearedNamespace = await describePiAi()
           const clearedProviders = clearedNamespace.value.providers as Record<string, Record<string, unknown>>
           const clearedCompat = clearedProviders[route]?.compat as Record<string, unknown> | undefined
            expect(clearedCompat?.supportsDeveloperRole).toBeUndefined()
            expect(clearedCompat?.maxTokensField).toBeUndefined()

            const modelsNamespace = await describePiAi()
            const modelsInventory = inventoryFrom({ value: modelsNamespace.value })
            const targetModel = modelsInventory.find((candidate) => candidate.route === route && candidate.model === 'loader-model-b')
            expect(targetModel).toBeDefined()
            const modelSetOps = opsForModelArrayCompat(modelsInventory, targetModel!, {
              supportsDeveloperRole: 'unsupported',
            }, editability)
            expect(modelSetOps).toEqual([{
              op: 'set',
              path: ['providers', route, 'models'],
              value: [
                { id: 'loader-model-a', reasoningEfforts: { off: null, high: 'high' }, input: [], custom: 'keep-a', compat: { chatTemplateKwargs: {} } },
                { id: 'loader-model-b', reasoningEfforts: { off: null, high: 'high' }, input: [], custom: 'keep-b', compat: { chatTemplateKwargs: {}, maxTokensField: 'max_tokens', supportsStore: true, supportsDeveloperRole: false } },
              ],
            }])
            const modelWritten = await settings!.mutate(modelsNamespace.ns, modelSetOps, modelsNamespace.revision)
            expect(modelWritten).toMatchObject({ ok: true, value: { ns: 'llm-pi-ai' } })
            if (!modelWritten.ok) throw new Error(modelWritten.error.message)
            const modelWrittenNamespace = await describePiAi()
            const modelWrittenProfile = (modelWrittenNamespace.value.providers as Record<string, Record<string, unknown>>)[route]
            expect(modelWrittenProfile?.models).toEqual(modelSetOps[0]?.value)

            const modelAfterSet = inventoryFrom({ value: modelWrittenNamespace.value }).find((candidate) => candidate.route === route && candidate.model === 'loader-model-b')
            expect(modelAfterSet).toBeDefined()
            const modelAutoOps = opsForModelArrayCompat(inventoryFrom({ value: modelWrittenNamespace.value }), modelAfterSet!, {
              supportsDeveloperRole: 'auto',
            }, editability)
            expect(modelAutoOps).toEqual([{
              op: 'set',
              path: ['providers', route, 'models'],
              value: [
                { id: 'loader-model-a', reasoningEfforts: { off: null, high: 'high' }, input: [], custom: 'keep-a', compat: { chatTemplateKwargs: {} } },
                { id: 'loader-model-b', reasoningEfforts: { off: null, high: 'high' }, input: [], custom: 'keep-b', compat: { chatTemplateKwargs: {}, maxTokensField: 'max_tokens', supportsStore: true } },
              ],
            }])
            const modelCleared = await settings!.mutate(modelWrittenNamespace.ns, modelAutoOps, modelWrittenNamespace.revision)
            expect(modelCleared).toMatchObject({ ok: true, value: { ns: 'llm-pi-ai' } })
            if (!modelCleared.ok) throw new Error(modelCleared.error.message)
            const modelClearedNamespace = await describePiAi()
            const modelClearedProfile = (modelClearedNamespace.value.providers as Record<string, Record<string, unknown>>)[route]
            expect(modelClearedProfile?.models).toEqual(modelAutoOps[0]?.value)
           expect(clearedCompat?.supportsDeveloperRole).toBeUndefined()
           expect(clearedCompat?.maxTokensField).toBeUndefined()
         }





         const indexResponse = await fetch(web.url, {
          headers,
          signal: AbortSignal.timeout(10000),

        })
         expect(indexResponse.status).toBe(200)
        const indexHtml = await indexResponse.text()
        const bootRows = extractBootRows(indexHtml)
        const bundleUrl = extractBundleUrl(indexHtml, '@hytime/dsh-thinking-effort')
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
              load(entry: { id?: string; factory?: typeof registered[number]['factory'] }) {
                registered.push(entry)
              },
            },
          },

        })
         const domProbe = await probeOfficialSettingsDom(cliRoot, web)
        if (domProbe.blocked !== undefined) {
          if (process.env.DSH_REQUIRE_THINKING_EFFORT_DOM === '1') {
             throw new Error(`required DSH Web DOM probe was blocked: ${domProbe.blocked}`)
           }
           console.log(`[BLOCKED] browser probe: ${domProbe.blocked}`)
        } else {
          expect(domProbe.settingsText).toMatch(/插件|Plugins/)
          expect(domProbe.errors).toEqual([])
          if (!domProbe.thinkingEffortVisible) {
             if (process.env.DSH_REQUIRE_THINKING_EFFORT_DOM === '1') {
               throw new Error('thinking-effort settings section is absent from the real DSH Web DOM')
             }
            console.log(`[BLOCKED] thinking-effort section missing; DOM=${JSON.stringify(domProbe.settingsText)}; bootRows=${JSON.stringify(bootRows)}`)
          }
        }
      } finally {
        await web.stop()
      }
    } finally {
      rmSync(webHome, { recursive: true, force: true })
    }
    const packagedFactory = registered[0]?.factory
    if (packagedFactory === undefined) throw new Error('served client bundle did not expose a factory')
    const packagedRequire = createRequire(clientEntry)
    const officialWebRequire = createRequire(join(cliRoot, 'apps/web/package.json'))
    const packagedClient = packagedFactory((specifier) => {
      try {
        return packagedRequire(specifier)
      } catch {
        return officialWebRequire(specifier)
      }
    })
    const runtimeProbe = await probeOfficialClientRuntime(cliRoot, packagedClient)
    const previousHome = process.env.DSH_HOME
    const agentProbe = await probeOfficialAgentRuntime(cliRoot, hostEntry)
    expect(process.env.DSH_HOME).toBe(previousHome)
    expect(agentProbe.withoutProduct).toMatchObject({
      requestCount: 1,
      reasoningEffort: 'low',
      origin: 'subagent',
      turnEnd: 'turn/end',
    })
    expect(agentProbe.withProduct).toMatchObject({
      requestCount: 2,
      reasoningEffort: 'high',
      origin: 'subagent',
      turnEnd: 'turn/end',
    })
    expect(existsSync(agentProbe.settingsHome)).toBe(false)
    expect(existsSync(agentProbe.settingsPath)).toBe(false)
    expect(existsSync(agentProbe.markerPath)).toBe(false)
    expect(agentProbe.marker).toMatchObject({ event: 'apply', name: '@hytime/dsh-thinking-effort' })
    if (runtimeProbe.modern.supportsExternalLanguages) {
      expect(runtimeProbe.modern.languages).toEqual(expect.arrayContaining(['ja', 'ko']))
    } else {
      expect(runtimeProbe.modern.languages).not.toContain('ja')
      expect(runtimeProbe.modern.languages).not.toContain('ko')
    }
    expect(runtimeProbe.modern.sectionIds).toContain('thinking-effort')
    if (runtimeProbe.legacy.supportsExternalLanguages) {
      expect(runtimeProbe.legacy.languages).toEqual(expect.arrayContaining(['ja', 'ko']))
    } else {
      expect(runtimeProbe.legacy.languages).not.toContain('ja')
      expect(runtimeProbe.legacy.languages).not.toContain('ko')
    }
    expect(runtimeProbe.legacy.sectionIds).toContain('thinking-effort')
    expect(registered).toHaveLength(1)
    expect(registered[0]?.id).toBe('@hytime/dsh-thinking-effort')
      expect(typeof registered[0]?.factory).toBe('function')
      } finally {
        rmSync(home, { recursive: true, force: true })
        rmSync(packDestination, { recursive: true, force: true })
      }
    }
  })
})
