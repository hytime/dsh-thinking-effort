# dsh-thinking-effort

为 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 的 `llm-pi-ai` 第三方模型补充可配置的思考强度档位，并设置子 agent 的默认思考强度。

[![npm version](https://img.shields.io/npm/v/@hytime/dsh-thinking-effort)](https://www.npmjs.com/package/@hytime/dsh-thinking-effort)
[![npm downloads](https://img.shields.io/npm/dm/@hytime/dsh-thinking-effort)](https://www.npmjs.com/package/@hytime/dsh-thinking-effort)
[![GitHub license](https://img.shields.io/github/license/hytime/dsh-thinking-effort)](https://github.com/hytime/dsh-thinking-effort/blob/main/LICENSE)

## 为什么需要它？

DSH 的 `llm-pi-ai` 适配器允许你手工声明第三方模型，但这些模型通常没有 `reasoningEfforts` 配置。因此，Composer 的模型选择器不会显示「推理等级」，你也无法把网关实际支持的值（例如 `ultra`）映射到 DSH 的标准档位。

这个插件解决的是配置层问题：

- 自动为没有声明档位的第三方模型补上默认值，安装后即可在 Composer 中看到「推理等级」；
- 在设置页按模型自定义档位，并把 `high` 映射为网关需要的任意字符串，例如 `ultra`；
- 为子 agent 设置统一的默认思考强度，同时保留显式指定值的优先级；
- 不修改已经存在的用户自定义档位，避免覆盖现有配置。

## 适合谁？

如果你满足下面任一情况，这个插件通常值得安装：

- 通过 `llm-pi-ai` 手工接入了 OpenAI 兼容或其他第三方模型；
- 模型接口支持思考强度，但 DSH 的模型选择器没有显示对应选项；
- 不同网关使用不同的线上值，需要把 DSH 的 `high`、`max` 等档位映射为 `ultra`、`reasoning` 等字符串；
- 希望控制子 agent 的成本与响应质量，而不影响主 agent 的显式配置。

如果你只使用 DSH 内置模型，且 Composer 已经提供正确的推理等级，这个插件不是必需品。

## 功能概览

| 功能 | 作用 |
| --- | --- |
| 默认档位补齐 | 为缺少配置的模型添加 `off`、`high`、`max`，不覆盖已有自定义值 |
| 模型级编辑 | 在「设置 → 思考强度档位」中逐模型勾选档位并填写线上值 |
| 网关值映射 | 例如 DSH 选择 `high` 时，实际向网关发送 `ultra` |
| 子 agent 默认值 | 为未显式指定档位的子 agent 请求自动填入默认思考强度 |
| 快捷预设 | 一键应用官方 DeepSeek 风格或通用档位组合 |

## 安装

### 使用 npm 安装

```bash
npm install @hytime/dsh-thinking-effort
```

然后在目标 DSH profile 中挂载插件：

```yaml
# <DSH_HOME>/profiles/<profile>/cordis.patch.yml
- insert:
    - id: thinking-effort
      name: '@hytime/dsh-thinking-effort'
```

### 使用 DSH CLI 从 GitHub 安装

```bash
dsh plugin --profile <profile> add github:hytime/dsh-thinking-effort
```

npm / GitHub 安装后重启 DSH；浏览器侧刷新 Web 页面即可看到设置入口。完整的 profile 确认、安装授权、生效验证和故障排查步骤，请查看 [INSTALL.md](./INSTALL.md)。

## 快速使用

1. 打开 DSH 的「设置 → 思考强度档位」。
2. 在「子 agent 思考强度」卡片中选择提供方默认、标准档位或自定义值，然后点击「应用」。
3. 使用页面顶部的快捷预设，为全部第三方模型应用一组默认档位，或展开单个模型进行精细配置。
4. 勾选需要的标准档位，并填写发送给网关的线上值。例如：

   | DSH 档位 | 网关线上值 |
   | --- | --- |
   | `off` | 留空，表示不发送 |
   | `high` | `ultra` |
   | `max` | `max` |

5. 回到 Composer，选择对应模型后即可使用「推理等级」。

## 工作方式

- **宿主侧：** 插件读取 `llm-pi-ai` 设置，在启动和设置变更时扫描 `models` 与 `modelOverrides`，只为缺少 `reasoningEfforts` 的模型补充默认档位。
- **客户端：** 插件注册一个设置页，通过 DSH 标准设置 API 读取和写入配置，不引入额外后端服务。
- **子 agent：** 默认值存储在 `llm-pi-ai` 用户层的 `subagentEffort`；`agent/request` waterfall 只对未显式指定档位的子 agent 请求进行补全。

## 重要限制

- DSH 的 `llm-pi-ai` 适配器固定提供 7 个标准档位：`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`。插件不能增加第 8 个显示名称，但可以为每个档位填写任意线上值。
- 非 `off` 档位必须填写线上值；`off` 留空表示不发送该参数。
- 子 agent 使用的模型必须支持所选档位，否则网关可能返回 `UNSUPPORTED_REASONING_EFFORT`。
- 宿主逻辑修改需要重启 DSH；设置页修改通常只需刷新浏览器页面。

## 排查

- **设置页没有出现：** 刷新 Web 页面，确认 profile 的 bundle 清单包含 `dsh-thinking-effort`。
- **宿主没有补齐：** 重启 DSH，并检查 `$DSH_HOME/thinking-effort-loaded.json` 是否存在；日志前缀为 `[dsh-thinking-effort]`。
- **写入档位失败：** 检查非 `off` 档位是否填写了线上值，并确认目标模型配置仍然存在。
- **子 agent 报 `UNSUPPORTED_REASONING_EFFORT`：** 改用该模型支持的档位，或恢复为「提供方默认」。

## 卸载

```bash
dsh plugin --profile <profile> remove dsh-thinking-effort
rm -f "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

## 参与贡献

欢迎通过 [GitHub Issues](https://github.com/hytime/dsh-thinking-effort/issues) 报告问题，或提交 Pull Request。提交前请说明 DSH 版本、模型配置方式、网关支持的线上值和复现步骤。

## 许可证

[MIT](./LICENSE)
