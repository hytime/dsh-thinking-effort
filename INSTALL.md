# Installation Guide (Official DSH CLI)

This guide uses only the official DSH `dsh plugin` command. The command installs the dependency into a profile and synchronizes `dsh.profile.bundles`. Do not replace it with plain `npm install`, direct `pnpm add` in the profile, or manual edits to the profile manifest.

- [English installation guide](./INSTALL.md)
- [中文安装指南](./INSTALL.zh.md)
- [日本語インストールガイド](./INSTALL.ja.md)
- [한국어 설치 안내](./INSTALL.ko.md)
- [English README](./README.md)
- [中文 README](./README.zh.md)
- [日本語 README](./README.ja.md)
- [한국어 README](./README.ko.md)
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

Use the profile named by your running DSH process. `web` is common, but the active `--profile` argument is authoritative.

## 1. Official installation

Install the latest version:

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort
```

Install the current release explicitly:

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.7
```

The official CLI updates the profile dependency, lockfile, and `dsh.profile.bundles` automatically. Do not add a manual YAML row.

## 2. Upgrade

Upgrade to the latest registry version:

```bash
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort
```

Upgrade to a specific version:

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.7
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
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.7
```

If the dependency was removed by another tool but the old bundle remains, inspect the composed profile:

```bash
dsh --profile <profile> --dump-default-config
```

If it still contains `name: dsh-thinking-effort`, find the old GitHub commit in the profile lockfile and let the official CLI reconcile it:

```bash
dsh plugin --profile <profile> add github:hytime/dsh-thinking-effort#<old-commit>
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.7
```

Do not add the old package name to a new bundle list.

## 4. Verify installation

Check the dependency and installed version:

```bash
grep -n "@hytime/dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
node -p "require('${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/node_modules/@hytime/dsh-thinking-effort/package.json').version"
```

The version must be `0.1.7` for this release.

## Japanese and Korean support status

The plugin ships `ja` and `ko` dictionaries, but the current official DSH release exposes only `zh` and `en` through `LocaleRuntime`. On stock DSH, selecting Japanese or Korean fails with `locale "<id>" is not registered`.

To use them before official support lands, maintain a DSH fork and update:

- `packages/client/locale/src/locale-settings.ts`: add `ja` and `ko` to `LOCALE_IDS` (the Host preference schema derives from this list).
- `packages/client/locale/src/client/index.ts`: add `{ id: 'ja', label: '日本語' }` and `{ id: 'ko', label: '한국어' }` to `LOCALES`.
- Add the corresponding core dictionaries and tests, then rebuild and run the forked DSH.

A plugin-only change cannot extend DSH's global locale list. Use the fork's documented build and official profile commands; do not manually edit a profile manifest.

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

Restart DSH, then refresh the Web page. Open **Settings → Reasoning effort**.

1. On stock DSH, the page language selector offers `中文` and `English`. `日本語` and `한국어` require the DSH core locale changes described above.
2. The default is the persisted DSH locale, then the browser language, then Chinese.
3. Selecting a language survives page refresh and DSH restart.
4. The bottom-right watermark shows `v0.1.7`.
5. Model effort editing and subagent effort settings remain available.

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
