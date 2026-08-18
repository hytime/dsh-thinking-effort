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

客户端 bundle 在 `src/client.js` 中维护与 `package.json.version` 同步的版本常量。设置页根容器底部增加版本水印，文本格式为 `v0.1.4`。水印采用低对比度样式、绝对定位和 `pointerEvents: none`，不参与交互，不覆盖页面内容；根容器需要具备足够的定位上下文和底部空间。

插件列表不额外硬编码版本。DSH 官方插件列表从已安装包的 `package.json.version` 读取版本，因此发布新版本时只需递增 `package.json`，并同步客户端版本常量、CHANGELOG 和安装文档中的固定版本示例。

## 数据流

```text
package.json.version
        ├── npm 发布版本
        ├── DSH 插件列表版本
        └── src/client.js 版本常量 → 设置页右下角水印
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

版本展示失败不能阻止设置页加载；版本文本是静态构建信息，不依赖网络或 settings API。安装和升级仍然使用官方 `dsh plugin` 命令，运行时 ID 使用 `@hytime/dsh-thinking-effort`，内部 Cordis/Slot ID 继续使用 `thinking-effort`。
