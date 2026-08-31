## Task 3 发布 workflow 修复报告

### 实现

- 将 `PACKAGE_VERSION` 读取和 `npm view @hytime/dsh-thinking-effort@${PACKAGE_VERSION} version --json` 重复版本门禁放入 `quality` job。
- 重复版本查询仅接受输出包含 `E404` 或 `HTTP 404` 的失败；查询成功或其他失败均退出。`publish` job 不再包含重复检查。
- `publish` job 使用 Node `24.x`，保留 npm registry 配置、OIDC `id-token: write`、provenance publish，并新增 `npm ci` 与 `npm run build`。
- 兼容性集成测试改为后台运行并记录 `DSH_TEST_PID`；trap cleanup 会 kill/wait 该 PID 并删除 `RUN_ROOT`。
- 更新 workflow 结构化测试，覆盖命令归属、Node 版本、重复检查位置、needs/permissions、三组 DSH tag/root、PID cleanup、provenance publish 和无 `NPM_TOKEN`。

### 验证

- `npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm run test:release`：20/20 通过。
- `git diff --check`：通过。
- 未执行本地 `npm publish`。

### 疑虑

- 三版本 DSH checkout、Chromium、真实 DOM 集成测试需要 GitHub Actions runner 环境，本地只验证了 workflow 的 YAML 解析和结构化断言。
- Node `24.x` 的 npm 版本由 `actions/setup-node` 使用的 Node 发行版提供，workflow 未额外安装 npm；预期满足 npm >=11.5.1。

### 本轮验证

- `npm run test:release`：20/20 通过。
- `git diff --check`：通过。
- 未执行本地 `npm publish`。

### 用户复核记录

- 用户独立执行 `npm run test:release`：20/20 通过。

### 提交记录

- 本轮测试已通过，准备提交 `.github/workflows/publish.yml` 与 `scripts/verify-workflows.test.mjs`。

### 第 2 轮修复验证

- `npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm run test:release`：22/22 通过。
- `npm run typecheck`：通过，退出码 0。
- `npm run typecheck:test`：通过，退出码 0。
- YAML 解析 cleanup 步骤并将 GitHub expressions 替换为普通路径后执行 `bash -n`：通过，退出码 0。
- `git diff --check`：通过，退出码 0。
- 未执行 `npm publish`。

### 第 2 轮疑虑

- 本地未运行 GitHub Actions runner 上的三版本 DSH checkout、Chromium 和真实 DOM 兼容性集成测试；本轮验证覆盖 YAML 解析、cleanup shell 语法、结构断言和类型检查。
- 未修改 `src/lib/cordis.patch.yml`、版本文件或 CHANGELOG。
