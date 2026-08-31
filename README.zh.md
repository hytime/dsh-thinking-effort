# dsh-thinking-effort

为 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 的 `llm-pi-ai` 第三方模型补充可配置的思考强度档位，并设置子 agent 的默认思考强度。

[![npm version](https://img.shields.io/npm/v/@hytime/dsh-thinking-effort)](https://www.npmjs.com/package/@hytime/dsh-thinking-effort)
[![npm downloads](https://img.shields.io/npm/dm/@hytime/dsh-thinking-effort)](https://www.npmjs.com/package/@hytime/dsh-thinking-effort)
[![GitHub license](https://img.shields.io/github/license/hytime/dsh-thinking-effort)](https://github.com/hytime/dsh-thinking-effort/blob/main/LICENSE)

- [English README](./README.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [安装指南](./INSTALL.zh.md)
- [English installation guide](./INSTALL.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [版本更新日志](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

> **兼容性说明：** DSH `0.1.2-alpha.1` 及更高版本通过 `LocaleRuntime` 支持语言包注册外部 locale ID。本插件会动态注册 `ja` 和 `ko`，无需维护 DSH fork。只支持固定内置 locale ID 的旧版 DSH 仍只能使用 `zh` 和 `en`。
>
> 发布包的运行入口是 `lib/index.js`（Host）和 `lib/client.js`（Client）。修改 TypeScript 或 locale 源文件后，运行 `npm run build`，再启动 DSH 或打包插件。当前 DSH 没有公开的 semver metadata 契约，因此运行时能力探测是权威来源。只有显式 metadata 或测试输入提供时才使用可选版本；未知合法版本仍按实际能力运行。插件同时支持新版 `remote.settings` 和旧版 `connection.api.settings`。

## 为什么需要它？

DSH 的 `llm-pi-ai` 适配器允许你手工声明第三方模型，但这些模型通常没有 `reasoningEfforts` 配置。因此，Composer 的模型选择器不会显示「推理等级」，你也无法把网关实际支持的值（例如 `ultra`）映射到 DSH 的标准档位。

这个插件解决的是配置层问题：

- 自动为没有声明档位的第三方模型补上默认选项，安装后即可在 Composer 中看到「推理等级」；
- 在设置页按模型自定义档位，并把 `high` 映射为网关需要的任意字符串，例如 `ultra`；
- 为子 agent 设置统一的默认思考强度，同时保留显式指定值的优先级；
- 子 agent 的自定义线上值会按实际模型的 `reasoningEfforts` 映射回标准档位，找不到映射时不会注入非法档位；
- 不修改已经存在的用户自定义档位，避免覆盖现有配置。

## 适合谁？

如果你满足下面任一情况，这个插件通常值得安装：

- 通过 `llm-pi-ai` 手工接入了 OpenAI 兼容或其他第三方模型；
- 模型接口支持思考强度，但 DSH 的模型选择器没有显示对应选项；
- 不同网关使用不同的线上值，需要把 DSH 的 `high`、`max` 等档位映射为 `ultra`、`reasoning` 等字符串；
- 希望控制子 agent 的成本与响应质量，而不影响主 agent 的显式配置。

如果你只使用 DSH 内置模型，且 Composer 已经提供正确的推理等级，这个插件不是必需品。

## 标识说明

这几个名称职责不同，请不要混用：

| 名称 | 用途 |
| --- | --- |
| `@hytime/dsh-thinking-effort` | npm 包名、浏览器 bundle 请求路径、模块加载器注册 ID 和宿主/客户端运行时 ID，安装、升级和卸载时使用 |
| `thinking-effort` | Cordis 组合条目 ID 和设置页 Slot ID |

## 功能概览

| 功能 | 作用 |
| --- | --- |
| 默认档位补齐 | 为缺少配置的模型添加 `off`、`high`、`max`，不覆盖已有自定义值 |
| 模型级编辑 | 在「设置 → 模型能力与档位」中逐模型勾选档位并填写线上值 |
| 网关值映射 | 例如 DSH 选择 `high` 时，实际向网关发送 `ultra` |
| 子 agent 默认值 | 为未显式指定档位的子 agent 请求自动填入默认思考强度 |
| 快捷预设 | 一键应用官方 DeepSeek 风格或通用档位组合 |
| 多语言设置 | 已包含中文、English、日本語和한국어字典；日语/韩语切换使用 DSH 的语言包支持 |

## 安装、升级与卸载

DSH 插件必须通过官方 `dsh plugin` 命令安装。普通 `npm install` 只会把包放入当前 Node.js 项目，不能替代 DSH profile 的依赖和 bundle 注册；也不要手工编辑 profile 的 `package.json`。

### 1. 确认 profile

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
ls "${DSH_HOME:-$HOME/.dsh}/profiles"
dsh --version
```

将正在运行的 profile 名称替换下面命令中的 `<profile>`，例如 `web`。

### 2. 安装最新版本

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort
```

安装指定版本：

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.11
```

官方 CLI 会同时更新 profile 依赖、锁文件和 `dsh.profile.bundles`，无需手工追加 YAML。

### 3. 升级

```bash
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort
```

### 4. 卸载

```bash
dsh plugin --profile <profile> remove @hytime/dsh-thinking-effort
rm -f "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

宿主侧改动需要重启 DSH；浏览器侧刷新 Web 页面。

完整的迁移、验证和排查步骤请查看 [INSTALL.md](./INSTALL.md)。

## 从旧包迁移

旧版本可能使用以下依赖：

```text
dsh-thinking-effort
github:hytime/dsh-thinking-effort
```

如果旧依赖仍然存在，使用官方命令迁移：

```bash
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.11
```

如果旧依赖已经被其他工具移除，但 profile 的 bundle 列表仍残留旧名称，先从旧 profile 的 `pnpm-lock.yaml` 找到旧 GitHub commit，再使用官方命令恢复并移除：

```bash
dsh plugin --profile <profile> add github:hytime/dsh-thinking-effort#<old-commit>
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.11
```

不要把 `dsh-thinking-effort` 添加到新的 `dsh.profile.bundles` 中。

## 快速使用

1. 打开 DSH「设置 → 模型能力与档位」。
2. 使用页面顶部的「页面语言」选择中文、English、日本語或한국어。DSH 默认优先使用已保存的语言，其次使用浏览器语言，最后回退 English；选择会持久化到 DSH。
3. 在「子 agent 默认档位」卡片中选择没有显式值时使用的默认档位，然后点击「应用」。
4. 使用「一键设置」将官方 DeepSeek 风格或通用预设应用到全部模型，或展开供应商和模型进行详细配置。
5. 使用搜索框按模型名称或 ID 筛选。模型行会显示文字/图像输入能力、已声明的上下文长度，以及打开单模型设置的按钮。
6. 勾选需要的标准档位，并填写发送给网关的线上值。例如：

   | DSH 档位 | 网关线上值 |
   | --- | --- |
   | `off` | 留空，表示不发送 |
   | `high` | `ultra` |
   | `max` | `max` |

7. 回到 Composer，选择对应模型后即可使用「推理等级」。

设置页右下角会显示当前安装版本，例如 `v0.1.11`。

### 设置页界面

页面顶部是语言选择器；其下方的「子 agent 默认档位」卡片控制没有显式档位的请求。「一键设置」负责批量应用预设。供应商和模型列表支持展开/收起；每个模型行显示输入能力、上下文长度和设置按钮，进入后可编辑思考档位及网关线上值。

![中文模型能力与档位设置页](https://raw.githubusercontent.com/hytime/dsh-thinking-effort/main/docs/assets/settings-model-capabilities-zh.png)


## 工作方式

- **宿主侧：** 插件读取 `llm-pi-ai` 设置，在启动和设置变更时扫描 `models` 与 `modelOverrides`，只为缺少 `reasoningEfforts` 的模型补充默认档位。
- **客户端：** 通过 DSH Settings Remote（`ctx.remote.settings`）注册设置页，并使用 DSH 官方 locale 服务切换和持久化中文、English、日本語、한국어。四种文案分别维护在 `src/locales/zh.json`、`src/locales/en.json`、`src/locales/ja.json` 和 `src/locales/ko.json`，发布前生成到客户端 bundle。
- **子 agent：** 默认值存储在 `llm-pi-ai` 用户层的 `subagentEffort`；`agent/request` waterfall 只对未显式指定档位的子 agent 请求进行补全。
- **版本信息：** 设置页右下角显示当前安装版本，例如 `v0.1.11`；DSH 插件列表从已安装包的 `package.json.version` 读取同一版本。

## 安装验证

```bash
grep -n "@hytime/dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
dsh --profile <profile> --dump-default-config
```

组合树应包含：

```yaml
- id: thinking-effort
  name: '@hytime/dsh-thinking-effort'
```

且不应再包含：

```yaml
name: dsh-thinking-effort
```

宿主加载标记位于：

```bash
cat "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

## 重要限制

- DSH 的 `llm-pi-ai` 适配器固定提供 7 个标准档位：`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`。插件不能增加第 8 个显示名称，但可以为每个档位填写任意线上值。
- 非 `off` 档位必须填写线上值；`off` 留空表示不发送该参数。
- 子 agent 使用的模型必须支持所选档位，否则网关可能返回 `UNSUPPORTED_REASONING_EFFORT`。
- `off` 和未设置都可能表现为不发送 `reasoning` 参数，是否真正关闭思考取决于第三方网关的协议语义。
- 宿主逻辑修改需要重启 DSH；设置页修改通常只需刷新浏览器页面。

## CI 与发布维护

- Pull Request 和推送到 `main` 会在 Node `22.19.0` 与 `24.x` 上运行质量矩阵。
- workflow 使用 `npm ci`；依赖变更时，维护者必须提交 `package-lock.json`。
- 普通 CI workflow 不会发布 npm。发布只由版本 tag workflow 触发。

## 排查

- **官方组合配置失败：** 执行 `dsh --profile <profile> --dump-default-config`，检查是否仍有旧的 `name: dsh-thinking-effort`。
- **设置页没有出现：** 重启 DSH 后刷新 Web 页面，确认 profile 的 bundle 清单包含 `@hytime/dsh-thinking-effort`。
- **宿主没有补齐：** 检查 `$DSH_HOME/thinking-effort-loaded.json` 是否存在；日志前缀为 `[@hytime/dsh-thinking-effort]`。
- **写入档位失败：** 检查非 `off` 档位是否填写了线上值，并确认目标模型配置仍然存在。
- **子 agent 报 `UNSUPPORTED_REASONING_EFFORT`：** 改用该模型支持的档位，或恢复为「提供方默认」。

## 许可证

[MIT](./LICENSE)
