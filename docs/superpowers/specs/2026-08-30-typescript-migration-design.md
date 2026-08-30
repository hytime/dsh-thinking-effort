# TypeScript 迁移设计：dsh-thinking-effort

- 日期：2026-08-30
- 状态：已修订，待用户审查
- 范围：行为等价的 TypeScript 工程化迁移

## 背景与目标

`@hytime/dsh-thinking-effort` 当前是一个 npm 包，Host 入口为 `src/host.mjs`，浏览器入口为手写的 `src/client.js`。Host 负责给 `llm-pi-ai` 模型补齐默认 reasoning efforts，并在 `agent/request` 中为 subagent 注入默认档位；Client 负责设置页、Settings API 读写、locale 注册和模型能力编辑。

本次迁移的目标是将 Host、Client、类型、构建和测试改为 TypeScript 优先，同时保持现有运行时行为、设置数据格式和旧 DSH 兼容性。该迁移不新增设置功能，不改变 UI 交互，不修改 DSH 核心或官方 Web shell。

官方依据包括：

- DSH 架构与插件扩展点：[official architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- TS 项目与构建顺序：[official development guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)
- 插件形态：[extension cookbook](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md)
- 外部包结构：[adding a package](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-package.md)
- 设置卡模式：[adding a settings card](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-settings-card.md)
- 动态 Client 约束：[packages/client/AGENTS.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/AGENTS.md)

## 决策

### 保持一个 npm 包

继续使用一个 `@hytime/dsh-thinking-effort` 包，同时发布 Host Node entry 和动态 Client browser bundle。Node 入口和浏览器入口共存不是拆分 TypeScript project 的理由；官方只有在不同源码集合需要不同 compiler face 时才拆分特殊包。

不修改官方仓库的 `tsconfig.host.json`、`tsconfig.client.json`、`packages/bundle/web-app/cordis.patch.yml` 或 aggregate references。插件在自己的仓库完成 typecheck 和 bundle，通过用户 profile 的 Loader/patch 进入 DSH。

### 使用原生 TypeScript 源码

采用官方插件的职责边界：Host 组合入口为 `src/index.ts`，浏览器组合入口为 `src/client/index.ts`。Client 入口只捕获已声明的服务、注册 locale 和 slot；业务逻辑放在独立模块，React 组件不接收或读取 `ctx`。

建议源码结构如下，按实际实现保留必要层次，不为不存在的能力创建服务、store 或 invariant：

```text
src/
  index.ts
  compat/
    version-adapter.ts
    capabilities.ts
  host/
    types.ts
    marker.ts
    settings.ts
    subagent.ts
  client/
    index.ts
    types.ts
    constants.ts
    settings-bridge.ts
    locales.ts
    model-inventory.ts
    model-ops.ts
    validation.ts
    SectionEditor.tsx
    components/
      controls.tsx
      ModelRow.tsx
      ModelEditor.tsx
      SubagentSettings.tsx
    theme.ts
  locales/
    zh.json
    en.json
    ja.json
    ko.json
scripts/
  check-locales.mjs

tests/
  host.test.ts
  client-registration.test.ts
  client-ux.test.tsx
  client-helpers.test.ts
  bundle-smoke.test.ts
```

不创建 `index.html`、独立 React root、独立 Vite app，也不新增 Host/Client 两个 npm 包。当前 inline palette 暂时保留，CSS Modules 与 `--dsw-*` token 迁移另列为后续视觉改造，避免与行为等价迁移混在一起。

### 保持身份与加载协议

以下标识不能改变：

- npm 包名、Host name、Client loader id：`@hytime/dsh-thinking-effort`
- Cordis 组合条目 ID：`thinking-effort`
- Settings slot ID：`thinking-effort`
- Settings namespace：`llm-pi-ai`
- locale namespace：`settings.thinkingEffort`

Client 产物必须继续执行：

```js
window.__ModuleLoader__.load({
  id: '@hytime/dsh-thinking-effort',
  factory: (require) => {
    // module.exports 包含 name/inject/apply
  },
})
```

`react` 和 `react/jsx-runtime` 保持为外部模块，由 DSH Web 平台模块表提供，不能在插件 bundle 中复制 React 实例。插件没有跨插件运行时 value import，因此不增加 `dsh.client.external`。

## 独立版本兼容适配层

DSH 当前没有向普通插件公开稳定的运行时 semver 服务。CLI 可从自身 `package.json` 读取版本，但 Host 插件和动态 Client bundle 不能把 CLI 的读取逻辑当作插件 API。因此兼容性实现采用“版本 profile + 实际能力探测”，而不是把版本号判断散落在业务模块中。

`src/compat/version-adapter.ts` 维护纯函数和类型：

- `DshCompatibilityProfile`：`legacy`、`modern`、`unknown` 三种运行时 profile；
- 已验证版本映射：旧 `dsh-v0.1.1-rc.2` / rc7 归入 legacy，当前 `dsh-v0.1.2-alpha.1` 归入 modern；版本映射是测试与诊断依据，不是假定所有补丁版本都暴露相同能力的唯一依据；
- semver 解析、版本比较和未知版本分类；
- 版本预期与实际能力不一致时的诊断数据。

`src/compat/capabilities.ts` 定义跨运行时的最小能力模型：

```ts
type DshCompatibilityCapabilities = {
  settings: 'legacy' | 'remote' | 'none'
  externalLanguages: boolean
}
```

Host 和 Client 各自提供探测适配器：

- Host 检查当前可用的 Settings 读写/describe 形状；
- Client 检查 `remote.settings`、`connection.api.settings`、`locale.addLanguage` 等公开能力；
- 有显式版本元数据时先计算预期 profile，再用实际能力验证；没有版本元数据时直接基于能力选择 profile；
- 版本与能力不一致时记录一次结构化诊断，实际调用只使用已经存在的能力；
- 未知版本只要满足最小 Settings 能力就继续运行；完全没有 Settings 通道时保持当前 Client active 但不注册设置页的行为；
- 业务代码只能消费适配器返回的 `SettingsApi`、语言注册 disposer 和能力 profile，不得直接写版本比较或 API 形状分支。

适配层测试固定以下矩阵：旧 rc2/rc7、当前 alpha、无版本元数据但具备 modern 能力、无版本元数据但具备 legacy 能力、未知未来版本、版本/能力不一致、完全不具备 Settings 的运行时。这样“版本检查”本身、降级策略和业务行为可以分别验证。

## Host 设计

`src/index.ts` named-export：

```ts
export const name = '@hytime/dsh-thinking-effort'
export const inject = ['settings', 'timer']
export function apply(ctx: Context): void
```

Host 保持以下行为：

1. 模块初始化时计算 `${DSH_HOME || process.cwd()}/thinking-effort-loaded.json`。
2. 写入 `{ event, at, pid }`；写入失败不影响插件功能。
3. 只有 `settings.writable === true` 且 `llm-pi-ai` section 和 `providers` 可用时才补齐模型。
4. 遍历 `providers[route].models[]` 与 `modelOverrides`，只给 `reasoningEfforts === undefined` 的对象补 `{ off: null, high: 'high', max: 'max' }`。
5. 保留显式档位、`null`、未知字段、模型数组顺序和已完成的对象；补齐操作幂等。
6. 挂载后延迟尝试，失败或命名空间尚未出现时按现有最多 5 次重试；`settings/updated` 只处理 `llm-pi-ai`。
7. `subagentEffort` 继续从 `ctx.settings.describe()` 返回的 `llm-pi-ai.user` 读取。
8. 标准档位 `off/minimal/low/medium/high/xhigh/max` 原样使用；自定义值按当前 provider/model 的 `reasoningEfforts` wire 值反查标准 level。
9. `agent/request` 使用 global waterfall，先 `await next()`；只为 `origin === 'subagent'` 且下游未设置 `reasoningEffort` 的请求返回覆盖后的 config。
10. 任何读取或覆盖异常记录日志并返回原结果，不吞掉下游异常之外的正常行为。

Settings、模型 profile、agent request 等对象在 JSON/Settings 边界使用局部类型守卫；同进程的静态 TypeScript 边界不重复增加无意义的运行时校验。

## Client 设计

### Composition entry

`src/client/index.ts` 只导出 DSH loader 所需的 named `name`、`inject`、`apply`，并声明：

```ts
export const inject = ['slots', 'connection', 'locale']
```

`remote.settings` 不加入硬注入列表，继续通过：

```ts
ctx.inject(['remote.settings'], (remoteCtx) => {
  const modernSettings = remoteCtx.get('remote.settings')
  // 仅在尚未 mount 时尝试使用
})
```

设置页注册 `settings.section` 时保持 `id: 'thinking-effort'`、`order: 12` 和 `locale: 'settings.thinkingEffort'`。注册、语言包和语言扩展均放入 `ctx.effect()`，卸载时撤销。

### Settings bridge

`settings-bridge.ts` 不再自行判断版本，而是消费 `src/compat/version-adapter.ts` 返回的 `SettingsApi`。它将两种 DSH 客户端协议归一为插件内部的 `SettingsApi`：

- modern：`describe()`、`mutate(ns, ops, expectedRevision)`；
- legacy：`describe({})`、`mutate({ ns, ops, expectedRevision })`；
- modern 直接返回 `ClientResult`；legacy 返回 `{ result: ClientResult }`；
- 通过 `directResult()` 统一响应；
- 保留当前 legacy-first、首次成功 mount 后不替换的行为。

bridge 的所有写操作都原样传递 namespace、ops 和 expected revision。插件继续使用完整 route 的 `models` / `modelOverrides` 替换，不能把数组下标继续下钻成 Settings path。

### Locale

四个 JSON 文件仍是 locale 源文件。`scripts/check-locales.mjs` 改为只读校验四份字典的 key 集合，不再改写 Client bundle。TypeScript 模块对 locale key 提供类型，并以编译断言和运行时测试共同保证 key parity。

`ja` 和 `ko` 只有在 `locale.addLanguage()` 可用时才注册，fallback 为 `en`；旧 DSH 没有外部语言注册能力时，组件依据 `locale.getSnapshot().locales` 隐藏不可用选项。该行为与当前旧 rc2/rc7 兼容逻辑保持一致。

### UI 与状态

从当前单文件中抽出纯 helper、模型清单、写入 ops、校验逻辑和 settings bridge；`SectionEditor.tsx` 负责页面状态与编排，局部 controls/components 只接收普通 props。

保持以下用户行为：

- 首次 describe 加载、错误、busy、notice 和 revision 状态；
- 模型搜索、提供方展开、模型编辑器展开；
- 收起再展开后 draft、context draft、input draft 和 dirty 状态保留；
- reasoning level 至少保留一个非 `off` 档位，非 `off` 档位必须有非空 wire value；
- context window 只接受安全整数 `2000..1000000`，支持 1M 快捷模式；
- text/image 至少启用一种输入能力；
- 保存成功后使用 Remote 返回的 namespace 重建 inventory；
- subagent 默认值写入 `llm-pi-ai` user 层顶层 `subagentEffort`；
- 保留搜索、预设、恢复默认、语言选择和版本水印行为。

## 构建与发布设计

### TypeScript 与 tsdown

`tsconfig.json` 使用 strict/noImplicitAny，`rootDir: src`，`outDir: lib/types`，并将 source plane 与 artifact plane 分开。类型检查先生成 `lib/types`，tsdown 只消费这些编译产物。

`tsdown.config.ts` 提供两个配置：

- Host：入口 `lib/types/index.js`，ESM、Node platform，输出 `lib/index.js`；
- Client：入口 `lib/types/client/index.js`，CJS、Browser platform，输出固定的 `lib/client.js`。

Client 配置必须等价实现官方 `clientBundle()` 的必要输出协议：固定 `client.js` 文件名、`module/exports` 初始化、`window.__ModuleLoader__.load` banner、返回 `module.exports` 的 footer，以及 React platform external。官方 `packages/client/tsdown.client.ts` 不是发布给外部包的 preset，因此本包保留自己的最小适配层，并通过产物 smoke 锁定协议。

构建脚本改为：

```text
check-locales -> tsc -p tsconfig.json -> tsdown
```

`package.json` 的运行时入口改为构建产物：

```json
{
  "main": "./lib/index.js",
  "types": "./lib/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./lib/types/index.d.ts",
      "default": "./lib/index.js"
    },
    "./client": {
      "types": "./lib/types/client/index.d.ts",
      "default": "./lib/client.js"
    },
    "./package.json": "./package.json"
  }
}
```

`dsh.bundle.patch` 保持不变，`dsh.client.platform` 继续为 `web`。不把未编译 `src/host.mjs` 或 `src/client.js` 作为发布入口；发布文件至少覆盖 `lib/index.js`、`lib/client.js`、`lib/types/**/*.d.ts`、patch、README、安装文档、CHANGELOG 和资源。

因为公开运行时身份、入口语义和旧版兼容能力不变，正式迁移版本使用 `0.1.11`。

## 测试设计

现有源码字符串注入测试改为源码模块测试与构建产物测试两层。

### Host 测试

覆盖：

- 全局 `agent/request` 注册和 waterfall 的 `next()` 顺序；
- settings 可写/只读；
- models 与 modelOverrides 补齐；
- 显式档位、显式 `null`、空对象、非对象和未知字段；
- 幂等与更新失败；
- namespace 晚注册重试；
- `settings/updated` namespace 过滤；
- 标准 effort、自定义 wire 反查、未映射 custom；
- 主 agent、缺少 header、显式 reasoning effort、下游异常；
- disposer 对 timer、listener 和标记相关 effect 的清理。

### Client 测试

覆盖：

- `directResult` 与 modern/legacy Settings bridge；
- inventory、model ops、draft 和输入/上下文/档位校验；
- models/modelOverrides 混合编辑、数组顺序和未知字段保留；
- slot 注册、lazy Remote、locale effect disposal；
- modern Settings、legacy Settings、无 Remote 的旧 DSH；
- locale 语言过滤和 ja/ko 注册；
- 设置页面的保存、错误、恢复、预设、搜索、展开收起和草稿保留；
- 用户可见文本和 aria 行为，而不是实现细节或源码字符串。

### 产物与组合测试

- 读取 `lib/client.js`，使用 fake `__ModuleLoader__` 验证 loader id、factory、`inject` 和 React external；
- plain Node import `lib/index.js`；
- 使用 DSH 官方 `dsh plugin` 命令把本地 packed tarball 加入临时 profile，验证 `dump-config`、Host 加载标记和 Web Client bundle；
- 在当前 alpha 与已准备的旧 rc2 worktree 上做兼容回归；
- `npm pack --dry-run` 检查发布闭包和 exports；
- 对 assembled browser/UI 产物发生变化的情况，刷新已有 `http://127.0.0.1:3080` 做真实页面 smoke。

计划执行的最小命令：

```sh
npm run build
npm test
npm run typecheck
node --check lib/index.js
node --check lib/client.js
npm pack --dry-run
git diff --check
```

## 文档与范围

同一变更更新 README、README.zh/ja/ko、INSTALL、INSTALL.zh/ja/ko 和 CHANGELOG，说明构建产物入口、旧 Settings API 兼容和 lazy Remote 行为。文档只描述当前状态，不复制官方文档的完整参考内容。

本次不修改官方 DSH checkout，不新增 Settings Remote，不改变模型可见上下文，不添加 session event，不重做样式，不拆分 npm 包，不迁移到新的 UI design system。若实现验证表明必须改变公开入口或旧 DSH 兼容性，停止当前迁移并重新评估版本与范围。

## 验收标准

1. `npm run build` 生成可加载的 `lib/index.js` 和 DSH lazy-CJS `lib/client.js`。
2. TypeScript strict 检查通过，所有生产源码不依赖未声明的 `any`。
3. 现有 Host/Client 行为测试全部迁移并通过，新增 Host 补齐与异常路径覆盖。
4. `remote.settings` 不进入硬注入，legacy 与 modern Settings API 均可用。
5. 版本兼容逻辑集中在独立适配层；已验证版本、无版本元数据、未知版本和版本/能力不一致矩阵均有测试。
6. 当前 alpha 和旧 rc2 的设置页及 Host 行为均能加载。
7. `npm pack --dry-run` 的发布视图包含全部运行时入口和相对资源，不依赖源码目录。
8. 官方 profile 通过 `dsh plugin` 安装本地包后，组合树仍包含 `id: thinking-effort` 和 `name: '@hytime/dsh-thinking-effort'`。
9. 未跟踪的用户文件不被修改、删除或纳入提交。
