# GitHub Actions CI/CD 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `subagent-driven-development`（推荐）或 `executing-plans` 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 为 `@hytime/dsh-thinking-effort` 建立 PR/main 自动测试、tag 触发的三版本 DSH 兼容门禁，以及 npm OIDC Trusted Publishing 发布流程。

**架构：** 使用 `.github/workflows/ci.yml` 和 `.github/workflows/publish.yml` 分离普通质量检查与发布权限。普通 CI 使用 `npm ci` 和 Node 22.19.0/24.x 矩阵；tag 发布先运行同一质量门禁，再构建 alpha、rc2、rc7 官方 DSH checkout 并执行真实集成测试，最后使用 OIDC provenance 发布 npm。

**技术栈：** GitHub Actions、`actions/checkout@v4`、`actions/setup-node@v4`、Corepack/pnpm、npm `package-lock.json`、Node ESM、TypeScript、Vitest、tsdown、DSH `dsh plugin`、npm Trusted Publishing。

---

## 文件清单与职责

### 创建

- `.github/workflows/ci.yml`：PR、`main` push 和手动触发的 Node 质量矩阵，不拥有发布权限。
- `.github/workflows/publish.yml`：`v*.*.*` tag 的质量、三版本兼容和 OIDC 发布流程。
- `package-lock.json`：npm CI 依赖锁定文件，覆盖 TypeScript、tsdown、Vitest、React、React DOM、jsdom 和 peer 依赖。
- `scripts/verify-release.mjs`：tag/package 版本、公开发布属性、exports 和发布入口校验。
- `scripts/verify-release.test.mjs`：release guard 的成功、版本不一致、私有包和入口缺失测试。
- `scripts/verify-workflows.test.mjs`：CI 与 publish workflow 的触发器、权限、矩阵和 job 依赖静态测试。

### 修改

- `package.json`：增加 `test:release`，确认 `npm ci` 所需依赖和 release guard 运行方式。
- `README.md`、`README.zh.md`、`README.ja.md`、`README.ko.md`：说明 PR/main CI、tag 发布、OIDC、三版本兼容门禁和手动 release 前提。
- `INSTALL.md`、`INSTALL.zh.md`、`INSTALL.ja.md`、`INSTALL.ko.md`：补充维护者发布流程和 npm Trusted Publisher 配置说明。
- `CHANGELOG.md`、`CHANGELOG.ja.md`、`CHANGELOG.ko.md`：仅在当前版本文档确实需要补充 workflow 说明时更新，不生成新的产品版本条目。

### 不修改

- 不修改 `src/`、`lib/`、`cordis.patch.yml` 或产品运行逻辑。
- 不自动修改 `package.json.version`、CHANGELOG 或创建 tag。
- 不读取 `~/.dsh`、`SUB2API_API_KEY` 或其他用户/业务 secret。
- 不修改官方 DSH checkout；官方 checkout 只在 runner 临时目录中 clone。

---

### 任务 1：建立 npm lockfile 和 release guard

**文件：**
- 创建：`package-lock.json`、`scripts/verify-release.mjs`、`scripts/verify-release.test.mjs`
- 修改：`package.json`
- 测试：`scripts/verify-release.test.mjs`

- [ ] **步骤 1：写 release guard 失败测试**

使用临时 fixture 目录和临时 `package.json`，覆盖：

```js
await expect(runGuard(fixture, 'v0.1.11')).resolves.toBe(0)
await expect(runGuard(fixture, 'v0.1.10')).rejects.toThrow(/tag version/)
await expect(runGuard(privateFixture, 'v0.1.11')).rejects.toThrow(/private/)
await expect(runGuard(missingClientFixture, 'v0.1.11')).rejects.toThrow(/client export/)
```

测试应检查 guard 读取 fixture 的 manifest 和构建入口，不读取当前仓库的真实 `package.json` 作为唯一测试对象。不要在测试中访问 npm registry。

- [ ] **步骤 2：运行测试确认失败**

运行：`node --test scripts/verify-release.test.mjs`

预期：因 `scripts/verify-release.mjs` 尚不存在而失败，失败原因应是模块缺失，而不是 fixture 拼写或测试自身错误。

- [ ] **步骤 3：实现无网络 release guard**

实现 ESM 脚本，接受一个 tag 参数和可选 `--root` 参数：

```text
node scripts/verify-release.mjs v0.1.11
node scripts/verify-release.mjs v0.1.11 --root /tmp/dsh-thinking-effort-release-fixture
```

脚本依次验证：

1. tag 匹配 `v<major>.<minor>.<patch>` 或合法 prerelease；
2. tag 的版本等于 manifest `version`；
3. `private` 不是 `true`；
4. `publishConfig.access` 等于 `public`；
5. `main`、`exports["."]`、`exports["./client"]` 指向的文件存在；
6. `files` 包含 `lib/index.js`、`lib/client.js` 和 `lib/types/**/*.d.ts`；
7. `dsh.bundle.patch` 与 `dsh.client.platform` 存在且 platform 为 `web`；
8. workflow 不使用 `NPM_TOKEN`，重复版本查询留给发布 job 的显式 registry 检查。

脚本只做本地文件和字符串校验，不访问 npm，不修改文件。

- [ ] **步骤 4：运行 release guard 测试确认通过**

运行：`node --test scripts/verify-release.test.mjs`

预期：所有 fixture 测试通过，非法 tag、私有包、缺入口和缺发布文件均被拒绝。

- [ ] **步骤 5：生成并验证 package-lock**

运行：

```sh
npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm install --package-lock-only --ignore-scripts
npm ci --ignore-scripts
```

预期：生成根目录 `package-lock.json`；`npm ci` 在干净安装视图中完成，不生成新的 lockfile 修改。不得把 `pnpm-lock.yaml` 加回 Git。

- [ ] **步骤 6：加入 release 测试脚本并运行本地检查**

在 `package.json` 增加：

```json
"test:release": "node --test scripts/verify-release.test.mjs"
```

运行：`npm run test:release`、`npm run typecheck`、`npm run typecheck:test`、`git diff --check`

- [ ] **步骤 7：Commit**

```sh
git add package.json package-lock.json scripts/verify-release.mjs scripts/verify-release.test.mjs
git commit -m "build: add npm release guard and lockfile"
```

---

### 任务 2：实现普通质量 CI workflow

**文件：**
- 创建：`.github/workflows/ci.yml`
- 修改：`README.md`、`README.zh.md`、`README.ja.md`、`README.ko.md`
- 测试：GitHub Actions YAML 静态检查、workflow 中引用的本地命令

- [ ] **步骤 1：写 workflow 静态失败检查**

新增一个 Node 测试或 shell 检查，读取 `.github/workflows/ci.yml`，断言它包含：

```text
pull_request
push: branches: [main]
workflow_dispatch
node-version: [22.19.0, 24.x]
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

同时断言普通 CI 的 workflow/job permissions 不包含 `id-token: write`，不包含 `npm publish`。

- [ ] **步骤 2：运行静态检查确认失败**

运行：`node --test scripts/verify-workflows.test.mjs`

预期：在 workflow 尚不存在时失败；修复 workflow 后，该测试固定作为 `test:release` 的一部分运行。

- [ ] **步骤 3：实现 ci.yml**

使用最小权限和矩阵：

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  quality:
    strategy:
      fail-fast: false
      matrix:
        node: [22.19.0, 24.x]
```

每个 job 使用 `actions/checkout@v4`、`actions/setup-node@v4` 的 npm cache、`npm ci`，按顺序执行任务 1 中的质量命令。不要上传包含 settings、session、credentials 或 Web 页面内容的 artifact。Pull Request 使用以 `pull_request` 为 key 的 concurrency 并取消旧运行；main push 不取消正在运行的质量 job。

- [ ] **步骤 4：同步普通 CI 文档**

在四种 README 的开发/维护章节写明：

- PR 和 main push 会运行 Node 22.19.0/24.x 质量矩阵；
- workflow 使用 `npm ci`，维护者应提交 `package-lock.json`；
- 普通 CI 不发布 npm；
- 发布只由版本 tag workflow 触发。

英文和中文事实必须一致，日文/韩文版本同步相同流程。

- [ ] **步骤 5：运行本地 workflow 内容检查**

运行：

```sh
npm run test:release
npm run typecheck
npm run typecheck:test
npm test
npm run build
node --check lib/index.js
node --check lib/client.js
npm pack --dry-run
npm audit --audit-level=high
git diff --check
```

- [ ] **步骤 6：Commit**

```sh
git add .github/workflows/ci.yml README.md README.zh.md README.ja.md README.ko.md scripts/verify-workflows.test.mjs
 git commit -m "ci: add pull request quality workflow"
```

---

### 任务 3：实现 tag 发布和三版本 DSH 兼容 workflow

**文件：**
- 创建：`.github/workflows/publish.yml`
- 修改：`README.md`、`README.zh.md`、`README.ja.md`、`README.ko.md`、`INSTALL.md`、`INSTALL.zh.md`、`INSTALL.ja.md`、`INSTALL.ko.md`
- 测试：workflow 静态检查、tag guard、发布 job 依赖关系

- [ ] **步骤 1：写 publish workflow 失败检查**

静态测试断言：

```text
trigger is push.tags ['v*.*.*']
quality needs verify-release and npm ci
compatibility needs quality
publish needs compatibility
publish command is npm publish --provenance --access public
publish permissions include id-token: write and contents: read
publish has no NPM_TOKEN
```

同时断言三版本 tag、版本号和 `DSH_CLI_ROOTS` 的精确版本映射存在。

- [ ] **步骤 2：运行静态测试确认失败**

运行：`node --test scripts/verify-workflows.test.mjs --test-name-pattern publish`

预期：因 `.github/workflows/publish.yml` 尚不存在而失败。

- [ ] **步骤 3：实现发布前质量 job**

`publish.yml` 使用完整历史 checkout 和 Node 22.19.0：

```yaml
on:
  push:
    tags:
      - 'v*.*.*'

permissions:
  contents: read
```

质量 job 执行：

```sh
node scripts/verify-release.mjs "$GITHUB_REF_NAME"
npm ci
npm run build
npm run typecheck
npm run typecheck:test
npm run test:release
npm test
node --check lib/index.js
node --check lib/client.js
npm pack --dry-run
npm audit --audit-level=high
git diff --check
```

在发布前通过 `npm view @hytime/dsh-thinking-effort@${PACKAGE_VERSION} version --json` 检查重复版本；查询成功表示版本已存在并立即失败，只有 registry 返回不存在时继续。该步骤不打印 token。

- [ ] **步骤 4：实现三版本兼容 job**

兼容 job 在 runner 临时目录创建三个独立 checkout：

```text
alpha: dsh-v0.1.2-alpha.1
rc2:   dsh-v0.1.1-rc.2
rc7:   dsh-v0.1.0-rc.7
```

每个 checkout 执行 `corepack enable`、`pnpm install --frozen-lockfile --ignore-scripts` 和 `pnpm run build`。安装 Chromium 后设置 `CHROME_PATH` 为 runner 上可执行的 Chromium 路径，确保插件测试能完成真实 DOM 检查。

兼容 job 运行：

```sh
DSH_LOADER_INTEGRATION=1 \
DSH_CLI_ROOTS="$ALPHA_ROOT,$RC2_ROOT,$RC7_ROOT" \
DSH_REQUIRE_THINKING_EFFORT_DOM=1 \
npm test -- tests/loader-composition.test.ts
```

该测试必须通过对应 DSH 的官方 `dsh plugin` 命令安装当前 tarball，验证真实 Web bundle route、Settings RPC/bridge、Slot/Locale、AgentLoop、DOM 和 cleanup。job 使用 `trap`/workflow `if: always()` 清理 checkout、home、profile、tarball、Chromium 缓存和子进程；不得上传测试内容 artifact。

- [ ] **步骤 5：实现 tag/main 祖先和发布 job**

在发布 job 前检查：

```sh
git fetch --no-tags origin main
git merge-base --is-ancestor "$GITHUB_SHA" origin/main
```

发布 job 只在质量和兼容 job 成功后执行：

```yaml
permissions:
  contents: read
  id-token: write
```

并使用 setup-node 的 npm registry 配置执行：

```sh
npm publish --provenance --access public
```

不使用 `NPM_TOKEN`，不回退长期 token。使用 concurrency group `npm-publish-${{ github.ref_name }}`，同一 tag 不并发。

- [ ] **步骤 6：同步发布维护文档**

在 README/INSTALL 四语中说明：

- 发布者先更新 package version、CHANGELOG 并创建 `v<version>` tag；
- tag 必须指向 main 历史；
- npm 包设置必须绑定 GitHub Trusted Publisher：仓库 `hytime/dsh-thinking-effort`、workflow `publish.yml`；
- 发布包含 provenance，不需要 `NPM_TOKEN`；
- 发布前会构建 alpha、rc2、rc7 并运行真实兼容测试；
- workflow 不自动修改版本或 CHANGELOG。

- [ ] **步骤 7：运行发布 workflow 静态检查**

运行：

```sh
npm run test:release
npm run typecheck
npm run typecheck:test
npm test
npm run build
node --check lib/index.js
node --check lib/client.js
npm pack --dry-run
git diff --check
```

不要在本地执行 `npm publish`，也不要在没有真实 tag 和 npm Trusted Publisher 配置时模拟发布。

- [ ] **步骤 8：Commit**

```sh
git add .github/workflows/publish.yml README.md README.zh.md README.ja.md README.ko.md INSTALL.md INSTALL.zh.md INSTALL.ja.md INSTALL.ko.md scripts/verify-workflows.test.mjs
git commit -m "ci: automate compatibility checks and npm release"
```

---

### 任务 4：最终 workflow 审计与验收

**文件：**
- 修改：`.github/workflows/ci.yml`、`.github/workflows/publish.yml`、`README*.md`、`INSTALL*.md`
- 测试：GitHub Actions 配置静态检查和本地质量命令

- [ ] **步骤 1：检查 workflow 触发隔离**

确认：

```text
ci.yml 不含 npm publish
publish.yml 只响应 v*.*.* tag
普通 CI 没有 id-token: write
publish job 明确 needs quality + compatibility
```

- [ ] **步骤 2：验证 release guard 和三 root 防绕过**

运行：

```sh
node scripts/verify-release.mjs v0.1.11
DSH_LOADER_INTEGRATION=1 DSH_CLI_ROOTS=/tmp/one,/tmp/one,/tmp/one npm test -- tests/loader-composition.test.ts
```

第二条必须在 root distinct/version guard 阶段失败，不能进入 DSH 启动。

- [ ] **步骤 3：运行完整本地验收**

运行：

```sh
npm ci
npm run test:release
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

- [ ] **步骤 4：检查发布 payload 和 secret 隔离**

确认 `npm pack --dry-run` 不包含 `.github`、`.dsh`、settings、session、credentials 或用户配置；workflow YAML 不读取 `~/.dsh`、`SUB2API_API_KEY` 或业务 secrets。

- [ ] **步骤 5：Commit**

```sh
git add .github/workflows README.md README.zh.md README.ja.md README.ko.md INSTALL.md INSTALL.zh.md INSTALL.ja.md INSTALL.ko.md
 git commit -m "ci: finalize automated release checks"
```

---

## 验收标准

1. PR、`main` push 和手动 CI 会运行 Node 22.19.0/24.x 质量矩阵。
2. 干净 runner 使用 `npm ci` 能完成 build、两套 typecheck、release guard、全量测试、产物解析、pack 和 audit。
3. 普通 CI 没有 npm 发布权限，也不执行 publish。
4. `v*.*.*` tag 只有在版本与 `package.json` 一致且 tag commit 位于 `main` 历史时才继续。
5. 发布前通过 alpha、rc2、rc7 三个官方 DSH checkout 的真实兼容测试。
6. 三版本测试强制使用三个互异且版本精确匹配的 DSH root。
7. npm 发布使用 OIDC Trusted Publishing 和 provenance，不使用长期 token。
8. npm 已存在相同版本时发布失败，不覆盖已有版本。
9. 所有临时 DSH checkout、profile、Web 进程和 Chromium 资源在 job 结束前清理。
10. README、INSTALL 和 CHANGELOG 中的当前 CI/CD 说明与两个 workflow、release guard 和 package.json 一致。
11. `package-lock.json` 已提交，`pnpm-lock.yaml` 继续被忽略且不参与 npm CI。
