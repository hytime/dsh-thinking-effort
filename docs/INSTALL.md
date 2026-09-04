# Installation Guide (Official DSH CLI)

This guide uses only the official DSH `dsh plugin` command. The command installs the dependency into a profile and synchronizes `dsh.profile.bundles`. Do not replace it with plain `npm install`, direct `pnpm add` in the profile, or manual edits to the profile manifest.

- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [English README](../README.md)
- [中文 README](../README.zh.md)
- [日本語 README](../README.ja.md)
- [한국어 README](../README.ko.md)
- [Changelog](./CHANGELOG.md)
- [日本語 changelog](./CHANGELOG.ja.md)
- [한국어 changelog](./CHANGELOG.ko.md)

The placeholders in this guide are:

- `<profile>`: the DSH profile to modify, usually `web`;
- `${DSH_HOME}`: the DSH home directory, defaulting to `$HOME/.dsh`;
- `@hytime/dsh-thinking-effort`: the npm package and runtime plugin ID;
- `thinking-effort`: the Cordis composition and settings Slot ID.

## 0. Prerequisites and profile discovery

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
dsh --version
ls "${DSH_HOME:-$HOME/.dsh}/profiles"
```

Use the built package entries `lib/index.js` for Host and `lib/client.js` for Client. When developing from TypeScript or locale sources, run `npm run build` before starting DSH or packing the package.

Current DSH does not expose a public semver metadata contract, so runtime capability detection is authoritative. An optional version is used only when explicit metadata or test input supplies it; unknown valid versions still use the detected capabilities. Both modern `remote.settings` and legacy `connection.api.settings` are supported.

### DSH Runtime and Gateway Protocol compatibility

These are separate compatibility layers:

- **DSH Runtime:** the Settings transport is `remote.settings` on modern DSH and `connection.api.settings` on legacy DSH. The plugin detects the available runtime capability and keeps the legacy fallback optional.
- **Gateway Protocol:** the plugin uses the official `llm-pi-ai.compat` fields when the DSH schema exposes them. The optional `dsh-llm-openai-completions` transport can take over eligible custom OpenAI-compatible thinking providers when installed and enabled.

The version map applies these gateway capability rules:

| DSH range | Gateway compat fields | Takeover transport |
| --- | --- | --- |
| `0.1.0-rc.7` | Not available | Unsupported |
| `0.1.0-rc.8` to `<0.1.2-alpha.1` | Available except `supportsFinishReason` and `supportsThinkingTokenBudget` | Optional |
| `0.1.2-alpha.1` and later supported ranges | All 15 fields when exposed by the DSH schema | Optional |

DSH `0.1.0-rc.8` and later supported ranges follow the field availability shown above. The UI does not show fields that the runtime schema does not expose. If the optional transport is absent or disabled, no takeover is applied.

## Gateway compatibility settings

The provider global area in the Settings page edits the default `compat` values for every model under that provider. Expanding one model opens its single-model area. The four groups are collapsed by default.

| Group | Boolean fields (`Auto` / supported / unsupported) | Enum fields (`Auto` / concrete values) |
| --- | --- | --- |
| Role and reasoning | `supportsDeveloperRole`, `supportsReasoningEffort`, `supportsThinkingTokenBudget` | — |
| Format and output | `requiresThinkingAsText`, `requiresReasoningContentOnAssistantMessages` | `thinkingFormat`: `openai`, `openrouter`, `deepseek`, `together`, `baseten`, `zai`, `qwen`, `chat-template`, `qwen-chat-template`, `string-thinking`, `ant-ling`; `maxTokensField`: `max_tokens`, `max_completion_tokens` |
| Streaming and tools | `supportsUsageInStreaming`, `supportsFinishReason`, `requiresToolResultName`, `requiresAssistantAfterToolResult`, `supportsStrictMode` | — |
| Storage and cache | `supportsStore`, `supportsLongCacheRetention` | `cacheControlFormat`: `anthropic` |

Catalog models and `models[]` entries both support compat editing: catalog models use `modelOverrides.<model>.compat`, while `models[]` entries use `models[].compat`.

```yaml
providers:
  qwen-gateway:
    compat:
      supportsDeveloperRole: false
      maxTokensField: max_tokens
    models:
      - id: qwen-plus
      - id: qwen-thinking
        compat:
          maxTokensField: max_completion_tokens
```

Field-by-field, each value resolves independently in this order: model → provider → base/catalog → protocol → URL detection. A model value overrides only that field. `Auto` deletes or unsets the current-layer value, restores provider inheritance when applicable, and lets the next value in the chain take effect. Provider defaults apply to every model on the route; a model edit changes only the current model. For a route/provider, non-empty `models[]` and non-empty `modelOverrides` are mutually exclusive; the official schema rejects this invalid configuration, and the plugin fails closed for malformed data.

The current DSH Settings API does not support array-index path operations. `modelOverrides` edits therefore use field-level `set`/`unset` operations and touch only the selected field. A `models[]` edit writes one complete `providers.<route>.models` array set, preserving other model entries, unknown fields, and compat fields. These values are control plane configuration only; an external transport remains responsible for network requests.

## 1. Official installation

Install the latest version:

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort
```

Install the current release explicitly:

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.14
```

The official CLI updates the profile dependency, lockfile, and `dsh.profile.bundles` automatically. Do not add a manual YAML row.

## 2. Upgrade

Upgrade to the latest registry version:

```bash
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort
```

Upgrade to a specific version:

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.14
```

Restart DSH for host changes and refresh the Web page for client changes.

## 3. Migrate from the old package

Older installations may use:

```text
dsh-thinking-effort
github:hytime/dsh-thinking-effort
```

If the old dependency still exists, use the official commands:

```bash
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.14
```

If the dependency was removed by another tool but the old bundle remains, inspect the composed profile:

```bash
dsh --profile <profile> --dump-default-config
```

If it still contains `name: dsh-thinking-effort`, find the old GitHub commit in the profile lockfile and let the official CLI reconcile it:

```bash
dsh plugin --profile <profile> add github:hytime/dsh-thinking-effort#<old-commit>
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.14
```

Do not add the old package name to a new bundle list.

## 4. Verify installation

Check the dependency and installed version:

```bash
grep -n "@hytime/dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
node -p "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/@hytime/dsh-thinking-effort/package.json').version"
```

The version must be `0.1.14` for this release.

## Japanese and Korean support status

DSH `0.1.2-alpha.1` and later accept language-pack locale IDs through `LocaleRuntime`. This plugin registers `ja` and `ko` dynamically, so no DSH core fork is required. Older DSH builds that only accept built-in locale IDs support `zh` and `en` only.

Check the official composition:

```bash
dsh --profile <profile> --dump-default-config
```

It must contain:

```yaml
- id: thinking-effort
  name: '@hytime/dsh-thinking-effort'
```

It must not contain an old bundle row with:

```yaml
name: dsh-thinking-effort
```

## 5. Verify the settings page

Restart DSH, then refresh the Web page. Open **Settings → Model capabilities and effort**.

1. The page language selector offers `中文`, `English`, `日本語`, and `한국어` on DSH `0.1.2-alpha.1` and later.
2. The **Subagent default effort** card shows the current default and provides **Apply**.
3. **Quick settings** offers the official DeepSeek and generic batch presets.
4. The provider/model list supports search, expand/collapse, input-capability badges, context badges, and per-model settings controls.
5. The bottom-right watermark shows `v0.1.14`.

The host marker can be checked with:

```bash
cat "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

## 6. Troubleshooting

| Symptom | Action |
| --- | --- |
| `dsh` is not found | Install or enable the official DSH CLI. Do not simulate profile installation with plain npm or pnpm commands. |
| `dump-default-config` reports the old package | Restore the old lockfile commit, run the official remove command, then add the scoped package again. |
| Host plugin is not loaded | Restart DSH and check `thinking-effort-loaded.json` and startup logs. |
| Settings page is missing | Restart DSH, refresh the page, and check the scoped bundle in the profile composition. |
| Language selection does not persist | Confirm the DSH locale service is mounted and that the profile can write settings. |
| Effort write fails | Every non-`off` level needs a gateway value. |
| Subagent returns `UNSUPPORTED_REASONING_EFFORT` | Choose an effort supported by the target model or restore the provider default. |

## Release maintenance

Maintainers update the `package.json` version and all applicable `CHANGELOG` files, commit those changes, and create the matching `v<version>` tag. The tag must point to a commit in the `main` history. The `publish.yml` workflow does not change versions or changelogs automatically.

Configure npm GitHub Trusted Publishing for repository `hytime/dsh-thinking-effort` and workflow `publish.yml`. Publishing uses GitHub OIDC and provenance with `npm publish --provenance --access public`; no `NPM_TOKEN` or long-lived token is used. A version that already exists in npm blocks the release.

Before publishing, the workflow builds three temporary official DSH capability representatives in rc7 → rc2 → alpha3 order and runs the real compatibility suite after installing the current tarball with the official `dsh plugin` command:

- `dsh-v0.1.0-rc.7` (`0.1.0-rc.7`) — rc7 capability representative
- `dsh-v0.1.1-rc.2` (`0.1.1-rc.2`) — rc2 capability representative
- `dsh-v0.1.2-alpha.3` (`0.1.2-alpha.3`) — alpha3 capability representative

The ordinary CI workflow remains test-only and runs on pull requests and `main` pushes. Keep `package-lock.json` committed for its `npm ci` installation.

## 7. Remove

Use the official command:

```bash
dsh plugin --profile <profile> remove @hytime/dsh-thinking-effort
rm -f "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

Verify that the composed profile no longer contains the scoped bundle:

```bash
dsh --profile <profile> --dump-default-config
```
