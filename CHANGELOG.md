# 更新日志 / Changelog

本文件记录 `@hytime/dsh-thinking-effort` 每个已发布版本的功能、修复和使用影响。

This file records the features, fixes, and user-facing impact of every published version of `@hytime/dsh-thinking-effort`.

版本号遵循 [Semantic Versioning](https://semver.org/)。

Versions follow [Semantic Versioning](https://semver.org/).

## [0.1.5] - 设置页版本信息与中英文支持 / Settings version and bilingual UI

### 新增 / Added

- 在插件设置页右下角增加低对比度版本水印，例如 `v0.1.5`。
- Add a low-contrast version watermark such as `v0.1.5` to the plugin settings page.
- 设置页支持中文和英文，默认优先使用 DSH 的持久化 locale，其次使用浏览器语言，最后回退中文；页面可以手动选择语言，选择会持久化。
- Add Chinese and English support with persisted DSH locale, browser-language detection, and Chinese fallback; the page provides a persistent language selector.
- 中英文语言文件分别维护在 `src/locales/zh.json` 和 `src/locales/en.json`，发布前生成到客户端 bundle。
- Maintain Chinese and English dictionaries separately in `src/locales/zh.json` and `src/locales/en.json`, then generate them into the client bundle before publishing.

### 修复 / Fixed

- 修复模型档位写入路径，避免使用数组下标路径导致 settings schema 校验失败。
- Fix model effort writes that used array-index paths and could fail settings schema validation.
- 按路由整体更新 `models` 和 `modelOverrides` 时保留未编辑的模型字段。
- Preserve untouched model fields when updating `models` and `modelOverrides` by route.
- 修复批量档位预设在多个路由之间互相覆盖的问题。
- Fix batch presets overwriting values across routes.
- 修复设置页刷新后子 agent 自定义线上值丢失的问题。
- Preserve custom subagent wire values after refreshing the settings page.
- 将子 agent 自定义线上值映射回当前模型支持的 DSH 标准档位。
- Map custom subagent wire values back to the DSH effort supported by the selected model.

### 兼容性 / Compatibility

- npm 包、浏览器 loader、宿主和客户端运行时 ID 统一为 `@hytime/dsh-thinking-effort`。
- The npm package, browser loader, host runtime, and client runtime use `@hytime/dsh-thinking-effort` consistently.
- Cordis 组合条目 ID 和设置页 Slot ID 继续使用 `thinking-effort`。
- The Cordis composition and settings Slot IDs remain `thinking-effort`.

### 文档 / Documentation

- 新增独立英文文档 `README.en.md` 和 `INSTALL.en.md`。
- Add standalone English documentation in `README.en.md` and `INSTALL.en.md`.
- 补充官方 DSH CLI 的安装、升级、卸载、旧包迁移和验证流程。
- Document official DSH CLI installation, upgrade, removal, old-package migration, and verification.

## [0.1.4] - 运行时 ID 统一与配置修复 / Runtime identity and configuration fixes

### 修复 / Fixed

- 修复模型档位写入、批量预设和子 agent 自定义映射问题。
- Fix model effort writes, batch presets, and custom subagent effort mapping.
- 修复 scoped client bundle 与 DSH loader 注册 ID 不一致的问题。
- Fix the mismatch between the scoped client bundle and the DSH loader registration ID.

### 文档 / Documentation

- 增加官方插件生命周期和旧包迁移说明。
- Add official plugin lifecycle and old-package migration documentation.

## [0.1.3] - 修复 scoped 浏览器 bundle 注册 / Scoped browser bundle registration

### 修复 / Fixed

- 将 `__ModuleLoader__.load` 的注册 ID 从旧的 `dsh-thinking-effort` 改为 `@hytime/dsh-thinking-effort`。
- Change the `__ModuleLoader__.load` registration ID from `dsh-thinking-effort` to `@hytime/dsh-thinking-effort`.
- 修复 scoped npm 包安装后 Web 页面加载插件失败的问题。
- Fix Web plugin loading after installing the scoped npm package.

### 测试 / Tests

- 增加浏览器 bundle 注册 ID 回归测试。
- Add a regression test for browser bundle registration.

## [0.1.2] - 切换 scoped npm 包 / Switch to the scoped npm package

### 变更 / Changed

- npm 包名切换为 `@hytime/dsh-thinking-effort`。
- Rename the npm package to `@hytime/dsh-thinking-effort`.
- `cordis.patch.yml` 的 bundle name 切换为 scoped 包名。
- Update the bundle name in `cordis.patch.yml` to the scoped package name.
- README 和 INSTALL 同步 scoped npm 安装、挂载和卸载命令。
- Update README and INSTALL with scoped npm installation, mounting, and removal commands.

## [0.1.1] - 首次公开发布准备 / First public release preparation

### 变更 / Changed

- 完善 npm 发布元数据，包括 repository、homepage、bugs 和 public access 配置。
- Complete npm publication metadata, including repository, homepage, bugs, and public access settings.
- 重新编写 README，补充使用场景、快速开始、限制和排查说明。
- Rewrite the README with use cases, quick start, limitations, and troubleshooting.
- 补充 GitHub 和 npm 安装入口。
- Add GitHub and npm installation paths.

## [0.1.0] - 初始版本 / Initial release

### 新增 / Added

- 宿主侧自动为缺少 `reasoningEfforts` 的第三方模型补充 `off`、`high`、`max` 默认档位。
- Add host-side `off`, `high`, and `max` defaults to third-party models without `reasoningEfforts`.
- 浏览器设置页支持按模型勾选档位并填写发送给网关的线上值。
- Add a browser settings page for per-model levels and gateway wire values.
- 支持将 DSH 标准档位映射为网关自定义值，例如 `high → ultra`。
- Map DSH levels to gateway-specific values such as `high → ultra`.
- 支持通过快捷预设批量应用档位。
- Add batch effort presets.
- 支持配置子 agent 默认思考强度。
- Add configurable default reasoning effort for subagents.
