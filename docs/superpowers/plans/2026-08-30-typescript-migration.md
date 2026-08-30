# dsh-thinking-effort TypeScript 迁移实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `subagent-driven-development`（推荐）或 `executing-plans` 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 将 `@hytime/dsh-thinking-effort` 从手写 `.mjs/.js` 迁移为严格类型检查的 TypeScript 单包，同时保持 DSH lazy-CJS Client 协议、legacy/modern Settings 兼容和现有设置页行为。

**架构：** 保持一个 npm 包，Host 入口为 `src/index.ts`，动态浏览器入口为 `src/client/index.ts`。新增独立 `src/compat/` 版本/能力适配层；Host 和 Client 只消费适配结果，不在业务代码中散落版本判断。构建先由 `tsc` 生成 `lib/types`，再由本包的 tsdown 配置生成 `lib/index.js` 与 `lib/client.js`。

**技术栈：** TypeScript strict、TSX、tsdown、Vitest、Node ESM、DSH lazy-CJS `window.__ModuleLoader__.load`、React 18 platform external。

---

## 文件清单与职责

### 创建

- `tsconfig.json`：生产 TypeScript project，`rootDir: src`、`outDir: lib/types`、strict、声明和 source map。
- `tsconfig.test.json`：测试类型检查 project，包含 `tests/`，不污染生产 `lib/types`。
- `tsdown.config.ts`：Host ESM 和 Client lazy-CJS 两个输出配置。
- `vitest.config.ts`：Node 默认测试环境与 TypeScript source 测试配置。
- `src/index.ts`：Host named exports、Cordis `inject` 和 `apply` 组合入口。
- `src/compat/version-adapter.ts`：semver 解析、已验证版本映射、profile 选择和诊断。
- `src/compat/capabilities.ts`：跨 Host/Client 的最小能力类型与能力到 profile 的决策。
- `src/host/types.ts`：Settings、provider/model、agent request 的边界类型。
- `src/host/marker.ts`：加载标记路径和写入 effect。
- `src/host/settings.ts`：Settings 读取、默认 reasoning efforts 补齐和重试调度。
- `src/host/subagent.ts`：`subagentEffort` 读取、标准/自定义 wire 映射和 `agent/request` handler。
- `src/client/index.ts`：Client composition，slot/locale 注册和 lazy `remote.settings` mount。
- `src/client/types.ts`：Client Context、Settings API、Slot、Locale 和 DSH capability 类型。
- `src/client/constants.ts`：namespace、档位、预设、context/input 限制和版本常量。
- `src/client/settings-bridge.ts`：legacy/modern Settings 调用统一为 `SettingsApi`，消费 compat adapter。
- `src/client/locales.ts`：locale JSON 导入、key 类型、key parity 类型断言和语言注册。
- `src/client/model-inventory.ts`：models/modelOverrides 的 inventory 类型和读取转换。
- `src/client/model-ops.ts`：模型合并、整 route Settings ops 和 dirty 字段操作。
- `src/client/validation.ts`：draft、reasoning levels、context window、input modalities 校验。
- `src/client/theme.ts`：当前 inline palette 行为的类型化实现。
- `src/client/SectionEditor.tsx`：页面状态、读取、保存、搜索、预设和编辑器编排。
- `src/client/components/Controls.tsx`：本地 icon、button、switch 的 TSX presentation helper。
- `src/client/components/ModelRow.tsx`：模型摘要行和展开入口。
- `src/client/components/ModelEditor.tsx`：模型档位、context 和 input 编辑区域。
- `src/client/components/SubagentSettings.tsx`：subagent 默认档位控件。
- `scripts/check-locales.mjs`：只读检查四份 locale JSON 的 key parity。
- `tests/compat.test.ts`：版本 profile、能力探测、未知版本和不一致诊断。
- `tests/host.test.ts`：Host 默认补齐、重试、事件和 subagent hook。
- `tests/client-helpers.test.ts`：bridge、inventory、ops、validation、locale helper。
- `tests/client-registration.test.ts`：源码 Client composition 的 inject/slot/locale 契约。
- `tests/client-ux.test.tsx`：jsdom 下的设置页用户行为。
- `tests/bundle-smoke.test.ts`：最终 `lib/client.js` loader wrapper 与 Host artifact smoke。
- `tests/loader-composition.test.ts`：本地 packed 包接入 DSH profile 的组合测试入口或脚本封装。

### 修改

- `package.json`：scripts、`main`、`types`、`exports`、`files`、开发依赖和版本 `0.1.11`。
- `README.md`、`README.zh.md`、`README.ja.md`、`README.ko.md`：构建产物、版本适配和兼容说明。
- `INSTALL.md`、`INSTALL.zh.md`、`INSTALL.ja.md`、`INSTALL.ko.md`：安装已构建包和本地验证说明。
- `CHANGELOG.md`、`CHANGELOG.ja.md`、`CHANGELOG.ko.md`：`0.1.11` TS migration 条目。
- `cordis.patch.yml`：仅确认并保持 `id: thinking-effort` 与包名，不改变组合语义。
- `src/locales/{zh,en,ja,ko}.json`：只在 parity 测试暴露真实缺失/多余 key 时修正，不改变现有文案。

### 删除

- `src/host.mjs`：由 `src/index.ts` 和 Host tsdown 产物替代。
- `src/client.js`：由 `src/client/index.ts` 和 Client tsdown 产物替代。
- `scripts/build-client.mjs`：locale 不再通过字符串替换写入 bundle，由 `check-locales.mjs` 和 TS import 取代。

不修改官方 DSH checkout，不修改官方 aggregate，不纳入已有未跟踪的 3 个文件。

---

### 任务 1：建立 TypeScript、测试和构建基线

**文件：**
- 创建：`tsconfig.json`、`tsconfig.test.json`、`tsdown.config.ts`、`vitest.config.ts`
- 修改：`package.json`
- 创建：`src/index.ts`、`src/client/index.ts`
- 创建：`scripts/check-locales.mjs`
- 测试：`tests/compat.test.ts`、`tests/bundle-smoke.test.ts`

- [ ] **步骤 1：先写基线测试**

在 `tests/bundle-smoke.test.ts` 写出构建产物契约的断言辅助函数：读取 `lib/client.js`，注入 fake `window.__ModuleLoader__.load`，断言 descriptor id 为 `@hytime/dsh-thinking-effort`；读取 `lib/index.js` 并断言 named `name`、`inject`、`apply` 存在。测试在产物不存在时明确失败并提示先执行 build。

在 `tests/compat.test.ts` 先放置 profile 类型的导入和一个会失败的 modern 判定用例：

```ts
import { describe, expect, it } from 'vitest'
import { resolveCompatibility } from '../src/compat/version-adapter.ts'

it('classifies the current alpha capabilities as modern', () => {
  expect(resolveCompatibility({
    version: '0.1.2-alpha.1',
    capabilities: { settings: 'remote', externalLanguages: true },
  }).profile).toBe('modern')
})
```

- [ ] **步骤 2：运行基线测试确认失败**

运行：`npm test -- --run tests/compat.test.ts tests/bundle-smoke.test.ts`

预期：因 `src/compat/version-adapter.ts`、`src/index.ts` 或构建产物尚不存在而失败；不要通过跳过测试或硬编码测试结果消除失败。

- [ ] **步骤 3：编写最小配置与空入口**

`package.json` 增加：

```json
{
  "scripts": {
    "build": "node scripts/check-locales.mjs && tsc -p tsconfig.json && tsdown -c tsdown.config.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build"
  }
}
```

`src/index.ts` 和 `src/client/index.ts` 先导出正确的 `name`、`inject` 和占位 `apply`，`tsconfig` 开启 `strict`、`noImplicitAny`、`declaration`、`sourceMap`、`resolveJsonModule`，测试 config 使用 Vitest。

- [ ] **步骤 4：运行类型与 locale 基线**

运行：`npm run typecheck`、`node scripts/check-locales.mjs`

预期：空入口和四份现有 JSON 能通过；如果现有 locale key 不一致，修复对应 JSON 后再继续，不能在脚本中放宽 parity 检查。

- [ ] **步骤 5：Commit**

```sh
git add package.json tsconfig.json tsconfig.test.json tsdown.config.ts vitest.config.ts src/index.ts src/client/index.ts scripts/check-locales.mjs tests
 git commit -m "build: establish TypeScript plugin baseline"
```

---

### 任务 2：实现独立版本检查与能力适配层

**文件：**
- 创建：`src/compat/version-adapter.ts`、`src/compat/capabilities.ts`
- 修改：`src/client/types.ts`
- 测试：`tests/compat.test.ts`

- [ ] **步骤 1：写完整失败测试**

测试以下固定输入和输出：

```ts
const legacy = { settings: 'legacy', externalLanguages: false } as const
const modern = { settings: 'remote', externalLanguages: true } as const
const noSettings = { settings: 'none', externalLanguages: false } as const

expect(resolveCompatibility({ version: '0.1.1-rc.2', capabilities: legacy }).profile).toBe('legacy')
expect(resolveCompatibility({ version: '0.1.1-rc.7', capabilities: legacy }).profile).toBe('legacy')
expect(resolveCompatibility({ version: '0.1.2-alpha.1', capabilities: modern }).profile).toBe('modern')
expect(resolveCompatibility({ version: undefined, capabilities: modern }).profile).toBe('modern')
expect(resolveCompatibility({ version: '9.9.9', capabilities: modern }).profile).toBe('unknown')
expect(resolveCompatibility({ version: '0.1.2-alpha.1', capabilities: legacy }).diagnostics).toHaveLength(1)
expect(resolveCompatibility({ version: undefined, capabilities: noSettings }).profile).toBe('unknown')
```

同时测试 semver 非法字符串、modern 版本但仅 legacy Settings、legacy 版本但 Remote 可用、未知版本具备 legacy/modern 能力，以及诊断中包含 expected profile 和 actual capabilities。

- [ ] **步骤 2：运行测试确认失败**

运行：`npm test -- --run tests/compat.test.ts`

预期：所有 profile 判定用例失败，因为适配器尚未实现。

- [ ] **步骤 3：实现纯 compat API**

定义并导出：

```ts
export type CompatibilityProfile = 'legacy' | 'modern' | 'unknown'
export interface DshCompatibilityCapabilities {
  readonly settings: 'legacy' | 'remote' | 'none'
  readonly externalLanguages: boolean
}
export interface CompatibilityReport {
  readonly profile: CompatibilityProfile
  readonly version?: string
  readonly expected?: Exclude<CompatibilityProfile, 'unknown'>
  readonly capabilities: DshCompatibilityCapabilities
  readonly diagnostics: readonly CompatibilityDiagnostic[]
}
export function resolveCompatibility(input: {
  readonly version?: unknown
  readonly capabilities: DshCompatibilityCapabilities
}): CompatibilityReport
```

实现 semver parser 只接受 `major.minor.patch` 加 prerelease，精确映射 `0.1.1-rc.2`、`0.1.1-rc.7` 为 legacy，`0.1.2-alpha.1` 为 modern；未知但合法版本返回 `expected: undefined`。实际 capabilities 是运行分支的权威来源：Remote 优先 modern，legacy API 次之，无 Settings 为 unknown；版本/能力冲突只生成诊断，不抛出异常。

- [ ] **步骤 4：实现 Host/Client capability readers**

在 `src/compat/capabilities.ts` 提供无副作用的结构读取函数：

```ts
export function clientCapabilities(input: {
  readonly remoteSettings?: unknown
  readonly legacySettings?: unknown
  readonly addLanguage?: unknown
}): DshCompatibilityCapabilities

export function hostCapabilities(input: {
  readonly settings?: unknown
}): DshCompatibilityCapabilities
```

Client reader 检查方法存在性但不调用；同时存在时标记 `settings: 'remote'`，不存在 Remote 但 legacy 方法完整时标记 `legacy`；只有完整 `addLanguage` 才标记 `externalLanguages: true`。Host reader 仅描述 Host Settings 读写/describe 形状，不能读取未声明属性。

- [ ] **步骤 5：运行 compat 测试确认通过**

运行：`npm test -- --run tests/compat.test.ts`、`npm run typecheck`

预期：版本、能力、未知版本和 mismatch 测试全部通过，生产代码无隐式 `any`。

- [ ] **步骤 6：Commit**

```sh
git add src/compat src/client/types.ts tests/compat.test.ts
git commit -m "feat: add DSH version compatibility adapter"
```

---

### 任务 3：迁移 Host 默认补齐与 subagent hook

**文件：**
- 创建：`src/host/types.ts`、`src/host/marker.ts`、`src/host/settings.ts`、`src/host/subagent.ts`
- 修改：`src/index.ts`
- 删除：`src/host.mjs`
- 测试：`tests/host.test.ts`

- [ ] **步骤 1：把现有 Host 测试迁移为 TypeScript 并补齐失败用例**

保留现有“global listener”和“读取 max”测试，新增：

- writable=false 不执行 update；
- models 和 modelOverrides 同时补齐；
- 显式 `reasoningEfforts`、显式 `null`、非对象和未知字段保持不变；
- 第二次运行幂等；
- `settings/updated` 只响应 `llm-pi-ai`；
- late namespace 在 500ms 后按 timer 重试；
- update reject 只记录日志并继续重试；
- 标准档位直接映射，自定义 wire 反查 level；
- 主 agent、缺失 header、显式 effort 不修改 config；
- 下游 `next()` 先执行，异常不被 handler 吞掉。

- [ ] **步骤 2：运行 Host 测试确认迁移前失败**

运行：`npm test -- --run tests/host.test.ts`

预期：新 TypeScript import 和新增行为用例失败，因为实现仍在已删除前的 MJS 文件中。

- [ ] **步骤 3：实现边界类型和 marker**

`src/host/types.ts` 为 JSON 边界定义 `UnknownRecord`、`ProviderProfile`、`ModelEntry`、`SettingsDescriptor`、`AgentRequestPayload` 和 `AgentRequestConfig`，所有外部对象先过局部类型守卫。

`src/host/marker.ts` 保持：

```ts
const MARKER = join(process.env.DSH_HOME || process.cwd(), 'thinking-effort-loaded.json')
export function mark(event: string): void {
  try { writeFileSync(MARKER, JSON.stringify({ event, at: new Date().toISOString(), pid: process.pid }, null, 2)) }
  catch { /* marker diagnostics must not block plugin activation */ }
}
```

- [ ] **步骤 4：实现 settings 补齐和 subagent hook**

把 `fillDefaults()` 拆为可测试的纯函数和副作用 orchestration：纯函数只处理 providers，副作用函数负责 `settings.get/update`、timer retries 和 `settings/updated`。

`src/host/subagent.ts` 实现 `readSubagentEffort()`、`resolveSubagentEffort()` 和 `handleAgentRequest(payload, next)`；`handleAgentRequest` 必须先 `await next()`，然后只对 subagent 且下游没有 `reasoningEffort` 的结果创建浅拷贝。

`src/index.ts` 组合：

```ts
export const name = '@hytime/dsh-thinking-effort'
export const inject = ['settings', 'timer'] as const
export function apply(ctx: HostContext): void {
  mark('apply')
  installSettingsWatcher(ctx)
  ctx.on('agent/request', (payload, next) => handleAgentRequest(ctx, payload, next), { global: true })
}
```

- [ ] **步骤 5：运行 Host 测试与 artifact parse 检查**

运行：`npm test -- --run tests/host.test.ts`、`npm run typecheck`、`npm run build`、`node --check lib/index.js`

预期：Host 行为和新增边界测试通过，`lib/index.js` 可被 Node 解析。

- [ ] **步骤 6：Commit**

```sh
git add src/index.ts src/host tests/host.test.ts
git rm src/host.mjs
git commit -m "refactor: migrate Host plugin to TypeScript"
```

---

### 任务 4：迁移 Client 纯数据层与 Settings bridge

**文件：**
- 创建：`src/client/constants.ts`、`src/client/types.ts`、`src/client/settings-bridge.ts`、`src/client/locales.ts`、`src/client/model-inventory.ts`、`src/client/model-ops.ts`、`src/client/validation.ts`、`src/client/theme.ts`
- 修改：`src/client/index.ts`
- 删除：`src/client.js`、`scripts/build-client.mjs`
- 测试：`tests/client-helpers.test.ts`、`tests/client-registration.test.ts`

- [ ] **步骤 1：迁移纯 helper 测试并先运行失败**

将当前 `client-ux.test.mjs` 中对 bridge、inventory、ops、draft、validation 的行为提取为直接模块测试。至少保留：

```ts
expect(settingsBridge(connection, undefined)?.describe()).toMatchObject({ ok: true })
expect(setOps(inventory, updates)).toEqual([
  { op: 'set', path: ['providers', 'provider', 'models'], value: expectedModels },
])
expect(validateLevels({ off: null }, translate)).toBe('atLeastThinking')
expect(validateContextWindow({ value: '1999', oneMillion: false }, translate)).toMatchObject({ error: expect.any(String) })
```

运行：`npm test -- --run tests/client-helpers.test.ts`

预期：因 TypeScript helper 文件尚不存在而失败。

- [ ] **步骤 2：实现 Client 类型与常量**

定义 `ALL_LEVELS` 为 `['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const`，定义 `ReasoningLevel`、`ReasoningEfforts`、`InventoryItem`、draft 类型、`SettingsApi` 和 `ClientResult<T>`。保留 namespace、preset、context `2000..1000000` 和 `text|image` 常量。

- [ ] **步骤 3：实现 bridge 并接入 version adapter**

`settingsBridge` 接收 `ClientContext` 所需的 `connection` 与可选 `remoteSettings`，调用 `clientCapabilities()` 和 `resolveCompatibility()` 后创建同一内部接口：

```ts
interface SettingsApi {
  describe(): Promise<ClientResult<SettingsDescribeValue>>
  mutate(ns: string, ops: readonly SettingsOp[], expectedRevision: number): Promise<ClientResult<SettingsNamespace>>
}
```

modern 调用 `describe()` / `mutate(ns, ops, expectedRevision)`，legacy 调用 `describe({})` / `mutate({ ns, ops, expectedRevision })`，两者都经 `directResult()` 归一。保留 legacy-first 和首次成功 mount 后不替换。

- [ ] **步骤 4：实现 inventory、ops、validation、locale**

直接迁移现有纯逻辑：

- inventory 保留 route/model/name/raw/index/inOverrides；
- `mergeModelUpdate` 保留未知字段；
- `setOps` 按 route 与 models/modelOverrides 分组并整体替换；
- validation 保留至少一个非 off、context 安全整数、至少一种输入能力；
- locale module import 四份 JSON，并输出 `LocaleDictionary`；
- locale register 只接受四份字典，`addLanguage` 由 Client composition 根据 adapter capability 处理；
- theme 保留当前深浅色 palette 计算，避免本任务改变视觉。

- [ ] **步骤 5：重写 registration 测试**

`tests/client-registration.test.ts` 直接 import `src/client/index.ts`，断言 `inject` 精确为 `['slots', 'connection', 'locale']`，源码模块不声明 `remote`/`remote.settings` 硬依赖；使用 fake context 验证 lazy `ctx.inject(['remote.settings'])`、slot `id/order/locale` 和 effect disposer。

- [ ] **步骤 6：运行 helper/registration 测试**

运行：`npm test -- --run tests/client-helpers.test.ts tests/client-registration.test.ts`、`npm run typecheck`

预期：纯 helper、modern/legacy bridge、locale parity 和 lazy injection 全部通过。

- [ ] **步骤 7：Commit**

```sh
git add src/client scripts/check-locales.mjs tests/client-helpers.test.ts tests/client-registration.test.ts
git rm src/client.js scripts/build-client.mjs
git commit -m "refactor: type Client settings contracts"
```

---

### 任务 5：将设置页拆为类型化 TSX 组件并迁移 UI 测试

**文件：**
- 创建：`src/client/SectionEditor.tsx`、`src/client/components/Controls.tsx`、`src/client/components/ModelRow.tsx`、`src/client/components/ModelEditor.tsx`、`src/client/components/SubagentSettings.tsx`
- 修改：`src/client/index.ts`、`src/client/theme.ts`
- 测试：`tests/client-ux.test.tsx`

- [ ] **步骤 1：把现有 UI 测试改成 jsdom 用户行为测试**

保留当前用户可观察行为断言，不再替换 bundle 文本中的 `return module.exports;`。测试使用实际 TSX 组件和 fake Settings API，覆盖：加载/错误、模型搜索、provider/model 展开、档位 switch、wire input、context、input modality、subagent、保存成功/失败、预设、恢复、语言选项和版本水印。

运行：`npm test -- --run tests/client-ux.test.tsx`

预期：因组件尚未实现而失败。

- [ ] **步骤 2：实现纯 presentation controls**

`Controls.tsx` 的 props 只接受字符串、boolean、callback、palette 和 React children；不导入 Cordis，不读取 ctx。继续使用 button、switch、select、input 的稳定尺寸和现有 aria-label/title。

- [ ] **步骤 3：实现模型行、编辑器和 subagent 组件**

组件只消费 `InventoryItem`、draft state、locale `t` 和 plain callbacks。`ModelEditor` 不直接调用 Settings；保存由 `SectionEditor` 调用 `setOps` 与 bridge。`SubagentSettings` 只发出 default/custom level change 和 save callback。

- [ ] **步骤 4：实现 SectionEditor 状态编排**

把当前 `useState` 初始状态、`load`、`applyNamespaceView`、`runOps`、`applyModel`、`applyPreset`、restore、toggle 和 draft patch 逻辑按原语义迁移。保留：

```tsx
React.useEffect(() => { load() }, [])
```

和保存后使用 Remote 返回 namespace 重建 inventory；不引入隐藏 module-level store，不把 domain model data 复制进新的 store。

- [ ] **步骤 5：运行 UI 测试并修正类型错误**

运行：`npm test -- --run tests/client-ux.test.tsx`、`npm run typecheck`

预期：所有用户行为测试通过；TSX 组件不出现 `ctx` prop、未声明 `any` 或硬编码 locale copy。

- [ ] **步骤 6：Commit**

```sh
git add src/client tests/client-ux.test.tsx
git commit -m "refactor: migrate thinking effort settings UI to TSX"
```

---

### 任务 6：完成 lazy-CJS 构建、manifest 和产物测试

**文件：**
- 修改：`tsdown.config.ts`、`package.json`、`tests/bundle-smoke.test.ts`
- 创建或修改：`tests/loader-composition.test.ts`
- 产物：`lib/index.js`、`lib/client.js`、`lib/types/**/*.d.ts`

- [ ] **步骤 1：写构建协议失败测试**

`tests/bundle-smoke.test.ts` 对 `lib/client.js` 做以下黑盒断言：

```ts
expect(source).toContain('window.__ModuleLoader__.load')
expect(source).toContain("id: '@hytime/dsh-thinking-effort'")
expect(descriptor.factory((name) => name === 'react' ? React : undefined).inject)
  .toEqual(['slots', 'connection', 'locale'])
expect(source).not.toContain("ctx.inject(['remote',")
```

同时执行 fake ModuleLoader factory，确认 `require('react')` 被调用且 `remote.settings` 只在 `ctx.inject` callback 中读取。

- [ ] **步骤 2：实现 tsdown 双输出**

`tsdown.config.ts` 使用两个配置对象：

```ts
export default [
  { entry: { index: 'lib/types/index.js' }, outDir: 'lib', format: ['esm'], platform: 'node', clean: false },
  {
    entry: { client: 'lib/types/client/index.js' },
    outDir: 'lib', format: ['cjs'], platform: 'browser', clean: false,
    deps: {
      neverBundle: (specifier) => specifier === 'react' || specifier === 'react/jsx-runtime',
      alwaysBundle: (specifier) => specifier !== 'react' && specifier !== 'react/jsx-runtime',
    },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: "window.__ModuleLoader__.load({ id: '@hytime/dsh-thinking-effort', factory: (require) => {",
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      footer: 'return module.exports; } });',
    },
  },
]
```

配置中的 `deps.neverBundle` 只保留 DSH Web 提供的 React platform 模块，`deps.alwaysBundle` 将本包其余实现代码内联；`outputOptions` 固定 lazy-CJS wrapper 和 `client.js` 文件名。bundle smoke 验证最终字节和执行结果，而不是只验证配置对象。

- [ ] **步骤 3：更新 package manifest**

将 `main`/`exports` 指向 `lib`，增加 `types` 和 `./client` 的类型入口，删除 `src/` 运行时入口；将 TypeScript、tsdown、Vitest、React 类型和 Node 类型放入 devDependencies，保持 `@deepseek-ai/cordis` peer + dev；`files` 覆盖 `lib/index.js`、`lib/client.js`、`lib/types/**/*.d.ts`、patch、文档和资源。

版本改为 `0.1.11`，`dsh.client.platform` 保持 `web`，不新增 `dsh.client.external`。

- [ ] **步骤 4：运行构建与产物测试**

运行：`npm run build`、`npm test -- --run tests/bundle-smoke.test.ts`、`npm run typecheck`、`node --check lib/index.js`、`node --check lib/client.js`

预期：两个产物生成，Client bundle 可由 fake ModuleLoader 执行，React 只通过外部 `require` 获取，Host 入口可由 plain Node import。

- [ ] **步骤 5：运行发布视图检查**

运行：`npm pack --dry-run`。

预期：tarball 不依赖 `src/host.mjs`、`src/client.js` 或 `scripts/build-client.mjs`；包含两个运行时入口、类型声明、patch、文档和所有资源。

- [ ] **步骤 6：Commit**

```sh
git add package.json tsdown.config.ts lib tests/bundle-smoke.test.ts tests/loader-composition.test.ts
git commit -m "build: emit typed Host and lazy Client artifacts"
```

---

### 任务 7：真实 Loader、双 DSH 版本回归、文档和发布验收

**文件：**
- 修改：`README.md`、`README.zh.md`、`README.ja.md`、`README.ko.md`、`INSTALL.md`、`INSTALL.zh.md`、`INSTALL.ja.md`、`INSTALL.ko.md`、`CHANGELOG.md`、`CHANGELOG.ja.md`、`CHANGELOG.ko.md`
- 修改：`tests/loader-composition.test.ts`
- 产物：本地 packed tarball

- [ ] **步骤 1：写真实组合测试脚本**

测试脚本使用本包的 tarball，不手工编辑 profile：

```sh
npm pack --pack-destination /tmp/dsh-thinking-effort-pack
DSH_HOME=/tmp/dsh-thinking-effort-home dsh plugin --profile compat add /tmp/dsh-thinking-effort-pack/hytime-dsh-thinking-effort-0.1.11.tgz
DSH_HOME=/tmp/dsh-thinking-effort-home dsh --profile compat --dump-default-config
```

测试断言 profile 组合树含 `id: thinking-effort` 和 `name: '@hytime/dsh-thinking-effort'`，不含旧包名；Node 启动后检查 `thinking-effort-loaded.json`，Web bundle URL 返回并能注册正确 loader id。

- [ ] **步骤 2：运行当前 alpha 回归**

使用已构建的 `/Volumes/hydisk/deepseek-harness`，不修改其工作树；通过临时 `DSH_HOME` 和官方 `dsh plugin` 命令安装本地 tarball，启动 Web/或执行 dump config，确认 modern `remote.settings`、ja/ko registration 和 settings section 正常。

运行：`DSH_HOME=/tmp/dsh-thinking-effort-alpha dsh --profile compat --dump-default-config`，随后刷新既有 `http://127.0.0.1:3080`，只在实际 bundle 发生变化时验证页面。

- [ ] **步骤 3：运行旧 rc2/rc7 回归**

使用 `/tmp/dsh-compat-dsh-v0.1.1-rc.2` 和已准备的 `/tmp/dsh-compat-home-rc2`，通过该旧 DSH 的官方 `dsh plugin` 命令安装同一个 tarball。验证：

- Client 不因缺少 Remote 停在 PENDING；
- legacy `connection.api.settings` describe/mutate 可用；
- 无 `addLanguage` 时 ja/ko 选项隐藏；
- Host agent/request hook 仍可运行；
- 组合和 loaded marker 均使用 scoped package identity。

- [ ] **步骤 4：运行最终验证梯子**

运行：

```sh
npm run typecheck
npm test
npm run build
node --check lib/index.js
node --check lib/client.js
npm pack --dry-run
git diff --check
```

对 GUI 产物实际有变化时，再运行已有 DSH Web smoke；不启动替代 3080 server，不修改官方 profile。

- [ ] **步骤 5：更新文档**

在所有语言 README/INSTALL 中说明：运行入口是已构建的 `lib`；本地源码开发需执行 `npm run build`；旧 DSH Settings API 和当前 Remote 均受支持；兼容适配器按版本 metadata 优先、能力探测回退；未知版本在能力满足时继续运行。

`CHANGELOG` 增加 `0.1.11` 条目，明确这是 TS/build migration，行为和数据格式保持兼容。

- [ ] **步骤 6：检查发布与工作区**

运行：`npm pack --dry-run`、`git status --short --branch`。

预期：发布视图闭合；只包含计划中的 tracked changes；以下既有未跟踪文件继续存在且未被加入：

```text
docs/68d52d9f-5742-4164-9685-6b9e7f5a86e9.png
docs/94d15cfd-3ff0-4695-ac9f-c10cb578b500.png
thinking-effort-loaded.json
```

- [ ] **步骤 7：Commit**

```sh
git add README.md README.zh.md README.ja.md README.ko.md INSTALL.md INSTALL.zh.md INSTALL.ja.md INSTALL.ko.md CHANGELOG.md CHANGELOG.ja.md CHANGELOG.ko.md tests/loader-composition.test.ts
git commit -m "docs: document TypeScript compatibility release"
```

---

## 计划自检结论

- 规格中的独立版本检查适配层对应任务 2；具体覆盖 semver、已验证版本、能力探测、未知版本和 mismatch 诊断。
- 规格中的 Host 行为对应任务 3；Client bridge/locale/UI 行为分别对应任务 4 和任务 5。
- lazy-CJS 输出、React external、`lib` exports、`files` 和发布 tarball 对应任务 6。
- 当前 alpha、旧 rc2/rc7、官方 CLI 安装、Web smoke 和未跟踪文件保护对应任务 7。
- 没有把官方 monorepo aggregate、workspace protocol、内部 invariant 或官方 `clientBundle` 私有路径写成第三方包的必需依赖。
- 计划中的所有公开函数名、profile 类型、Settings API 签名和输出文件名在前后任务一致。
- 计划步骤均给出具体文件、命令、代码接口和验收结果。
