# 安装指南（官方 DSH CLI）

本指南只使用 DSH 官方 `dsh plugin` 命令管理插件。命令会在目标 profile 中安装依赖，并自动同步 `dsh.profile.bundles`；不要用普通 `npm install`、profile 目录下的直接 `pnpm add` 或手工编辑 profile 配置替代它。

- [English installation guide](./INSTALL.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [English README](./README.md)
- [中文 README](./README.zh.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.8
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.8
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.8
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.8
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

插件已经包含 `ja` 和 `ko` 字典，但当前官方 DSH 的 `LocaleRuntime` 只公开 `zh` 和 `en`。在原版 DSH 中选择日语或韩语会失败，并提示 `locale "<id>" is not registered`。

在官方支持发布前，如需使用这两种语言，可以维护 DSH fork 并修改：

- `packages/client/locale/src/locale-settings.ts`：将 `ja` 和 `ko` 加入 `LOCALE_IDS`，Host preference schema 会从该列表派生。
- `packages/client/locale/src/client/index.ts`：在 `LOCALES` 中加入 `{ id: 'ja', label: '日本語' }` 和 `{ id: 'ko', label: '한국어' }`。
- 补充对应的核心字典和测试，然后重新构建并运行 fork 版 DSH。

仅修改本插件无法扩展 DSH 的全局 locale 列表。请遵循 fork 版本自身的构建说明，并继续使用官方 profile 命令；不要手工编辑 profile manifest。

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

根据 DSH 版本，页面清单中可能包含运行时条目 `@hytime/dsh-thinking-effort`；浏览器 bundle 的请求路径也应使用 scoped 包名，例如 `/plugins/@hytime/dsh-thinking-effort/client.js`。该 bundle 内部必须以 `@hytime/dsh-thinking-effort` 作为 `__ModuleLoader__.load` 的注册 ID，宿主和客户端插件 `name` 也应使用同一个 scoped ID。浏览器侧最终加载的是新 npm 包中的 `src/client.js`。

## 5. 功能验证

1. **语言选择：** 原版 DSH 设置页顶部只能选择中文和 English；日本語、한국어需要先完成上方所述的 DSH 核心 locale 修改。默认优先使用 DSH 已保存的语言，其次使用浏览器语言，最后回退中文。
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
