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

## 1. Official installation

Install the latest version:

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort
```

Install the current release explicitly:

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.13
```

The official CLI updates the profile dependency, lockfile, and `dsh.profile.bundles` automatically. Do not add a manual YAML row.

## 2. Upgrade

Upgrade to the latest registry version:

```bash
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort
```

Upgrade to a specific version:

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.13
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.13
```

If the dependency was removed by another tool but the old bundle remains, inspect the composed profile:

```bash
dsh --profile <profile> --dump-default-config
```

If it still contains `name: dsh-thinking-effort`, find the old GitHub commit in the profile lockfile and let the official CLI reconcile it:

```bash
dsh plugin --profile <profile> add github:hytime/dsh-thinking-effort#<old-commit>
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.13
```

Do not add the old package name to a new bundle list.

## 4. Verify installation

Check the dependency and installed version:

```bash
grep -n "@hytime/dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
node -p "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/@hytime/dsh-thinking-effort/package.json').version"
```

The version must be `0.1.13` for this release.

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
5. The bottom-right watermark shows `v0.1.13`.

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

Before publishing, the workflow builds two temporary official DSH range representatives and runs the real compatibility suite after installing the current tarball with the official `dsh plugin` command:

- `dsh-v0.1.2-alpha.3` (`0.1.2-alpha.3`) — modern range
- `dsh-v0.1.1-rc.2` (`0.1.1-rc.2`) — legacy range

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
