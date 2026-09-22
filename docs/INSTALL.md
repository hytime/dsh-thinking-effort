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
- **Settings model:** DSH `0.1.7` and later derive each settings form from its Loader entry's own `Config` schema (`entry-config`) and keep the document in the active profile's `cordis.patch.yml`; DSH `0.1.0-rc.7` through `0.1.6` register a namespace instead and store it in the DSH settings document, for example `~/.dsh/settings.yaml`. The plugin supports both, and the Client resolves the section id the running Host publishes — `thinking-effort` under `entry-config`, `dsh-thinking-effort` under the namespace model.

The version map applies these gateway capability rules:

| DSH range | Gateway compat fields | Takeover transport |
| --- | --- | --- |
| `0.1.0-rc.7` | Not available | Unsupported |
| `0.1.0-rc.8` to `<0.1.2-alpha.1` | Available when exposed by the DSH schema, but without `supportsFinishReason` and `supportsThinkingTokenBudget` | Optional |
| `0.1.2-alpha.1` and later supported ranges | All 15 fields when exposed by the DSH schema | Optional |

From DSH `0.1.0-rc.8` onward, field availability follows the runtime schema.
DSH `0.1.0-rc.8` and later supported ranges follow the field availability shown above. The UI does not show fields that the runtime schema does not expose. If the optional transport is absent or disabled, no takeover is applied.

## OpenCode session Header

The OpenCode session Header setting is a model-level control in the model editor, not a provider-global option. It is off by default. Expand the exact `provider/model` and flip the **OpenCode session Header** switch only when the target service requires `x-opencode-session`; the toggle saves immediately, with no separate save button.

### What the Host sends by default

With the switch on and no `format` configured, the Host sends `x-opencode-session` in OpenCode Zen's canonical shape, **deterministically derived from the current DSH session id**:

| Segment | Length | Source |
| --- | --- | --- |
| `ses_` | 4 | fixed prefix |
| hex timestamp | 12 | 48-bit millisecond timestamp, minted once per DSH session (`time: firstUse`) |
| Base62 tail | 14 | 80-bit SHA-256 digest of the normalized session id (`session-` prefix stripped, lowercased, hyphens removed) |

The guarantees this provides:

- **Stable within one session** — the same DSH session always sends the same value (per-session sticky cache); cache eviction keeps the first-use mint, so an evicted session gets the same value again when revisited; resumed sessions keep the same 14-character tail, and only the hex timestamp is re-minted after a DSH restart in `firstUse` mode.
- **Different between sessions** — every subagent run derives its own distinct value, so no two conversations collapse into one upstream session.
- **Bound to the DSH session id** — the same session id always derives the same suffix, on any machine, with no stored value.
- **Format-compliant** — the result matches `^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$` (30 characters total).

### Configuring the generator

Where the generator lives depends on the DSH line: on `0.1.7`+ it is the `opencodeSession.format` section of the active profile's `cordis.patch.yml` (addressed by the Loader entry id `thinking-effort`); on `0.1.0-rc.7` through `0.1.6` it is `dsh-thinking-effort.opencodeSession.format` in the DSH settings document, for example `~/.dsh/settings.yaml`. The settings page writes either location for you. The YAML below shows the namespace shape the releases before `0.1.7` read:

```yaml
dsh-thinking-effort:
  opencodeSession:
    providers:
      opencode-go:
        models:
          deepseek-v4-flash: true
    format:
      mode: ses-derive
      time: firstUse
```

Fields:

| Field | Values | Default | Meaning |
| --- | --- | --- | --- |
| `mode` | `ses-derive` / `passthrough` / `template` / `expression` / `script` | `ses-derive` | The generator used when the switch is on. Unknown values fall back to `ses-derive`. |
| `time` | `firstUse` / `hash` | `firstUse` | Where the 12-hex block comes from. `hash` derives it from the session digest, making the whole value identical on every machine without any cache. |
| `template` | string | `''` | `template` mode: placeholders `{hex12}`, `{tail62}`, `{sessionId}`, `{rawSessionId}`, `{sha256}`, `{now}`, `{provider}`, `{model}`. |
| `expression` | string | `''` | `expression` mode: a safe additive expression using the same context plus `sha256`, `slice`, `lower`, `upper`, e.g. `'ses_' + hex12 + tail62`. |
| `script` | absolute path | `''` | `script` mode: a JS file (`.mjs` or `.cjs`) exporting `format(context)` returning the header value string. Reloaded when the file changes (checked at most once per second). On load or evaluation failure it falls back to `ses-derive`. |
| `validate` | regex source | `''` | Optional validation. Empty means no check; the built-in default shape is `^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$`. |
| `onInvalid` | `warn` / `drop` / `send` | `warn` | What to do when the produced value fails `validate`: log and still send, omit the header, or send silently. |

Examples:

```yaml
# Explicit canonical generator (equivalent to the default)
format: { mode: ses-derive, time: firstUse }

# Fully deterministic on every machine (hex block also from the digest)
format: { mode: ses-derive, time: hash }

# Previous behavior: raw DSH session id
format: { mode: passthrough }

# Template for a reshuffled upstream format
format: { mode: template, template: '{hex12}-{tail62}' }

# Expression, when the upstream expects a prefix plus derived parts
format: { mode: expression, expression: "'ses_' + hex12 + tail62" }

# External script for arbitrary future formats
format: { mode: script, script: '/absolute/path/to/session.mjs' }
```

The `script` file exports a function that receives the same context object:

```js
// /absolute/path/to/session.mjs
export function format(ctx) {
  // ctx.hex12, ctx.tail62, ctx.sessionId, ctx.rawSessionId, ctx.now, ctx.provider, ctx.model
  return 'ses_' + ctx.hex12 + ctx.tail62
}
```

Changing the `format` config re-derives the value on the next request of a session (the per-session cache is keyed by the config fingerprint). After changing the Host or the plugin package, restart DSH; after changing Settings or Client code, refresh the Web page.

### Session value generator card

The **Session value generator** card on the settings page reads and writes every field below, so the settings document never has to be edited by hand: generator mode, timestamp source, template / expression / script path, validation regex, and the on-invalid policy. The card shows only the fields the current mode uses (the timestamp source is shown for every mode except `passthrough`), and switching modes does not clear what the other fields already hold.

The card validates before writing and disables **Apply** when a check fails:

- **Validation regex** must be a valid regular expression. The Host **silently degrades** an uncompilable regex to "no validation at all", which makes this the easiest field to believe is set when it is not.
- **Template / expression / script** must not be empty in their own mode, or the Host falls back to the derived `ses_` value.
- **Script path** must be an absolute path: the Host resolves a relative path against its own working directory, so a relative path is not usable in practice.
- **Expression** is syntax-checked inside the card (sharing one parser with the Host), and a syntax error or an unknown name is refused: the evaluator throws on either, and the Host answers a throw with the same silent fallback to the derived value.

**Apply** writes only the fields you changed, so it never overwrites the profile library, the pre-import backup, or the per-model session switches in the same namespace.

### Behavior notes

- An `x-opencode-session` already supplied by the adapter or caller is preserved and never overwritten.
- The setting works through both the modern Remote Settings transport and the legacy `connection.api.settings` transport, and does not change the route's `api` protocol.
- If the request passes through Sub2API, CPA, or another forwarding gateway, verify that it preserves and forwards `x-opencode-session` to the OpenCode upstream. A static route setting such as `llm-pi-ai.providers.<route>.headers.x-opencode-session` is not equivalent because one fixed value is shared by all conversations.

## OpenCode user-agent override

The `llm-pi-ai` adapter forces its own attribution `user-agent` (`deepseek-harness/<version> (+https://github.com/deepseek-ai/deepseek-harness)`) onto every provider request and strips any provider-configured value with the same name, so `llm-pi-ai.providers.<route>.headers.user-agent` has no effect. This plugin rewrites the header on the matching `llm/stream` request at the last layer before it leaves, which is the only place a rewrite survives.

It is configured under `opencodeSession.userAgent` in the same settings section as the generator above, and is off by default:

```yaml
dsh-thinking-effort:
  opencodeSession:
    userAgent:
      value: "opencode/1.18.31 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14"
      providers:
        opencode-go:
          enabled: true              # every model on this route
        sundrawnewapi-private:
          value: "opencode/1.18.31"  # optional per-route value
          models:
            mimo-v2.5-free: true     # exact model toggle
```

| Field | Meaning |
| --- | --- |
| `userAgent.value` | Master value and the enable switch. Empty or absent turns the override off everywhere. |
| `userAgent.providers.<route>.enabled` | `true` applies the override to every model on that route. |
| `userAgent.providers.<route>.models.<model>` | `true` applies it to that exact model only. |
| `userAgent.providers.<route>.value` | Optional route-specific value; wins over the master `value`. |

Resolution order for one request: the route must match by `enabled` or an exact model toggle, then the route `value` is used when non-empty, otherwise the master `value`. Requests that do not match keep DSH's attribution `user-agent`, so only the routes you opt in are affected. Custom providers work by their configured route name with no extra registration. The override composes with the session Header on the same request, and an explicit caller `user-agent` is still overwritten because the whole point is to defeat the adapter.

Restart DSH after changing Host code or the package; the configuration itself is re-read on settings changes.

## Gateway compatibility settings

The provider global area in the Settings page edits the default `compat` values for every model under that provider. Expanding one model opens its single-model area. The four groups are collapsed by default.

| Group | Boolean fields (`Auto` / supported / unsupported) | Enum fields (`Auto` / concrete values) |
| --- | --- | --- |
| Role and reasoning | `supportsDeveloperRole`, `supportsReasoningEffort`, `supportsThinkingTokenBudget` | — |
| Format and output | `requiresThinkingAsText`, `requiresReasoningContentOnAssistantMessages` | `thinkingFormat`: `openai`, `openrouter`, `deepseek`, `together`, `baseten`, `zai`, `qwen`, `chat-template`, `qwen-chat-template`, `string-thinking`, `ant-ling`; `maxTokensField`: `max_tokens`, `max_completion_tokens` |
| Streaming and tools | `supportsUsageInStreaming`, `supportsFinishReason`, `requiresToolResultName`, `requiresAssistantAfterToolResult`, `supportsStrictMode` | — |
| Storage and cache | `supportsStore`, `supportsLongCacheRetention` | `cacheControlFormat`: `anthropic` |

Protocol support is an additional limit on top of the DSH version and runtime schema:

| Route `api` | Supported fields from this plugin's 15 scalar fields |
| --- | --- |
| `openai-completions` | All 15 fields |
| `openai-responses`, `azure-openai-responses`, `openai-codex-responses` | `supportsDeveloperRole`, `supportsStrictMode`, `supportsLongCacheRetention` |
| `anthropic-messages` | `supportsLongCacheRetention` |
| `bedrock-converse-stream` | `supportsStrictMode` |

For a known protocol, fields outside its list are hidden and are not written. If the route has no recognized `api`, the runtime schema and DSH validation remain authoritative.

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

Field-by-field, each value resolves independently in this order: model → provider → base/catalog → protocol. URL/hostname detection is not used as a compat source. A model value overrides only that field. `Auto` deletes or unsets the current-layer value, restores provider inheritance when applicable, and lets the next value in the chain take effect. Provider defaults apply to every model on the route; a model edit changes only the current model. For a route/provider, non-empty `models[]` and non-empty `modelOverrides` are mutually exclusive; the official schema rejects this invalid configuration, and the plugin fails closed for malformed data.

The current DSH Settings API does not support array-index path operations. `modelOverrides` edits therefore use field-level `set`/`unset` operations and touch only the selected field. A `models[]` edit writes one complete `providers.<route>.models` array set, preserving other model entries, unknown fields, and compat fields. These values are control plane configuration only; an external transport remains responsible for network requests.

### Snapshot import trust model

A snapshot carries **capability configuration** — reasoning efforts, compat switches, which models enable the session Header — and is safe to move between machines. An export also contains **deployment wiring** verbatim: a provider's `baseURL`, `apiKeyEnv`, and `headers`, plus `opencodeSession.format.script`. Import withholds those fields by default, so a file from someone else cannot redirect your requests, attach their credential name, inject a raw header, or name a local module for the Host to import and execute. The exported file still holds every value as written, including a plaintext token kept in `headers` — check it before sharing.

When a file does try to change wiring, the preview says how many entries were skipped and offers **Also import endpoints and credentials (advanced)**, which is off for every import and never remembered. The warning lists the target endpoint for each affected route so the destination is visible before you consent.

Restoring a rollback copy or a saved profile follows the same rule. If you previously imported wiring with the opt-in and need to restore an old endpoint, re-check the box in that preview.

## 1. Official installation

Install the latest version:

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort
```

Install the current release explicitly:

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.1
```

The official CLI updates the profile dependency, lockfile, and `dsh.profile.bundles` automatically. Do not add a manual YAML row.

## 2. Upgrade

Upgrade to the latest registry version:

```bash
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort
```

Upgrade to a specific version:

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.1
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.1
```

If the dependency was removed by another tool but the old bundle remains, inspect the composed profile:

```bash
dsh --profile <profile> --dump-default-config
```

If it still contains `name: dsh-thinking-effort`, find the old GitHub commit in the profile lockfile and let the official CLI reconcile it:

```bash
dsh plugin --profile <profile> add github:hytime/dsh-thinking-effort#<old-commit>
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.3.1
```

Do not add the old package name to a new bundle list.

## 4. Verify installation

Check the dependency and installed version:

```bash
grep -n "@hytime/dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
node -p "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/@hytime/dsh-thinking-effort/package.json').version"
```

The version must be `0.3.1` for this release.

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

## 5. Verify the settings page and Composer

Restart DSH, then refresh the Web page. Open **Settings → Model capabilities and effort**.

1. The page language selector offers `中文`, `English`, `日本語`, and `한국어` on DSH `0.1.2-alpha.1` and later.
2. The **Subagent default effort** card shows the current default and provides **Apply**.
3. **Quick settings** offers the official DeepSeek and generic batch presets.
4. The provider/model list supports search, expand/collapse, input-capability badges, context badges, and per-model settings controls.
5. The bottom-right watermark shows the installed plugin version.

Return to Composer and choose a configured model. When the Web runtime provides `modelDirectories`, the plugin registers an optional Composer `seat` with a discrete reasoning-effort slider. It lists only the host-resolved `reasoning.efforts` for the selected exact `provider/model`. A model without `defaultEffort` also shows **Follow model default**; this clears the session's reasoning-effort override instead of editing plugin Settings. The slider follows the active light or dark theme through host `--dsw-*` tokens.

The Composer `seat` is optional. It is not registered when `modelDirectories` is unavailable, and the Settings page continues to work through the detected modern or legacy Settings transport. The plugin does not modify the DSH Composer packages.

Host configuration changes take effect after a DSH restart. Refresh the Web page after Client bundle, Settings, or locale changes before checking the Composer slider.

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

Before publishing, the workflow builds four temporary official DSH capability representatives in rc7 → rc2 → alpha2 → latest order and runs the real compatibility suite after installing the current tarball with the official `dsh plugin` command:

- `dsh-v0.1.0-rc.7` (`0.1.0-rc.7`) — rc7 capability representative
- `dsh-v0.1.1-rc.2` (`0.1.1-rc.2`) — rc2 capability representative
- `dsh-v0.1.3-alpha.2` (`0.1.3-alpha.2`) — alpha2 capability representative
- `dsh-v0.1.6-alpha.1` (`0.1.6-alpha.1`) — newest capability representative (also runs the real-browser DOM probe)

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
