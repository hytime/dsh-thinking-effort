# 安装指南（官方 DSH CLI）

本指南只使用 DSH 官方 `dsh plugin` 命令管理插件。命令会在目标 profile 中安装依赖，并自动同步 `dsh.profile.bundles`；不要用普通 `npm install`、profile 目录下的直接 `pnpm add` 或手工编辑 profile 配置替代它。

- [English installation guide](./INSTALL.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [English README](../README.md)
- [中文 README](../README.zh.md)
- [日本語 README](../README.ja.md)
- [한국어 README](../README.ko.md)
- [版本更新日志](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

每个已发布版本的功能和修复记录见 [CHANGELOG.md](./CHANGELOG.md)。升级前后请先查看对应版本条目，确认是否包含配置、运行时 ID 或迁移流程变更。

本文统一使用以下占位符：

- `<profile>`：目标 DSH profile，例如 `web`；
- `${DSH_HOME}`：DSH home，默认是 `$HOME/.dsh`；
- `@hytime/dsh-thinking-effort`：npm 包名、浏览器 bundle 路径、loader 注册 ID 和运行时插件 ID；
- `thinking-effort`：Cordis 组合条目 ID 和设置页 Slot ID；
- `dsh-thinking-effort`：旧版本包名和旧运行时 ID，仅用于迁移和排查历史配置。

## 0. 前置条件与确定 profile

前置条件：已安装 DSH CLI，并且当前终端可以执行 `dsh`。

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
ls "${DSH_HOME:-$HOME/.dsh}/profiles"
```

选择正在运行的 profile。一般部署使用 `web`，但应以实际启动命令中的 `--profile` 为准。

发布包使用 `lib/index.js` 作为 Host 入口，使用 `lib/client.js` 作为 Client 入口。从 TypeScript 或 locale 源码开发时，启动 DSH 或打包前必须先运行 `npm run build`。

当前 DSH 没有公开的 semver metadata 契约，因此运行时能力探测是权威来源。只有显式 metadata 或测试输入提供时才使用可选版本；未知合法版本仍按实际能力运行。插件同时支持新版 `remote.settings` 和旧版 `connection.api.settings`。

### DSH Runtime、Gateway Protocol 与 Settings 模型兼容边界

这几类兼容彼此独立：

- **DSH Runtime：** Settings 传输在新版 DSH 中使用 `remote.settings`，在旧版 DSH 中使用 `connection.api.settings`。插件按运行时实际能力进行探测，旧版回退路径保持可选。
- **Gateway Protocol：** DSH schema 提供时，插件使用官方 `llm-pi-ai.compat` 字段。安装并启用可选的 `dsh-llm-openai-completions` transport 后，插件可以接管符合条件的自定义 OpenAI 兼容思考模型供应商。
- **Settings 模型：** DSH `0.1.7` 起从各 Loader 条目自身的 `Config` schema 派生设置表单（`entry-config`），设置文档保存在当前 profile 的 `cordis.patch.yml`；DSH `0.1.0-rc.7` 至 `0.1.6` 改为注册 namespace，并把设置存放在 DSH 设置文档（例如 `~/.dsh/settings.yaml`）中。插件同时支持两种模型，客户端会解析宿主实际发布的分区 ID——`entry-config` 下是 `thinking-effort`，namespace 模型下是 `dsh-thinking-effort`。

version-map 按以下规则判断网关能力：

| DSH 范围 | Gateway compat 字段 | Takeover transport |
| --- | --- | --- |
| `0.1.0-rc.7` | 不支持 | 不支持 |
| `0.1.0-rc.8` 至 `<0.1.2-alpha.1` | schema 暴露时可用，但没有 `supportsFinishReason` 和 `supportsThinkingTokenBudget` | 可选 |
| `0.1.2-alpha.1` 及后续受支持范围 | schema 暴露时支持全部 15 个字段 | 可选 |

从 DSH `0.1.0-rc.8` 起，后续支持范围均以运行时 schema 暴露为准。
运行时 schema 没有暴露的字段不会在界面中显示。可选 transport 未安装或未启用时，不会执行 takeover。

## OpenCode 会话 Header

OpenCode 会话 Header 是模型编辑器中的模型级设置，不是 provider 全局设置，默认关闭。展开精确的 `provider/model`，只有目标服务确实要求 `x-opencode-session` 时才勾选「OpenCode 会话 Header」；开关拨动即保存，没有单独的保存按钮。

### 默认发送什么

勾选开关且未配置 `format` 时，Host 会发送符合 OpenCode Zen 规范形态、**由当前 DSH 会话 ID 确定性派生**的 `x-opencode-session`：

| 段 | 长度 | 来源 |
| --- | --- | --- |
| `ses_` | 4 | 固定前缀 |
| 十六进制时间戳 | 12 | 48 位毫秒时间戳，每个 DSH 会话首次使用时铸造一次（`time: firstUse`） |
| Base62 后缀 | 14 | 会话 ID 归一化（去掉 `session-` 前缀、转小写、去连字符）后的 80 位 SHA-256 摘要 |

由此得到的保证：

- **会话内恒定**——同一 DSH 会话总是发送同一个值（按会话粘性缓存）；缓存淘汰时保留首次铸造的铸币，被淘汰的会话再次访问仍得到同一个值；恢复的会话保留同样的 14 位后缀，只有 `firstUse` 模式下 DSH 重启后会重新铸造 hex 时间戳段。
- **会话间不同**——每次子 agent 运行都会派生独立的值，不会把多个会话压缩进同一个上游会话。
- **与会话 ID 绑定**——同一会话 ID 在任何机器上都派生同样的后缀，且无需保存任何值。
- **格式合规**——结果匹配 `^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$`（共 30 个字符）。

### 配置生成器

生成器的位置取决于 DSH 版本：`0.1.7` 及以后是当前 profile 的 `cordis.patch.yml` 中的 `opencodeSession.format` 分区（由 Loader 条目 ID `thinking-effort` 定位）；`0.1.0-rc.7` 至 `0.1.6` 是 DSH 设置文档（例如 `~/.dsh/settings.yaml`）中的 `dsh-thinking-effort.opencodeSession.format`。两种位置都由设置页代写。下面的 YAML 展示 `0.1.7` 之前版本读取的 namespace 形态：

```yaml
dsh-thinking-effort:
  opencodeSession:
    providers:
      opencode-go:
        models:
          deepseek-v4-flash: true
    format:
      mode: ses-derive
      time: firstUse
```

字段：

| 字段 | 取值 | 默认 | 含义 |
| --- | --- | --- | --- |
| `mode` | `ses-derive` / `passthrough` / `template` / `expression` / `script` | `ses-derive` | 开关打开时使用的生成器。未知值回退到 `ses-derive`。 |
| `time` | `firstUse` / `hash` | `firstUse` | 12 位 hex 段的来源。`hash` 改为从会话摘要派生，使整个值在任何机器上完全一致且无需任何缓存。 |
| `template` | 字符串 | `''` | `template` 模式：占位符 `{hex12}`、`{tail62}`、`{sessionId}`、`{rawSessionId}`、`{sha256}`、`{now}`、`{provider}`、`{model}`。 |
| `expression` | 字符串 | `''` | `expression` 模式：使用同一上下文的受限加法表达式，另提供 `sha256`、`slice`、`lower`、`upper`，例如 `'ses_' + hex12 + tail62`。 |
| `script` | 绝对路径 | `''` | `script` 模式：导出 `format(context)` 的 JS 文件（`.mjs` 或 `.cjs`），返回 header 值字符串。文件变更时热加载（每秒至多检查一次）；加载或求值失败时回退到 `ses-derive`。 |
| `validate` | 正则源 | `''` | 可选校验。为空不校验；内置默认形态为 `^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$`。 |
| `onInvalid` | `warn` / `drop` / `send` | `warn` | 产物未通过 `validate` 时：记日志照常发送 / 省略 header / 静默发送。 |

示例：

```yaml
# 显式规范生成器（等价于默认）
format: { mode: ses-derive, time: firstUse }

# 任何机器上完全确定（hex 段也来自摘要）
format: { mode: ses-derive, time: hash }

# 旧行为：原始 DSH 会话 ID
format: { mode: passthrough }

# 上游改版后的模板
format: { mode: template, template: '{hex12}-{tail62}' }

# 上游要求「前缀 + 派生段」时的表达式
format: { mode: expression, expression: "'ses_' + hex12 + tail62" }

# 任意未来格式的外部脚本
format: { mode: script, script: '/绝对/路径/session.mjs' }
```

`script` 文件导出一个接收相同上下文对象的函数：

```js
// /绝对/路径/session.mjs
export function format(ctx) {
  // ctx.hex12, ctx.tail62, ctx.sessionId, ctx.rawSessionId, ctx.now, ctx.provider, ctx.model
  return 'ses_' + ctx.hex12 + ctx.tail62
}
```

修改 `format` 配置后，会话的下一次请求会按新配置重新派生（按会话的缓存以配置指纹为 key）。修改 Host 或插件包后需要重启 DSH；修改 Settings 或 Client 后需要刷新 Web 页面，再测试模型请求。

### 会话值生成器卡片

设置页的「会话值生成器」卡片可读写下面全部字段，无需手写设置文档：生成模式、时间戳来源、模板 / 表达式 / 脚本路径、校验正则与校验失败策略。卡片只显示当前模式用到的字段（时间戳来源对 `passthrough` 以外的四个模式都显示），切换模式不会清空其它字段已填的内容。

卡片会在写入前校验，并在不通过时禁用「应用」按钮：

- **校验正则**必须是合法正则。宿主对无法编译的正则会**静默退化为「不校验」**，因此这一项最容易造成「以为设了校验，其实没有」。
- **模板 / 表达式 / 脚本**在各自模式下不能为空，否则宿主会回退为派生 `ses_` 值。
- **脚本路径**必须是绝对路径：宿主按自己的运行目录解析相对路径，相对路径实际不可用。
- **表达式**会在卡片内做语法校验（与宿主共用同一份解析代码）：语法错误与引用了不存在的标识符或函数都会被拦下，因为求值器对两者都会抛错，而宿主对抛错的处理同样是静默回退为派生值。

「应用」按钮只写入改动过的字段，因此不会覆盖同一命名空间里的方案库、回滚副本或各模型的会话开关。

### 行为说明

- 适配器或调用方已经提供的 `x-opencode-session` 会被保留，绝不覆盖。
- 该设置同时支持新版 Remote Settings transport 和旧版 `connection.api.settings` transport，且不会修改路由的 `api` 协议。
- 如果请求经过 Sub2API、CPA 或其他中转服务，请确认它保留 `x-opencode-session` 并继续转发给 OpenCode 上游。`llm-pi-ai.providers.<route>.headers.x-opencode-session` 这类静态 route 设置不能替代本功能，因为所有会话会共用一个固定值。

## OpenCode user-agent 覆盖

`llm-pi-ai` 适配器会在每个 provider 请求上强制盖上自己的归因 `user-agent`（`deepseek-harness/<版本> (+https://github.com/deepseek-ai/deepseek-harness)`），并删除 provider 配置的同名头，因此 `llm-pi-ai.providers.<route>.headers.user-agent` 不生效。本插件在匹配的 `llm/stream` 请求离开发送前的最后一层改写该 header——这也是唯一能存活的重写点。

与上面的生成器位于同一设置分区的 `opencodeSession.userAgent` 下配置，默认关闭。下面的 YAML 展示 `0.1.7` 之前版本读取的 namespace 形态：

```yaml
dsh-thinking-effort:
  opencodeSession:
    userAgent:
      value: "opencode/1.18.31 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14"
      providers:
        opencode-go:
          enabled: true              # 该路由全部模型
        sundrawnewapi-private:
          value: "opencode/1.18.31"  # 可选的路由级值
          models:
            mimo-v2.5-free: true     # 精确模型开关
```

| 字段 | 含义 |
| --- | --- |
| `userAgent.value` | 主值兼总开关。为空或缺失时全局不生效。 |
| `userAgent.providers.<route>.enabled` | `true` 表示该路由全部模型生效。 |
| `userAgent.providers.<route>.models.<model>` | `true` 表示仅该精确模型生效。 |
| `userAgent.providers.<route>.value` | 可选的路由级值；非空时优先于主值。 |

单个请求的解析顺序：路由先按 `enabled` 或精确模型开关命中，然后取非空的路由级 `value`，否则用主 `value`。未命中的请求保持 DSH 的归因 `user-agent`，只有你显式选中的路由受影响。自定义 provider 直接用其路由名作为 key，无需额外登记。该覆盖与上面的会话 Header 作用于同一请求、可以叠加；调用方显式提供的 `user-agent` 也会被覆盖——这正是该功能的目的（绕过适配器）。

修改 Host 或插件包后需重启 DSH；配置本身在设置变更时重新读取。

## 网关兼容设置

设置页的 provider 全局区域用于修改该 provider 下全部模型的 `compat` 默认值。展开单个模型后进入单模型区域。4 组字段默认收起。

| 分组 | boolean 字段（自动 / 支持 / 不支持） | enum 字段（自动 / 具体取值） |
| --- | --- | --- |
| 角色与推理 | `supportsDeveloperRole`、`supportsReasoningEffort`、`supportsThinkingTokenBudget` | — |
| 格式与输出 | `requiresThinkingAsText`、`requiresReasoningContentOnAssistantMessages` | `thinkingFormat`：`openai`、`openrouter`、`deepseek`、`together`、`baseten`、`zai`、`qwen`、`chat-template`、`qwen-chat-template`、`string-thinking`、`ant-ling`；`maxTokensField`：`max_tokens`、`max_completion_tokens` |
| 流式与工具 | `supportsUsageInStreaming`、`supportsFinishReason`、`requiresToolResultName`、`requiresAssistantAfterToolResult`、`supportsStrictMode` | — |
| 存储与缓存 | `supportsStore`、`supportsLongCacheRetention` | `cacheControlFormat`：`anthropic` |

协议支持还会在 DSH 版本和运行时 schema 的基础上进一步限制可配置字段：

| 路由 `api` | 本插件 15 个标量字段中支持的字段 |
| --- | --- |
| `openai-completions` | 全部 15 个字段 |
| `openai-responses`、`azure-openai-responses`、`openai-codex-responses` | `supportsDeveloperRole`、`supportsStrictMode`、`supportsLongCacheRetention` |
| `anthropic-messages` | `supportsLongCacheRetention` |
| `bedrock-converse-stream` | `supportsStrictMode` |

对于已识别的协议，列表之外的字段不会显示，也不会写入。如果路由没有可识别的 `api`，最终仍以运行时 schema 和 DSH 校验为准。

catalog 模型和 `models[]` 模型都支持编辑 compat：前者使用 `modelOverrides.<model>.compat`，后者使用 `models[].compat`。

```yaml
providers:
  qwen-gateway:
    compat:
      supportsDeveloperRole: false
      maxTokensField: max_tokens
    models:
      - id: qwen-plus
      - id: qwen-thinking
        compat:
          maxTokensField: max_completion_tokens
```

逐字段独立按以下顺序取值：model → provider → base/catalog → protocol。URL/hostname 不会作为 compat 来源。模型值只覆盖当前字段。「自动」（`Auto`）会删除当前层字段，恢复 provider 继承，并让继承链中的下一层生效。provider 默认值会应用到该路由的所有模型，模型级修改只影响当前模型。对同一路由（provider）而言，非空的 `models[]` 和非空的 `modelOverrides` 互斥；官方 schema 会拒绝该无效配置，插件遇到异常数据时 fail closed。

当前 DSH Settings API 不支持数组索引 path op。因此，`modelOverrides` 修改使用字段级 `set`/`unset`，只操作选中的字段；`models[]` 修改通过一个完整的 `providers.<route>.models` 数组 set 写回，并保留其他模型条目、未知字段和其他 compat 字段。运行时 schema 未暴露的字段不会显示。这些值只属于控制面配置，网络请求仍由外部 transport 负责。

### 快照导入信任模型

快照包含**能力配置**：推理强度、兼容开关，以及哪些模型启用会话 Header，可以安全地在不同机器之间迁移。导出时，文件还会原样包含**部署接线**：provider 的 `baseURL`、`apiKeyEnv`、`headers`，以及 `opencodeSession.format.script`。导入默认会扣留这些字段，避免他人提供的文件重定向请求、挂接其凭据名称、注入原始 Header，或指定供 Host 导入并执行的本地模块。但导出文件仍按原样保存每一个值，包括放在 `headers` 里的明文 token —— 分享前请先自行检查。

如果文件试图修改接线，预览会显示跳过了多少项，并提供「同时导入端点与凭据（高级）」选项。该选项每次导入都默认关闭，且不会记住上次选择。警告会列出每条受影响路由的目标端点，让你在同意前看清请求将发往哪里。

还原回滚副本或应用已保存方案也遵循同一规则。如果之前通过显式选择导入过接线、现在需要还原旧端点，请在该次预览中重新勾选此选项。

校验点：目标目录存在：

```bash
ls "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>"
```

## 1. 官方安装

安装最新版本：

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort
```

安装指定版本：

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.1
```

官方 CLI 会自动完成以下工作：

1. 将 `@hytime/dsh-thinking-effort` 写入 profile 依赖；
2. 更新 profile 的 pnpm lockfile；
3. 发现包中的 `dsh.bundle` 声明；
4. 将 `@hytime/dsh-thinking-effort` 加入 `dsh.profile.bundles`；
5. 让组合树加载 `thinking-effort` 条目。

不需要手工追加以下 YAML：

```yaml
- insert:
    - id: thinking-effort
      name: '@hytime/dsh-thinking-effort'
```

## 2. 升级

升级到 npm registry 中的最新版本：

```bash
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort
```

升级到指定版本：

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.1
```

升级后重新执行验证步骤。宿主侧代码需要重启 DSH；浏览器侧代码需要刷新 Web 页面。

## 3. 从旧包迁移

旧版本可能使用以下依赖：

```text
dsh-thinking-effort
github:hytime/dsh-thinking-effort
```

### 3.1 旧依赖仍存在

直接执行官方迁移命令：

```bash
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.1
```

### 3.2 旧依赖已被移除，但旧 bundle 残留

先检查组合配置：

```bash
dsh --profile <profile> --dump-default-config
```

如果输出中仍出现：

```yaml
name: dsh-thinking-effort
```

从旧 profile 的 lockfile 中找到旧 GitHub commit：

```bash
grep -n "dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/pnpm-lock.yaml"
```

然后使用官方命令恢复旧依赖、执行官方卸载，再安装新包：

```bash
dsh plugin --profile <profile> add github:hytime/dsh-thinking-effort#<old-commit>
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.1
```

这一步的目的不是继续使用旧插件，而是让官方 CLI 识别旧依赖并自动删除残留 bundle。不要手工把旧包名重新写入新的 bundle 列表。

## 4. 安装验证

### 4.1 检查依赖

```bash
grep -n "@hytime/dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
```

期望看到：

```text
@hytime/dsh-thinking-effort
```

确认旧依赖没有出现在 package manifest：

```bash
grep -n "dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
```

这个命令可能会因为新包名中包含 `dsh-thinking-effort` 而匹配到 scoped 包，这是正常的。需要确认没有独立的旧依赖键：

```json
"dsh-thinking-effort": "..."
```

### 4.2 日语和韩语支持状态

DSH `0.1.2-alpha.1` 及更高版本通过 `LocaleRuntime` 支持语言包注册外部 locale ID。本插件会动态注册 `ja` 和 `ko`，无需维护 DSH fork。只支持固定内置 locale ID 的旧版 DSH 仍只能使用 `zh` 和 `en`。


### 4.3 检查官方组合树

```bash
dsh --profile <profile> --dump-default-config
```

期望包含：

```yaml
# == @hytime/dsh-thinking-effort
- id: thinking-effort
  name: '@hytime/dsh-thinking-effort'
```

期望不包含：

```yaml
name: dsh-thinking-effort
```

如果 `dump-default-config` 失败，不能认为插件已经安装成功。

### 4.3 检查宿主加载

重启 DSH 后检查：

```bash
cat "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

成功加载后应看到包含 `apply` 或 `filled-N` 的事件标记。日志前缀为：

```text
[@hytime/dsh-thinking-effort]
```

### 4.4 检查浏览器侧

刷新 Web 页面（Cmd+R / F5），然后检查页面清单：

```bash
curl -s http://127.0.0.1:3080/ \
  | grep -o "dsh-thinking-effort[^\"]*" \
  | head -3
```

根据 DSH 版本，页面清单中可能包含运行时条目 `@hytime/dsh-thinking-effort`；浏览器 bundle 的请求路径也应使用 scoped 包名，例如 `/plugins/@hytime/dsh-thinking-effort/client.js`。该 bundle 内部必须以 `@hytime/dsh-thinking-effort` 作为 `__ModuleLoader__.load` 的注册 ID，宿主和客户端插件 `name` 也应使用同一个 scoped ID。浏览器侧最终加载的是新 npm 包中已构建的 `lib/client.js`。

## 5. 功能验证

1. **语言选择：** 在 DSH `0.1.2-alpha.1` 及更高版本中，设置页顶部可以选择中文、English、日本語和한국어。旧版只支持固定内置 locale ID 时仍只能选择中文和 English。默认优先使用 DSH 已保存的语言，其次使用浏览器语言，最后回退 English。
2. **宿主自动补齐：** 手工声明模型缺少 `reasoningEfforts` 时，设置中应出现 `off: null / high: high / max: max`。
3. **设置页：** Web 界面 → 设置 → 「模型能力与档位」。页面包含顶部语言选择器、「子 agent 默认档位」卡片、「一键设置」、模型搜索、供应商/模型列表、输入能力/上下文标识和单模型设置按钮，可以编辑模型档位和线上值。
4. **子 agent 思考强度：** 设置页配置后，`subagentEffort` 出现在本插件自己的设置分区（`0.1.7` 及以后为 Loader 条目 `thinking-effort`；`0.1.0-rc.7` 至 `0.1.6` 为 `llm-pi-ai` 用户层），未显式指定档位的子 agent 请求会使用它。
5. **未设置默认值：** 插件不会自动选择 `off`、`high` 或 `max`；请求不发送 `reasoning` 参数，由第三方网关决定默认行为。
6. **Composer：** Web 运行时提供 `modelDirectories` 服务时，会注册 Composer 的可选 `seat` 并显示推理档位滑块。

回到 Composer 并选择已经配置档位的模型。Web 运行时提供 `modelDirectories` 服务时，插件会注册 Composer 的可选 `seat`，显示离散推理档位滑块，并且只列出当前精确 `provider/model` 在宿主侧解析后的 `reasoning.efforts`。模型未声明 `defaultEffort` 时，面板会额外显示「跟随模型默认」；它清除会话的推理档位覆盖值，不会编辑插件 Settings。滑块使用宿主 `--dsw-*` `token`，自动跟随当前浅色或深色主题。

Composer `seat` 是可选能力。`modelDirectories` 服务不可用时不会注册，设置页仍通过探测到的新版或旧版 Settings 传输正常工作；插件不修改 DSH Composer 包。

宿主配置变更需要重启 DSH。修改 Client bundle、Settings 或 locale 后，刷新 Web 页面再检查 Composer 滑块。

## 6. 故障排查

| 现象 | 处理方式 |
| --- | --- |
| `dsh` 命令不存在 | 安装或启用 DSH 官方 CLI，不要改用普通 npm/pnpm 命令模拟 profile 安装 |
| `add` 成功但 `dump-default-config` 报旧包名 | 按「3.2 旧依赖已被移除，但旧 bundle 残留」恢复旧 commit 后执行官方 remove，再 add 新包 |
| 宿主没有加载 | 重启 DSH，检查 `thinking-effort-loaded.json` 和启动日志 |
| 设置页没有出现 | 重启 DSH 后刷新页面，检查浏览器 bundle 清单 |
| 写入档位失败 | 检查非 `off` 档位是否填写线上值 |
| 子 agent 报 `UNSUPPORTED_REASONING_EFFORT` | 改用目标模型支持的档位，或恢复为「提供方默认」 |

## 发布维护

维护者先更新 `package.json` 版本和所有适用的 `CHANGELOG`，提交这些变更，再创建匹配的 `v<version>` tag。tag 指向的提交必须位于 `main` 历史中。`publish.yml` workflow 不会自动修改版本或 CHANGELOG。

请为 npm 包配置 GitHub Trusted Publisher：仓库为 `hytime/dsh-thinking-effort`，workflow 为 `publish.yml`。发布使用 GitHub OIDC 和 provenance，命令为 `npm publish --provenance --access public`，不使用 `NPM_TOKEN` 或长期 token。如果 npm 中已存在相同版本，发布会被阻止。

发布前 workflow 会按 rc7 → rc2 → alpha2 → namespace → entry 顺序创建五个临时官方 DSH 能力代表 checkout，使用官方 `dsh plugin` 命令安装当前 tarball，再运行真实兼容测试：

- `dsh-v0.1.0-rc.7`（`0.1.0-rc.7`）——rc7 能力代表
- `dsh-v0.1.1-rc.2`（`0.1.1-rc.2`）——rc2 能力代表
- `dsh-v0.1.3-alpha.2`（`0.1.3-alpha.2`）——alpha2 能力代表
- `dsh-v0.1.6-alpha.1`（`0.1.6-alpha.1`）——最新的 namespace 模型能力代表（执行真实浏览器 DOM 探针）
- `dsh-v0.1.7-alpha.1`（`0.1.7-alpha.1`）——entry-config 能力代表（设置表单由各 Loader 条目自己的 `Config` 推导；同样执行真实浏览器 DOM 探针）

普通 CI 仍然只做测试，会在 Pull Request 和推送到 `main` 时运行。它使用 `npm ci`，依赖变更时请保持 `package-lock.json` 已提交。

## 7. 卸载

使用官方命令：

```bash
dsh plugin --profile <profile> remove @hytime/dsh-thinking-effort
rm -f "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

卸载后验证：

```bash
dsh --profile <profile> --dump-default-config
```

如果 profile 仍包含旧 bundle 条目，按「3.2」处理残留，不要直接猜测修改配置。
