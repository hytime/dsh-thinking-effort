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

### DSH Runtime 与 Gateway Protocol 兼容边界

这两类兼容彼此独立：

- **DSH Runtime：** Settings 传输在新版 DSH 中使用 `remote.settings`，在旧版 DSH 中使用 `connection.api.settings`。插件按运行时实际能力进行探测，旧版回退路径保持可选。
- **Gateway Protocol：** DSH schema 提供时，插件使用官方 `llm-pi-ai.compat` 字段 `supportsDeveloperRole` 和 `maxTokensField`。安装并启用可选的 `dsh-llm-openai-completions` transport 后，插件可以接管符合条件的自定义 OpenAI 兼容思考模型供应商。

version-map 按以下规则判断网关能力：

| DSH 范围 | Gateway compat 字段 | Takeover transport |
| --- | --- | --- |
| `0.1.0-rc.7` | 不支持 `supportsDeveloperRole` 和 `maxTokensField` | 不支持 |
| `0.1.0-rc.8` 及后续受支持范围 | DSH schema 暴露时支持这两个字段 | 可选 |

对于任一字段，`Auto` 都会取消用户覆盖并恢复官方协议默认值。可选 transport 未安装或未启用时，不会执行 takeover。

## 网关兼容设置

设置页的 provider 全局区域用于修改该 provider 下全部模型的 `compat` 默认值。展开单个模型后进入单模型区域。catalog 模型使用 `modelOverrides.<model>.compat`，自定义 YAML 路由使用模型条目的 `models[].compat`。

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

模型级 `compat` 会按字段逐字段覆盖 provider 默认值；模型层省略的字段继承 provider 值。`Auto` 会删除当前层字段，恢复从 provider 继承。同一个模型不能同时使用 `models[]` 与 `modelOverrides`；官方 schema 会拒绝这种无效组合，插件遇到异常数据时 fail closed。

当前 DSH Settings API 不支持数组 path op。因此，`models[]` 的 compat 只能通过 YAML 配置：设置页不渲染 `models[]` 的 compat 控件，不提供编辑，也不生成数组 mutation。运行时 schema 未暴露的字段同样不可编辑；旧版 DSH 仍可使用原有基础设置。

这些值只属于控制面配置。本插件不实现或替代网关 transport，网络请求仍由外部 transport 负责。

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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.13
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.13
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.13
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.13
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
4. **子 agent 思考强度：** 设置页配置后，`llm-pi-ai` 用户层出现 `subagentEffort`，未显式指定档位的子 agent 请求会使用它。
5. **未设置默认值：** 插件不会自动选择 `off`、`high` 或 `max`；请求不发送 `reasoning` 参数，由第三方网关决定默认行为。
6. **Composer：** 选择第三方模型后，模型选择器显示已声明的「推理等级」。

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

发布前 workflow 会为每个兼容范围创建一个临时官方 DSH 代表 checkout，使用官方 `dsh plugin` 命令安装当前 tarball，再运行真实兼容测试：

- `dsh-v0.1.2-alpha.3`（`0.1.2-alpha.3`）——modern 范围
- `dsh-v0.1.1-rc.2`（`0.1.1-rc.2`）——legacy 范围

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
