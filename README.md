# dsh-thinking-effort

A [DSH (DeepSeek Harness)](https://github.com/deepseek-ai/deepseek-harness) plugin that adds configurable reasoning effort levels to hand-declared `llm-pi-ai` models and sets a default reasoning effort for subagents.

[![npm version](https://img.shields.io/npm/v/@hytime/dsh-thinking-effort)](https://www.npmjs.com/package/@hytime/dsh-thinking-effort)
[![npm downloads](https://img.shields.io/npm/dm/@hytime/dsh-thinking-effort)](https://www.npmjs.com/package/@hytime/dsh-thinking-effort)
[![GitHub license](https://img.shields.io/github/license/hytime/dsh-thinking-effort)](https://github.com/hytime/dsh-thinking-effort/blob/main/LICENSE)

- [中文 README](./README.zh.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
- [Installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

## Why use it?

The `llm-pi-ai` adapter supports hand-declared third-party models, but those entries often do not declare `reasoningEfforts`. As a result, Composer does not show a reasoning effort selector, and gateway-specific values such as `ultra` cannot be mapped to DSH's standard levels.

This plugin provides the configuration layer needed to:

- Add default `off`, `high`, and `max` options to models without a declaration;
- Configure reasoning levels per model from the DSH settings page;
- Map a DSH level such as `high` to a gateway value such as `ultra`;
- Set a default reasoning effort for subagents while preserving explicit request values;
- Keep existing user-defined model declarations unchanged.

The plugin is usually unnecessary when you only use built-in DSH models and their reasoning controls already work.

## Identifiers

These identifiers have different responsibilities:

| Identifier | Purpose |
| --- | --- |
| `@hytime/dsh-thinking-effort` | npm package, browser bundle path, loader ID, and host/client runtime ID |
| `thinking-effort` | Cordis composition entry ID and settings Slot ID |

## Features

| Feature | Description |
| --- | --- |
| Default levels | Adds `off`, `high`, and `max` without overwriting custom values |
| Per-model editor | Select levels and configure their gateway values from Settings |
| Gateway mapping | Send `ultra` when the user selects DSH `high` |
| Subagent default | Apply a default effort only when a subagent request has no explicit value |
| Multilingual settings | Switch the plugin settings page between Chinese, English, Japanese, and Korean |
| Version watermark | Show the installed plugin version in the bottom-right corner |

## Install, upgrade, and remove

Use the official DSH CLI to manage the plugin profile. A plain `npm install` does not register a DSH profile bundle.

```bash
# Install the latest version
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort

# Install a specific version
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.7

# Upgrade
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort

# Remove
dsh plugin --profile <profile> remove @hytime/dsh-thinking-effort
rm -f "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

See [INSTALL.md](./INSTALL.md) for profile discovery, migration, validation, and troubleshooting.

## Quick use

1. Open DSH **Settings → Reasoning effort**.
2. Use the **Page language** selector at the top to choose `中文`, `English`, `日本語`, or `한국어`. DSH uses the persisted locale first, then the browser language, then Chinese as the fallback. The selection is persisted by DSH and survives refreshes and restarts.
3. Choose a subagent default from the **Subagent reasoning effort** card, then click **Apply**.
4. Apply a preset to all models, or expand one model for detailed configuration.
5. Select a level and enter the exact gateway value. For example:

   | DSH level | Gateway value |
   | --- | --- |
   | `off` | Leave empty to omit the parameter |
   | `high` | `ultra` |
   | `max` | `max` |

6. Return to Composer and select the model to use its reasoning selector.

The settings page shows the installed version as a small watermark such as `v0.1.7` in the bottom-right corner.

## How it works

- **Host:** Scans `llm-pi-ai` `models` and `modelOverrides` on startup and settings changes, adding defaults only where `reasoningEfforts` is missing.
- **Client:** Registers a settings page through the standard DSH settings API and the official DSH locale service. Chinese, English, Japanese, and Korean dictionaries are maintained separately in `src/locales/zh.json`, `src/locales/en.json`, `src/locales/ja.json`, and `src/locales/ko.json`, then generated into the client bundle before publishing.
- **Subagents:** Stores the default in the `llm-pi-ai` user layer as `subagentEffort`. The `agent/request` waterfall only fills requests that do not already specify an effort.
- **No configured default:** The plugin does not automatically choose `off`, `high`, or `max`; the request omits `reasoning` and the gateway decides its own default behavior.

## Limitations

- `llm-pi-ai` exposes seven standard levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`.
- Non-`off` levels require a gateway value. An empty `off` value means that the parameter is omitted.
- The selected subagent level must be supported by the target model, or the gateway may return `UNSUPPORTED_REASONING_EFFORT`.
- `off` and an unset effort may both omit `reasoning`; whether this disables thinking depends on the gateway protocol.
- Host changes require a DSH restart. Settings and locale changes are applied in the browser, with a refresh available when needed.

## License

[MIT](./LICENSE)
