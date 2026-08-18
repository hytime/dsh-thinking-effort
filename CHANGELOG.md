# 更新日志

本文件记录 `@hytime/dsh-thinking-effort` 每个已发布版本的功能、修复和使用影响。

版本号遵循 [Semantic Versioning](https://semver.org/)：

- `MAJOR`：不兼容的配置或运行时行为变更；
- `MINOR`：向后兼容的新功能；
- `PATCH`：向后兼容的修复、文档和发布元数据更新。

## [0.1.4] - 运行时 ID 统一与配置修复

### 新增

- 统一 npm 包、浏览器 loader、宿主运行时和客户端运行时使用的 ID：`@hytime/dsh-thinking-effort`。
- 保留 `thinking-effort` 作为 Cordis 组合条目和设置页 Slot 的内部 ID。
- 增加 loader ID 与 host/client runtime name 的回归测试。

### 修复

- 修复模型档位写入路径，避免使用数组下标路径导致 settings schema 校验失败。
- 按路由整体更新 `models` 和 `modelOverrides` 时保留未编辑的模型字段。
- 修复批量档位预设在多个路由之间互相覆盖的问题。
- 修复设置页刷新后子 agent 自定义线上值丢失的问题。
- 将子 agent 自定义线上值映射回当前模型支持的 DSH 标准档位，避免把 `ultra` 等网关值直接传给 DSH adapter。

### 文档

- 补充官方 DSH CLI 的安装、升级、卸载和旧包迁移流程。
- 补充 npm 包名、Cordis ID、Slot ID 和运行时 ID 的区别。

## [0.1.3] - 修复 scoped 浏览器 bundle 注册

### 修复

- 将 `__ModuleLoader__.load` 的注册 ID 从旧的 `dsh-thinking-effort` 改为 `@hytime/dsh-thinking-effort`。
- 修复 scoped npm 包安装后 Web 页面报「bundle loaded without registering scoped package name」的问题。

### 测试

- 增加浏览器 bundle 注册 ID 回归测试。

## [0.1.2] - 切换 scoped npm 包

### 变更

- npm 包名切换为 `@hytime/dsh-thinking-effort`。
- `cordis.patch.yml` 的 bundle name 切换为 `@hytime/dsh-thinking-effort`。
- README 和 INSTALL 同步 scoped npm 安装、挂载和卸载命令。

### 修复

- 修复 profile 使用新 npm 包时仍按旧无 scope 包名解析的问题。

## [0.1.1] - 首次公开发布准备

### 变更

- 完善 npm 发布元数据，包括 repository、homepage、bugs 和 public access 配置。
- 重新编写 README，补充「为什么使用」、适用场景、快速使用和限制说明。
- 补充 GitHub 安装入口和 npm 安装入口。
- 补充包内容检查和发布前验证流程。

## [0.1.0] - 初始版本

### 新增

- 宿主侧自动为缺少 `reasoningEfforts` 的第三方模型补充 `off`、`high`、`max` 默认档位。
- 不覆盖已有的模型自定义档位。
- 浏览器设置页支持按模型勾选档位并填写发送给网关的线上值。
- 支持将 DSH 标准档位映射为网关自定义值，例如 `high → ultra`。
- 支持通过快捷预设批量应用官方 DeepSeek 风格或通用档位组合。
- 支持配置子 agent 默认思考强度。
- 提供宿主自动补齐标记、日志前缀和完整安装排查文档。

[0.1.4]: https://github.com/hytime/dsh-thinking-effort/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/hytime/dsh-thinking-effort/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/hytime/dsh-thinking-effort/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/hytime/dsh-thinking-effort/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/hytime/dsh-thinking-effort/releases/tag/v0.1.0
