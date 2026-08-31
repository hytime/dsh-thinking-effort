# GitHub Actions CI/CD 设计：dsh-thinking-effort

- 日期：2026-08-31
- 状态：已确认设计，待用户审查书面规格
- 范围：自动测试、跨版本兼容验证和 npm 发布

## 背景与目标

`@hytime/dsh-thinking-effort` 已迁移为 TypeScript 单包，并在本地完成 Host、Client、lazy-CJS browser bundle 和 DSH 版本兼容验证。当前仓库没有 GitHub Actions workflow，且 npm registry 的 `latest` 仍为 `0.1.10`，本地主线包版本为 `0.1.11`。

本设计为仓库增加可重复的 GitHub Actions 流程：Pull Request 和 `main` push 执行质量检查；版本 tag 执行完整质量检查、alpha/rc2/rc7 真实 DSH 兼容矩阵和 npm 发布。普通 CI 不具备 npm 发布权限，发布只由版本 tag 触发。

## 设计决策

### Workflow 分离

使用两个 workflow：

- `.github/workflows/ci.yml`：PR、`main` push 和手动 workflow_dispatch 的质量检查。
- `.github/workflows/publish.yml`：仅 `v*.*.*` 版本 tag 触发发布前检查和 npm publish。

不引入 Release Please、semantic-release 或自动版本修改。版本号、CHANGELOG 和 tag 由维护者在同一变更中明确更新。

### npm 认证

使用 npm Trusted Publishing 的 GitHub OIDC，不保存长期 `NPM_TOKEN`：

```yaml
permissions:
  contents: read
  id-token: write
```

发布命令为：

```sh
npm publish --provenance --access public
```

在启用 workflow 之前，需要在 npm 包 `@hytime/dsh-thinking-effort` 的 Trusted Publishers 设置中绑定 GitHub 仓库 `hytime/dsh-thinking-effort` 和 `.github/workflows/publish.yml`。Trusted Publisher 配置缺失时发布 job 失败，不回退到长期 token。

### npm lockfile

提交 `package-lock.json`，workflow 使用 `npm ci`。当前 `pnpm-lock.yaml` 是本地未跟踪文件并已被忽略，不作为该外部 npm 包的 CI 锁文件。`package-lock.json` 必须覆盖生产和测试构建所需的直接开发依赖，包括 TypeScript、tsdown、Vitest、React、React DOM 和 jsdom。

## CI Workflow

### 触发条件

`ci.yml` 在以下事件运行：

- `pull_request`，覆盖所有目标分支；
- `push` 到 `main`；
- `workflow_dispatch`。

配置并发组，Pull Request 的新提交取消旧运行；`main` 运行不因新提交取消，以保留主线结果。

### Node 矩阵

质量 job 使用两个运行环境：

- Node `22.19.0`，对应 DSH 当前支持的 Node 22 下限；
- Node `24.x`。

每个矩阵 job 运行：

```text
npm ci
npm run build
npm run typecheck
npm run typecheck:test
npm test
node --check lib/index.js
node --check lib/client.js
npm pack --dry-run
npm audit --audit-level=high
git diff --check
```

`npm audit --audit-level=high` 允许低级别审计结果作为日志保留，但 high/critical 级别使 job 失败。CI 不运行需要 DSH checkout、Chromium 或 npm credentials 的外部集成测试。

Job 结束时只保留 GitHub Actions 默认日志；不上传包含用户配置或凭据的 artifact。

## Publish Workflow

### 触发与发布前保护

`publish.yml` 只响应：

```yaml
on:
  push:
    tags:
      - 'v*.*.*'
```

发布 job 使用完整 Git 历史，并通过 `scripts/verify-release.mjs` 检查：

1. tag 格式为 `v<semver>`；
2. tag 版本与 `package.json.version` 完全一致；
3. tag commit 位于 `main` 历史中；
4. `private` 不为 `true`；
5. `publishConfig.access` 为 `public`；
6. `main`、`exports["."]`、`exports["./client"]` 和 `files` 指向存在的发布入口；
7. npm registry 中不存在相同版本，避免对已发布版本重复 publish。

发布 workflow 不创建版本、不改 CHANGELOG、不创建 tag。任何版本不一致或发布版本已存在都直接失败。

### 质量 job

发布前先使用 Node `22.19.0` 执行普通质量门禁：

```text
npm ci
node scripts/verify-release.mjs "$GITHUB_REF_NAME"
npm run build
npm run typecheck
npm run typecheck:test
npm test
node --check lib/index.js
node --check lib/client.js
npm pack --dry-run
npm audit --audit-level=high
git diff --check
```

### 三版本 DSH 兼容 job

质量 job 通过后，兼容 job 在 Ubuntu runner 上准备三个官方 DSH checkout：

- 当前 alpha：tag `dsh-v0.1.2-alpha.1`，版本 `0.1.2-alpha.1`；
- 旧 rc2：tag `dsh-v0.1.1-rc.2`，版本 `0.1.1-rc.2`；
- 旧 rc7：tag `dsh-v0.1.0-rc.7`，版本 `0.1.0-rc.7`。

每个 checkout 使用其 lockfile 安装依赖并执行官方构建。兼容 job 安装 Chromium，并为插件仓库准备当前版本 tarball。随后运行：

```sh
DSH_LOADER_INTEGRATION=1 \
DSH_CLI_ROOTS="$ALPHA_ROOT,$RC2_ROOT,$RC7_ROOT" \
DSH_REQUIRE_THINKING_EFFORT_DOM=1 \
npm test -- tests/loader-composition.test.ts
```

`tests/loader-composition.test.ts` 自身负责校验三个 root 互异、官方 manifest 版本精确匹配、官方 `dsh plugin` 安装、真实 Web bundle route、Settings RPC/bridge、Slot/Locale runtime、AgentLoop 对照、真实 settings section DOM、子进程 cleanup 和无残留进程。

兼容 job 的所有 DSH home、profile、checkout、tarball、Chromium 临时目录和进程必须使用 runner 临时目录，并在 job 结束时清理。任何版本构建、route、DOM、Agent 或 cleanup 失败都阻止发布。

### npm publish job

publish job 依赖普通质量 job和兼容 job，并设置：

```yaml
permissions:
  contents: read
  id-token: write
```

发布前再次确认当前包版本和 tag 相等，然后执行：

```sh
npm publish --provenance --access public
```

发布 job 不读取 DSH 用户配置，不运行真实网关请求，不使用 `SUB2API_API_KEY` 或其他业务凭据。

## 错误处理与安全

- 普通 CI 不设置 `id-token: write`，不能访问 npm Trusted Publishing；
- 发布 job 不保存或打印 npm token；
- tag 不是从 `main` 产生时拒绝发布；
- npm 已存在相同版本时拒绝发布；
- DSH checkout 构建失败、版本不匹配、实际 Web route/DOM/Agent 验证失败时拒绝发布；
- `npm audit` 的 high/critical 结果阻断发布，low/moderate 结果保留日志但不改变当前发布策略；
- workflow 不复制用户 `~/.dsh`，不读取仓库外的配置和 secrets；
- 兼容测试不向 GitHub artifact 上传 settings、credential、session 或 Web 页面内容；
- 发布失败不执行回滚或删除，维护者修复后重新创建新的版本 tag。

## 文档与维护

新增或修改 workflow 时同步维护 README/INSTALL 中的本地验证与发布说明：

- PR/main CI 会运行哪些检查；
- tag 发布要求 `v<package.version>`；
- npm 发布依赖 Trusted Publishing；
- 跨版本兼容矩阵覆盖 alpha、rc2、rc7；
- npm 发布不会自动修改版本和 CHANGELOG。

Workflow 中的 Node、DSH tag、npm 命令和脚本路径必须与 package.json、测试文件和本规格保持一致。更新 DSH 兼容版本时，同时更新 workflow matrix、`tests/loader-composition.test.ts` 的版本映射和发布说明。

## 验收标准

1. PR 和 `main` push 会运行 Node 22.19.0/24.x 质量矩阵。
2. CI 能在干净 runner 使用 `npm ci` 完成 build、两套 typecheck、全量测试、产物解析、pack 和 audit。
3. 普通 CI 没有 npm 发布权限，也不会执行 publish。
4. `v*.*.*` tag 只在版本与 `package.json` 一致且 tag commit 属于 `main` 时进入发布。
5. 发布前必须通过 alpha、rc2、rc7 三个官方 DSH checkout 的真实兼容测试。
6. 三版本测试强制使用三个互异且版本精确匹配的 DSH root。
7. npm 发布使用 OIDC Trusted Publishing 和 provenance，不使用长期 token。
8. 相同 npm 版本不会重复发布。
9. 所有临时 DSH 资源和子进程在 job 结束前清理。
10. README、INSTALL 和 CHANGELOG 中的 workflow/publish 说明与实际配置一致。
