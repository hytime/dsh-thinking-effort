# 更新日志 / Changelog

- [English / 中文](./CHANGELOG.md)
- [日本語](./CHANGELOG.ja.md)
- [한국어](./CHANGELOG.ko.md)

本文件记录 `@hytime/dsh-thinking-effort` 每个已发布版本的功能、修复和使用影响。

This file records the features, fixes, and user-facing impact of every published version of `@hytime/dsh-thinking-effort`.

版本号遵循 [Semantic Versioning](https://semver.org/)。

Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 未发布 / Unreleased

### 新增 / Added

- 新增：网关兼容性支持常用标量字段（`supportsStore`、`thinkingFormat`、`supportsThinkingTokenBudget` 等）的独立配置与自动继承，并按语义分组默认收起。
- Add independent configuration and automatic inheritance for common scalar gateway compatibility fields such as `supportsStore`, `thinkingFormat`, and `supportsThinkingTokenBudget`, grouped by meaning and collapsed by default.

## [0.1.14] - 网关能力映射与可选 takeover / Gateway capability mapping and optional takeover

### 发布兼容矩阵 / Release compatibility matrix

| 顺序 / Order | 官方 DSH 代表 / Official representative | 版本 / Version |
| --- | --- | --- |
| 1 | `dsh-v0.1.0-rc.7` | `0.1.0-rc.7` |
| 2 | `dsh-v0.1.1-rc.2` | `0.1.1-rc.2` |
| 3 | `dsh-v0.1.2-alpha.3` | `0.1.2-alpha.3` |

### 变更 / Changed

- 统一 `version-map.ts` 对 DSH Runtime transport、Gateway compat 字段和 takeover transport 的能力映射，并明确 rc7 不支持 `supportsDeveloperRole`/`maxTokensField`、rc8+ 支持。
- Unify capability mapping for DSH Runtime transports, Gateway compat fields, and takeover transport in `version-map.ts`; rc7 does not support `supportsDeveloperRole`/`maxTokensField`, while rc8+ does.
- 新增 rc7、rc2 和 alpha3 三个能力组合代表的独立加载与真实兼容性验证。
- Add independent loading and real compatibility checks for the rc7, rc2, and alpha3 capability-composition representatives.
- 支持可选的 `dsh-llm-openai-completions` takeover：仅在运行时支持 Gateway compat、目标供应商为自定义 OpenAI 兼容思考网关且 transport 已启用时生效。
- Support optional `dsh-llm-openai-completions` takeover only when the runtime supports Gateway compat, the target provider is a custom OpenAI-compatible thinking gateway, and the transport is enabled.
- Runtime capability detection is authoritative; optional version metadata never overrides detected runtime capabilities.
- 新增 provider 全局 `compat` 默认值和单模型覆盖：catalog 模型使用 `modelOverrides.<model>.compat`，`models[]` 模型使用 `models[].compat`。模型层只覆盖写出的字段，`Auto` 删除当前层字段并恢复 provider 继承；对同一路由（provider）而言，只要同时存在非空的 `models[]` 和非空的 `modelOverrides`，配置就无效，官方 schema 会拒绝该配置，插件对异常数据 fail closed。catalog/modelOverrides 与 `models[]` 两种模型形式都支持设置页单模型编辑；`models[]` 保存使用一个完整的 `providers.<route>.models` 数组 set，保留其他模型、未知字段和其他 compat 字段，不使用数组索引 path op。
- Add provider-wide `compat` defaults and per-model overrides: catalog models use `modelOverrides.<model>.compat`, while `models[]` entries use `models[].compat`. Model fields override the provider field-by-field, and `Auto` deletes the current-layer field to restore provider inheritance; for a given route/provider, any non-empty `models[]` together with any non-empty `modelOverrides` is invalid. The official schema rejects this configuration, and the plugin fails closed for malformed data. Both catalog/modelOverrides and `models[]` models support single-model editing in Settings; `models[]` saves use one complete `providers.<route>.models` array set that preserves other models, unknown fields, and other compat fields instead of an array-index path operation.
- 这些 compat 值只负责控制面配置，不实现外部 transport。
- These compat values configure the control plane only; the plugin does not implement external transport.

## [0.1.13] - 按兼容范围验证 / Range-based compatibility verification

### 变更 / Changed

- 将兼容层的版本诊断从逐版本枚举改为范围判断，并让发布 workflow 每个兼容范围只选择一个官方代表版本。
- Replace per-release compatibility enumeration with range-based version diagnostics, and make the release workflow select one official representative per compatibility range.

## [0.1.12] - 官方 alpha.3 兼容验证 / Official alpha.3 compatibility verification

### 变更 / Changed

- 将官方 DSH 兼容验证基线更新至 `dsh-v0.1.2-alpha.3`，并修正旧版 rc7 标签为官方实际的 `dsh-v0.1.0-rc.7`；Host/Client 运行逻辑保持不变。
- Update the official DSH compatibility baseline to `dsh-v0.1.2-alpha.3` and correct the legacy rc7 tag to the actual official `dsh-v0.1.0-rc.7`; Host and Client runtime behavior is unchanged.

## [0.1.11] - TypeScript 构建迁移与跨版本兼容 / TypeScript build migration and cross-version compatibility

### 变更 / Changed

- 将 Host 和 Client 运行时代码迁移到 TypeScript，并发布构建后的 `lib/index.js`、`lib/client.js` 及声明文件；行为和设置数据格式保持兼容。
- Migrate Host and Client runtime code to TypeScript and publish the built `lib/index.js`, `lib/client.js`, and declaration files; behavior and settings data formats remain compatible.
- 兼容适配器支持显式版本 metadata 或测试输入，但当前 DSH 没有公开的 semver metadata 契约，运行时能力探测是权威来源；未知合法版本按实际能力继续运行。新版 `remote.settings` 和旧版 `connection.api.settings` 均受支持。
- Runtime capability detection is authoritative because current DSH does not expose a public semver metadata contract; an optional version is used only when explicit metadata or test input supplies it. Unknown valid versions use the detected capabilities, and both modern `remote.settings` and legacy `connection.api.settings` are supported.
- 未知版本在所需能力满足时继续运行；能力不足时保持不可用，并继续隐藏不受支持的 `ja/ko` locale 选项。
- Unknown versions continue when required capabilities are present; otherwise the related feature remains unavailable, including hiding unsupported `ja/ko` locale options.


### 修复 / Fixed

- 客户端顶层只硬注入跨版本稳定服务（`slots`、`connection`、`locale`）；新版通过可选 Remote 服务探测（使用 `ctx.get` 并监听 `internal/service`）获取 Settings service，旧版继续回退 `connection.api.settings`。
- The client hard-injects only cross-version stable services (`slots`, `connection`, and `locale`); newer DSH hosts discover the optional Remote Settings service through `ctx.get` and `internal/service`, while older hosts continue using the `connection.api.settings` fallback.
- 没有 Remote provider 的旧版不会因可选 Remote 探测进入 pending。
- Older profiles without a Remote provider do not enter pending because Remote discovery is optional.
- 旧版 DSH 没有外部 locale catalog 时，设置页现在隐藏不可用的 `ja/ko` 选项，避免点击后触发未注册错误。
- On older DSH builds without an external locale catalog, the settings page now hides unavailable `ja/ko` options instead of allowing an unregistered-locale error.

## [0.1.9] - 兼容新版 DSH Remote / Support current DSH Remotes

### 修复 / Fixed

- 适配 DSH `0.1.2-alpha.1` 的 `ctx.remote.settings`，并保留旧版 `connection.api.settings` 回退。
- Adapt to DSH `0.1.2-alpha.1` `ctx.remote.settings` while retaining a legacy `connection.api.settings` fallback.
- 统一新版直接 `ClientResult` 与旧版 RPC 包装响应的读取和写入处理。
- Normalize current direct `ClientResult` responses and legacy RPC-wrapped settings responses.
- 更新日语和韩语 locale 说明，反映 DSH language-pack 动态注册支持。
- Update Japanese and Korean locale documentation for DSH language-pack registration.

## [0.1.8] - 修复子 agent 默认档位注入 / Fix subagent default effort injection

### 修复 / Fixed

- 修复 `agent/request` 未使用全局监听，导致子 agent 请求无法被插件处理。
- Fix the missing global `agent/request` listener that prevented the plugin from handling subagent requests.
- 修复 `llm-pi-ai` 设置命名空间延迟注册时 `subagentEffort` 缓存为空的问题。
- Read the current `subagentEffort` at request time so delayed namespace registration and later settings changes take effect.
- 新增 Host 侧回归测试，覆盖全局监听和实时配置读取。
- Add Host regression tests for global event registration and live settings reads.

## [0.1.7] - 日语和韩语本地化 / Japanese and Korean localization

### 新增 / Added

- 设置页新增 `日本語` 和 `한국어`，并继续支持中文与 English。
- Add Japanese and Korean settings-page localization while retaining Chinese and English.
- 四份语言字典统一由构建脚本校验并生成到客户端 bundle。
- Validate and generate all four locale dictionaries into the client bundle.
- 新增日语和韩语 README、INSTALL、CHANGELOG 文档，并提供四语言互链。
- Add Japanese and Korean README, INSTALL, and CHANGELOG documents with links across all four languages.

### 兼容性 / Compatibility

- 版本升级到 `0.1.7`，设置页版本水印同步显示 `v0.1.7`。
- Bump the package to `0.1.7`; the settings-page watermark shows `v0.1.7`.
- Host 行为、Cordis 组合条目 `thinking-effort`、设置 Slot ID 和运行时 ID 保持不变。
- Host behavior, the `thinking-effort` Cordis composition and settings Slot IDs, and runtime IDs remain unchanged.
- 日语和韩语切换需要 DSH 核心支持全局 locale ID；当前原版 DSH 中这两个选择项暂不可用。
- Japanese and Korean switching requires DSH core global locale IDs; the two entries are not usable on current stock DSH.



### 变更 / Changed

- `README.md` 和 `INSTALL.md` 现在是默认英文文档入口。
- `README.md` and `INSTALL.md` are now the default English documentation entrypoints.
- 中文文档分别移动到 `README.zh.md` 和 `INSTALL.zh.md`，并通过链接手动切换。
- Chinese documentation is provided as `README.zh.md` and `INSTALL.zh.md`, with explicit links for manual switching.
- npm 包文件白名单同步新的文档文件名。
- Update the npm package file list for the renamed documentation files.

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

- README.md 和 INSTALL.md 现在作为英文主文档，中文版本分别为 `README.zh.md` 和 `INSTALL.zh.md`。
- `README.md` and `INSTALL.md` are now the primary English documents; Chinese versions are `README.zh.md` and `INSTALL.zh.md`.
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
