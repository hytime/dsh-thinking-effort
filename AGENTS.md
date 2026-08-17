# dsh-thinking-effort Agent Instructions

本仓库是 DSH（DeepSeek Harness）的第三方插件。涉及安装、升级、卸载或验证时，必须使用 DSH 官方插件命令管理目标 profile。

## 标识约定

- npm 包名：`@hytime/dsh-thinking-effort`
- Cordis 组合条目 ID：`thinking-effort`
- 运行时插件 ID：`dsh-thinking-effort`

`package.json` 的 npm 包名和运行时插件 ID 有不同职责，不能为了统一字符串而修改 `src/host.mjs` 或 `src/client.js` 中的运行时 ID。

## 官方安装

先确认目标 profile，不能凭猜测修改 profile：

```bash
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
ls "${DSH_HOME:-$HOME/.dsh}/profiles"
dsh --version
```

安装最新版本：

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort
```

安装指定版本：

```bash
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.2
```

不要使用普通 `npm install`、profile 目录下的直接 `pnpm add`，也不要手工编辑 profile 的 `package.json` 来代替官方命令。官方 CLI 会安装依赖，并自动维护 `dsh.profile.bundles`。

## 升级与卸载

升级：

```bash
dsh plugin --profile <profile> update @hytime/dsh-thinking-effort
```

卸载：

```bash
dsh plugin --profile <profile> remove @hytime/dsh-thinking-effort
rm -f "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

卸载后如果 profile 仍引用旧 bundle，不要直接猜测修改配置。先执行：

```bash
dsh --profile <profile> --dump-default-config
```

确认没有以下旧条目：

```yaml
name: dsh-thinking-effort
```

## 从旧包迁移

旧版本可能使用以下依赖：

```text
dsh-thinking-effort
github:hytime/dsh-thinking-effort
```

正常迁移顺序：

```bash
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.2
```

如果旧依赖已经被其他工具移除，但 profile 的 bundle 列表仍残留 `dsh-thinking-effort`，官方 CLI 可能无法从本次依赖差异推断该残留条目。此时先从旧 profile 的 `pnpm-lock.yaml` 找到旧 GitHub commit，再使用官方命令恢复并移除：

```bash
dsh plugin --profile <profile> add github:hytime/dsh-thinking-effort#<old-commit>
dsh plugin --profile <profile> remove dsh-thinking-effort
dsh plugin --profile <profile> add @hytime/dsh-thinking-effort@0.1.2
```

不要把旧包名添加到新的 `dsh.profile.bundles` 中。

## 安装验证

安装或升级完成后必须验证依赖、bundle 和组合树：

```bash
grep -n "@hytime/dsh-thinking-effort" \
  "${DSH_HOME:-$HOME/.dsh}/profiles/<profile>/package.json"
dsh --profile <profile> --dump-default-config
```

组合树应包含：

```yaml
- id: thinking-effort
  name: '@hytime/dsh-thinking-effort'
```

并且不应再包含：

```yaml
name: dsh-thinking-effort
```

宿主逻辑需要重启 DSH 进程后才会生效；Web 页面需要刷新。验证加载标记：

```bash
cat "${DSH_HOME:-$HOME/.dsh}/thinking-effort-loaded.json"
```

如果 `dump-default-config` 失败，或者仍然出现旧包名，不能声称插件安装成功，应先修复 profile 组合。

## 修改代码后的检查

修改宿主或客户端代码后至少运行：

```bash
node --check src/host.mjs
node --check src/client.js
npm pack --dry-run
git diff --check
```

README、INSTALL 和本文件中的 npm 包名必须使用 `@hytime/dsh-thinking-effort`。只有说明运行时身份时才使用 `dsh-thinking-effort`。
