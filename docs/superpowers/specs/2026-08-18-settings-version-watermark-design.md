# 设置页版本信息设计

## 目标

在 `@hytime/dsh-thinking-effort` 的设置页右下角显示当前插件版本，并确保 DSH 插件列表使用 npm 包元数据展示版本。

## 范围

- 只修改插件自己的「思考强度档位」设置页；
- 不修改 DSH 其他设置页面；
- 不修改 Cordis 组合条目 ID `thinking-effort`；
- 不修改设置页 Slot ID `thinking-effort`；
- 不改变模型档位、子 agent 或 settings API 行为。

## 实现

在 `src/client.js` 中注册插件自己的 locale namespace（例如 `settings.thinkingEffort`），提供完整的 `zh` 和 `en` 字典，并通过 DSH `locale` 服务绑定翻译函数。设置页注册声明该 locale namespace，语言切换时由 Slot 渲染机制自动重新渲染。标题、说明、按钮、提示、错误、档位标签、搜索占位符、空状态、路由标签和版本水印的无障碍标签都必须使用字典；模型名称、路由名、网关线上值、标准档位 ID 和版本号保持原始值。

插件列表不额外硬编码版本。DSH 官方插件列表从已安装包的 `package.json.version` 读取版本，因此发布新版本时只需递增 `package.json`，并同步客户端版本常量、CHANGELOG 和安装文档中的固定版本示例。

## 多语言

插件设置页支持中文和英文，使用 DSH 当前 locale 自动切换。插件在 `settings.thinkingEffort` namespace 注册 `zh` 和 `en` 两份完整字典，并将 Slot 注册声明为该 namespace。所有插件自有 UI 文案都必须来自字典：标题、说明、按钮、提示、错误、档位标签、搜索框、空状态、路由标题、展开计数和版本水印的无障碍标签。模型名称、路由名、网关线上值、标准档位 ID 和版本号不翻译。切换语言时，已加载的页面重新渲染；未提供 locale 服务时插件不应伪造英文，依赖由 DSH 官方 Web 组合提供。
## 数据流

```text
package.json.version
        ├── npm 发布版本
        ├── DSH 插件列表版本
        └── src/client.js 版本常量 → 设置页右下角水印

DSH locale 服务
        └── settings.thinkingEffort 的 zh/en 字典 → 设置页文案和语言切换
```

版本常量与包版本不一致时，发布前测试必须失败或静态检查必须报告，避免设置页显示错误版本。

## 验证

- 测试客户端 bundle 仍注册 `@hytime/dsh-thinking-effort`；
- 测试或静态检查确认水印版本与 `package.json.version` 一致；
- 运行 `npm test`；
- 运行 `node --check src/host.mjs` 和 `node --check src/client.js`；
- 运行 `npm pack --dry-run`，确认 `README.md`、`CHANGELOG.md` 和源码包含在包内；
- 使用官方 DSH CLI 安装后确认 profile 使用当前 npm 版本。

## 错误处理与兼容性

版本展示失败不能阻止设置页加载；版本文本是静态构建信息，不依赖网络或 settings API。缺失翻译键显示键名而不是空白，zh/en 字典必须在注册前完整提供。官方 Web 组合必须提供 `locale` 服务；服务缺失时插件保持依赖等待状态，不伪造英文或注册半成品设置页。安装和升级仍然使用官方 `dsh plugin` 命令，运行时 ID 使用 `@hytime/dsh-thinking-effort`，内部 Cordis/Slot ID 继续使用 `thinking-effort`。
