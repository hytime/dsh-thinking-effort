# dsh-pi-effort

DSH（DeepSeek Harness）第三方模型思考强度档位插件。

解决「第三方（pi-ai 手工声明）模型无法设置思考强度」的问题：为 `llm-pi-ai`
设置中手工声明的模型声明 `reasoningEfforts`，让 composer 的模型选择器出现
「推理等级」入口，并可在设置页逐模型自定义档位与线上值。

双面插件（一个包同时提供宿主与浏览器能力）：

| 半区 | 能力 |
| --- | --- |
| 宿主（`src/host.mjs`） | 启动时 + 设置变更时，给缺少 `reasoningEfforts` 的模型自动补默认档位（Off / High / Max，官方 DeepSeek 风格）；不覆盖用户自定义 |
| 浏览器（`src/client.js`） | 设置页新增「思考强度档位」页面：按路由列出模型，逐模型勾选档位、自由填写发送给网关的线上值（如 `ultra`），一键应用到全部 / 恢复默认 |

## 安装

```bash
# 本地目录
dsh plugin --profile <profile> add ./dsh-pi-effort

# 或直接从 GitHub 安装
dsh plugin --profile <profile> add github:hytime/dsh-pi-effort
```

> 从 git 安装需授权构建（本插件为纯手写 bundle、无构建步骤，授权时把
> pnpm 打印的包键写入该 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds`）。

安装后重启 DSH（或等待组合热加载）：
- 已有/新增的手工声明第三方模型自动获得默认档位；
- 设置 → 思考强度档位 页面出现，可自定义。

## 使用

1. 打开 **设置 → 思考强度档位**（位于「模型」与「插件」之间）。
2. 顶部两个快捷方案：**应用到全部：Off / High / Max（官方 DeepSeek 风格）**、
   **应用到全部：Off / Low / Medium / High（通用）**。
3. 展开某个模型 → 勾选档位（`off / minimal / low / medium / high / xhigh / max`），
   右侧输入框自由填写**发送给网关的线上值**（如给 `high` 填 `ultra`，composer
   选中 High 时网关收到 `ultra`）→ 点「应用此档位」。
4. composer 选择该模型后，「推理等级」里出现已声明档位。

## 说明与限制

- 档位**名称**由 DSH 的 `llm-pi-ai` 适配器固定为 7 个标准档位
  （schema 门控 `z.union(THINKING_LEVELS)`），插件无法增加第 8 个选项名；
  但每个档位**发送给网关的值完全自由**，可填任意字符串。
- `off` 留空表示「支持关闭，不发送」（由提供方决定）；给 `off` 填值则发送该值。
- 未设置档位的模型自动采用默认档位（Off / High / Max）；自定义优先。

## 工作原理

- **宿主**：监听 `llm-pi-ai` 设置的 `settings/updated`，对缺 `reasoningEfforts`
  的模型写入默认档位（幂等，不覆盖已有声明）。
- **浏览器**：通过标准 API client（`connection.api.settings` 的
  `describe` / `mutate`）读写设置，注册 `settings.section` 插槽
  （id `thinking-effort`），无自定义 remote、零构建（手写
  `__ModuleLoader__.load` bundle）。

## 调试

- 宿主加载/补齐会在 `$DSH_HOME/pi-effort-loaded.json` 写标记
  （`apply` / `filled-N`）。
- 宿主日志前缀 `[pi-effort]`。

## License

MIT
