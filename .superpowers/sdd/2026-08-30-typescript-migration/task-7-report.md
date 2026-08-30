# 任务 7 验收报告

## 状态

- 状态：实现完成，等待提交。
- 提交前 HEAD：`179ab37c4cde05f0f081ffc3ad34c26ebc7e6eb8`。
- 目标版本：`0.1.11`。
- 本次修改：`tests/loader-composition.test.ts`，以及 4 份 README、4 份 INSTALL、3 份 CHANGELOG。
- 未发布 npm，未推送 GitHub，未启动替代 3080 服务。

## 本地测试与 TDD 记录

1. 基线 loader 测试：

   ```text
   npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
   ✓ 1 test
   ```

   基线仅有 manifest 静态断言，未覆盖真实 profile 安装、组合树、marker 或浏览器 bundle。

2. 基线发布视图：

   ```text
   npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm pack --dry-run
   @hytime/dsh-thinking-effort@0.1.11
   filename: hytime-dsh-thinking-effort-0.1.11.tgz
   total files: 39
   ```

3. 新增测试第一次 opt-in 红灯：

   ```text
   DSH_LOADER_INTEGRATION=1 DSH_CLI_ROOT=/Volumes/hydisk/deepseek-harness npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
   FAIL: expected false to be true
   ```

   原因是把 `--dump-default-config` 错误地假设为会创建 `$DSH_HOME/profiles/node_modules` fallback。官方 dump 是 boot-free，不负责该目录；测试已改为验证 profile dependency 和已安装包。

4. 新增测试第二次红灯：

   ```text
   DSH_LOADER_INTEGRATION=1 DSH_CLI_ROOT=/Volumes/hydisk/deepseek-harness npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
   FAIL: ENOENT .../thinking-effort-loaded.json
   ```

   原因是 marker 路径在 Host 模块首次加载时读取 `DSH_HOME`，同一 Vitest 进程没有临时 home。测试已改为用子进程设置 `DSH_HOME` 后加载构建 Host entry 并调用 `apply`。

5. 修正后的真实 loader 测试：

   ```text
   DSH_LOADER_INTEGRATION=1 DSH_CLI_ROOT=/Volumes/hydisk/deepseek-harness npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
   ✓ 2 tests
   ```

   测试通过官方 `pnpm dsh plugin --profile compat add <tarball>` 安装到 mkdtemp 临时 home，断言 scoped dependency、无独立旧包名、`id: thinking-effort`、scoped composition name、安装包名/版本、Host/Client built entry、Host marker，以及临时 HTTP bundle URL 的 HTTP 200/字节一致和 `__ModuleLoader__.load` 注册 ID。

6. 兼容 focused tests：

   ```text
   npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/client-helpers.test.ts tests/compat.test.ts tests/host.test.ts tests/loader-composition.test.ts
   Test Files 4 passed
   Tests 42 passed | 1 skipped
   ```

   覆盖 legacy Settings describe/mutate、modern direct result、无 Remote 时不创建 Settings API、ja/ko external language capability gating、版本 metadata/能力探测、未知版本策略和全局 Host `agent/request` hook。

## alpha 回归

目标：`/tmp/dsh-thinking-effort-alpha`，官方 checkout：`/Volumes/hydisk/deepseek-harness`。执行前检查显示目标 home/profile 不存在；官方 checkout 原有未跟踪 `apps/web/thinking-effort-loaded.json` 和 `thinking-effort-loaded.json`，未修改。

1. 打包目录首次不存在：

   ```text
   npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm pack --pack-destination /tmp/dsh-thinking-effort-pack
   exit code: 254
   ENOENT: .../tmp/dsh-thinking-effort-pack/hytime-dsh-thinking-effort-0.1.11.tgz
   ```

   随后只创建临时目录并重跑：

   ```text
   mkdir -p /tmp/dsh-thinking-effort-pack
   npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm pack --pack-destination /tmp/dsh-thinking-effort-pack
   @hytime/dsh-thinking-effort@0.1.11
   total files: 39
   ```

2. 官方安装命令：

   ```text
   DSH_HOME=/tmp/dsh-thinking-effort-alpha pnpm dsh plugin --profile compat add /tmp/dsh-thinking-effort-pack/hytime-dsh-thinking-effort-0.1.11.tgz
   dependencies:
   + @hytime/dsh-thinking-effort file:/tmp/dsh-thinking-effort-pack/hytime-dsh-thinking-effort-0.1.11.tgz
   dsh: initialized profile compat at /tmp/dsh-thinking-effort-alpha/profiles/compat
   ```

3. 官方组合 dump：

   ```text
   DSH_HOME=/tmp/dsh-thinking-effort-alpha pnpm dsh --profile compat --dump-default-config
   # == @hytime/dsh-thinking-effort
   - id: thinking-effort
     name: '@hytime/dsh-thinking-effort'
   ```

   实际捕获文件 `/tmp/dsh-pi-effort-alpha-dump.yaml` 的第 339–341 行为上述结果；输出中无 `name: dsh-thinking-effort`。

4. Host 启动验证：

   ```text
   DSH_HOME=/tmp/dsh-thinking-effort-alpha DSH_TELEMETRY_DISABLED=1 timeout 20s pnpm dsh --profile compat --help
   exit code: 124
   ```

   `compat` 只有 base/plugin 组合，没有 one-shot app；外部 timeout 用于结束无 app 的持续进程。随后确认 `/tmp/dsh-thinking-effort-alpha/thinking-effort-loaded.json` 已生成，证明 Host apply marker 写入临时 home。

5. 既有 3080 只读刷新：

   ```text
   curl -sS -o /tmp/dsh-pi-effort-3080-index.txt -w 'HTTP %{http_code} bytes %{size_download}\\n' http://127.0.0.1:3080/
   HTTP 401 bytes 68
   ```

   没有修改既有 3080 的 profile，也没有启动替代服务器；由于该服务未返回页面，未声称完成 GUI 页面 smoke。

## rc2 回归

目标：`/tmp/dsh-compat-home-rc2`，官方 checkout：`/tmp/dsh-compat-dsh-v0.1.1-rc.2`。执行前检查确认 home/profile 已存在；rc2 checkout 工作树干净。

1. 通过旧版官方命令安装同一个 tarball：

   ```text
   DSH_HOME=/tmp/dsh-compat-home-rc2 pnpm dsh plugin --profile web add /tmp/dsh-thinking-effort-pack/hytime-dsh-thinking-effort-0.1.11.tgz
   dependencies:
   + @hytime/dsh-thinking-effort file:/tmp/dsh-thinking-effort-pack/hytime-dsh-thinking-effort-0.1.11.tgz
   ```

2. profile 实际 manifest（由官方 CLI 维护）包含：

   ```json
   {
     "dependencies": {
       "@hytime/dsh-thinking-effort": "file:/tmp/dsh-thinking-effort-pack/hytime-dsh-thinking-effort-0.1.11.tgz"
     },
     "bundles": [
       "@deepseek-ai/dsh-base",
       "@deepseek-ai/dsh-web-app",
       "@hytime/dsh-thinking-effort"
     ]
   }
   ```

   没有旧包名依赖。`/tmp/dsh-pi-effort-rc2-dump.yaml` 第 504–506 行确认：

   ```text
   # == @hytime/dsh-thinking-effort
   - id: thinking-effort
     name: '@hytime/dsh-thinking-effort'
   ```

3. rc2 Web/Host 启动：先删除临时 home 中旧 marker，再使用官方命令和随机端口：

   ```text
   rm -f /tmp/dsh-compat-home-rc2/thinking-effort-loaded.json && DSH_HOME=/tmp/dsh-compat-home-rc2 DSH_TELEMETRY_DISABLED=1 timeout 20s pnpm dsh --profile web --no-open --port 0
   dsh web: http://127.0.0.1:55771
   exit code: 124
   ```

   timeout 后 marker 更新为：`event: apply`、PID `88035`，证明 rc2 profile 实际加载 scoped Host entry。随机端口进程已结束，之后探测返回 `HTTP 502 bytes 0`，不是应用失败证据。

4. rc2 checkout 最终 `git status --short --branch` 仍为空变更。

5. legacy Settings API、无 Remote 不 PENDING、ja/ko 过滤和 Host hook 的可重复断言由本项目 focused tests 覆盖，命令和结果见上方“兼容 focused tests”。

## 最终验证梯子

```text
npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm run build
locale parity OK: zh, en, ja, ko
Build complete: lib/index.js 8.49 kB, lib/client.js 79.42 kB

npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test
Test Files 7 passed (7)
Tests 56 passed | 1 skipped (57)

npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm run typecheck
exit code 0

node --check lib/index.js && node --check lib/client.js
exit code 0

npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm pack --dry-run
@hytime/dsh-thinking-effort@0.1.11
filename: hytime-dsh-thinking-effort-0.1.11.tgz
total files: 39

 git diff --check
exit code 0
```

默认跳过 1 个真实 DSH loader test 是有意设计：只有设置 `DSH_LOADER_INTEGRATION=1` 并提供 `DSH_CLI_ROOT` 才运行外部 DSH CLI，避免 `npm test` 对本地服务、profile 或 3080 产生无条件依赖。构建后显式 opt-in 已通过（2 tests）。

## 文档同步

- `README.md`、`README.zh.md`、`README.ja.md`、`README.ko.md`：当前版本示例更新为 `0.1.11`；补充 `lib/index.js` / `lib/client.js` 入口、源码开发先运行 `npm run build`、metadata 优先/能力探测回退、legacy/modern Settings、未知版本策略。
- `INSTALL.md`、`INSTALL.zh.md`、`INSTALL.ja.md`、`INSTALL.ko.md`：当前安装、版本和 watermark 更新为 `0.1.11`，补充相同运行入口和兼容策略。
- `CHANGELOG.md`、`CHANGELOG.ja.md`、`CHANGELOG.ko.md`：新增 `0.1.11`，明确 TS/build migration，行为和 Settings 数据格式保持兼容。

## 跳过项与疑虑

- 未处理任务 2/5/6 已记录的 minor deferred 测试项。
- 没有对既有 3080 服务做写操作；其只读根路径返回 401，因此没有 GUI 页面断言。
- alpha `compat --help` 和 rc2 随机端口启动均由外部 timeout 结束；两次都已用 marker 验证 Host apply。alpha profile 没有 one-shot app，rc2 Web 随机端口启动成功并输出 URL。
- alpha/rc2 的 legacy/modern Settings 行为不由 profile dump 暴露，使用本项目真实实现的 focused tests 验证，且这些测试全部通过。
- 工作树中保留用户已有的未跟踪文件（若存在）：`docs/68d52d9f-5742-4164-9685-6b9e7f5a86e9.png`、`docs/94d15cfd-3ff0-4695-ac9f-c10cb578b500.png`、`thinking-effort-loaded.json`；未加入提交。

## Fix round 1：审查发现修复与复验

### 1. 真实 loader route 与 scoped marker

- 先运行原有 opt-in：

  ```text
  DSH_LOADER_INTEGRATION=1 DSH_CLI_ROOT=/Volumes/hydisk/deepseek-harness npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
  ✓ 2 tests
  ```

  原测试虽然通过，但 HTTP server 是测试自行创建并原样回送本地 `lib/client.js`，不能证明 DSH route。
- TDD 红灯：加入真实 marker identity 断言后，旧产物返回 `{ event: "apply", at, pid }`，缺少 `name`；修复前断言失败。随后在 `src/host/marker.ts` 增加 `name: '@hytime/dsh-thinking-effort'`，保留 `event`、`at`、`pid`，构建同步更新 `lib/index.js` 与 marker 类型产物。
- TDD 红灯：将自建 server 替换为真实 DSH 进程后，直接 `/plugins/@hytime/dsh-thinking-effort/client.js` 返回 HTTP 404。根因是当前 alpha 官方实现广告并服务 `/plugins/??<id>/client.js&rev=...` combo route；旧 rc2 实现广告并服务 `/plugins/<id>/client.js?rev=...` direct route。测试现读取实际页面的 `globalThis["__DSH_BOOT__"]`，请求页面广告的实际 URL，并兼容两种官方 route 形态；不再创建测试 HTTP server。
- 真实测试通过官方 `dsh plugin` 命令安装本包 tarball 到随机临时 home/profile，启动官方 `web --no-open --port 0`，完成 alpha token exchange 或 rc2 无 token 页面访问，断言页面真实 route HTTP 200、响应含 scoped loader id，并在 VM 中执行响应确认 `__ModuleLoader__.load` 注册 id 和 factory。npm `pack --json` 的 basename/绝对路径差异也已覆盖。

### 2. alpha 真实 DSH 回归与 Client/Settings 证据

目标 checkout：`/Volumes/hydisk/deepseek-harness`，未修改其工作树；临时 home：`/tmp/dsh-pi-effort-alpha-fix1`（已清理）。

```text
npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm pack --pack-destination /tmp/dsh-pi-effort-pack-fix1
@hytime/dsh-thinking-effort@0.1.11
filename: hytime-dsh-thinking-effort-0.1.11.tgz
npm notice total files: 39

DSH_HOME=/tmp/dsh-pi-effort-alpha-fix1 pnpm dsh plugin --profile web add /tmp/dsh-pi-effort-pack-fix1/hytime-dsh-thinking-effort-0.1.11.tgz
+ @hytime/dsh-thinking-effort file:/tmp/dsh-pi-effort-pack-fix1/hytime-dsh-thinking-effort-0.1.11.tgz

dsh --profile web --dump-default-config
- id: thinking-effort
  name: '@hytime/dsh-thinking-effort'
```

官方 alpha Web 启动命令为：

```text
DSH_HOME=/tmp/dsh-pi-effort-alpha-fix1 DSH_TELEMETRY_DISABLED=1 pnpm dsh --profile web --no-open --port 0
dsh web: http://127.0.0.1:60560/?token=...
```

用 token exchange 后抓取真实页面：`curl -L ...` 返回 `HTTP 200 bytes 24494`；直接未 revision route 返回 `HTTP 404`（符合 alpha 官方 route 设计）。从真实页面 `__DSH_BOOT__` 读取 `/plugins/??@hytime/dsh-thinking-effort/client.js&rev=a864effacd04c4ae-33`，实际请求结果：

```json
{
  "status": 200,
  "bytes": 75280,
  "loaderId": true,
  "remoteSettings": true,
  "settingsSection": true,
  "japanese": true,
  "korean": true
}
```

这证明 alpha 的真实页面广告、实际 bundle route、modern `remote.settings`、`settings.section` 和语言包相关 bundle 均已加载。浏览器级 DOM 点击验收尝试使用官方 `apps/web` 的 Playwright，但环境缺少 Chromium executable（`browserType.launch: Executable doesn't exist ... ms-playwright/chromium_headless_shell...`）；未安装浏览器，报告将此项标记为 BLOCKED，未用 mock focused test 冒充。

最终 alpha opt-in：

```text
DSH_LOADER_INTEGRATION=1 DSH_CLI_ROOT=/Volumes/hydisk/deepseek-harness npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
[DSH loader integration] /Volumes/hydisk/deepseek-harness http://127.0.0.1:63441/
✓ tests/loader-composition.test.ts (2 tests)
Tests 2 passed
```

进程已终止；临时 alpha home、pack 目录和 curl/Playwright 证据文件已清理，未接触既有 `http://127.0.0.1:3080`。

### 3. rc2 真实 DSH 回归

目标 checkout：`/tmp/dsh-compat-dsh-v0.1.1-rc.2`，工作树检查保持干净；opt-in 通过旧版官方命令创建临时 profile、安装同一 `0.1.11` tarball，启动旧版 Web。最终结果：

```text
DSH_LOADER_INTEGRATION=1 DSH_CLI_ROOT=/tmp/dsh-compat-dsh-v0.1.1-rc.2 npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
[DSH loader integration] /tmp/dsh-compat-dsh-v0.1.1-rc.2 http://127.0.0.1:63483/
✓ tests/loader-composition.test.ts (2 tests)
Tests 2 passed
```

rc2 页面实际广告 `/plugins/@hytime/dsh-thinking-effort/client.js?rev=...`，HTTP 200，响应 loader id 和执行注册断言通过；临时 home/进程由测试 finally 清理，未修改 rc2 checkout 或既有 profile。

### 4. rc7 BLOCKED

官方历史 tag 已确认：`dsh-v0.1.0-rc.7`，commit `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`。按要求尝试从官方 checkout 创建独立 worktree：

```text
git worktree add --detach /tmp/dsh-compat-dsh-v0.1.0-rc.7 dsh-v0.1.0-rc.7
fatal: could not create directory of '.git/worktrees/dsh-compat-dsh-v0.1.0-rc.7': Operation not permitted
[sandbox: file access denied under workspace-write mode]
exit code 128
```

当前 delegated sandbox 不允许向 `/Volumes/hydisk/deepseek-harness/.git/worktrees` 写入，且 approval prompts disabled，不能扩大权限；没有用 `git archive`、手工 checkout、自建 HTTP server 或修改官方 checkout 冒充 rc7 回归。因此 rc7 官方命令安装、profile dump、marker、Web route/legacy 兼容验收为 **BLOCKED**，无 rc7 worktree/home 可清理。主 agent 需在有权限的执行上下文重试该精确命令并记录结果。

### 5. 文档与最终检查

全语言 Markdown 搜索 `src/client.js` / `src/host.mjs` 后仅发现 `INSTALL.zh.md:222` 的过时入口，已改为已构建的 `lib/client.js`；复查无残留。

本轮最终检查：

```text
npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test
Test Files 7 passed (7)
Tests 56 passed | 1 skipped (57)

npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm run build
locale parity OK: zh, en, ja, ko
Build complete: lib/index.js 8.53 kB, lib/client.js 79.42 kB

npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm run typecheck
exit code 0

node --check lib/index.js && node --check lib/client.js
exit code 0

npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm pack --dry-run
@hytime/dsh-thinking-effort@0.1.11
filename: hytime-dsh-thinking-effort-0.1.11.tgz
total files: 39

git diff --check
exit code 0
```

最终改动文件：`src/host/marker.ts`、`lib/index.js`、`lib/types/host/marker.js`、`lib/types/host/marker.js.map`、`tests/loader-composition.test.ts`、`INSTALL.zh.md`。已创建单一 commit `9341f1b`（`fix: validate real DSH loader route compatibility`）；rc7 官方回归与浏览器 DOM 验收仍分别为 BLOCKED，详见上文。

## Fix round 2：真实 Settings 通道与启动失败清理

### 状态

- 状态：**部分完成；仍有明确 BLOCKED 子项，不能声称任务 7 完成**。
- 本轮修改仅为 `tests/loader-composition.test.ts`；未修改官方 `/Volumes/hydisk/deepseek-harness`，未发布 npm，未推送 GitHub，未启动替代 `3080`。
- 保留 marker 的 `event`、`at`、`pid`，并继续断言 scoped `name: '@hytime/dsh-thinking-effort'`；未回滚 INSTALL.zh 的 `lib` 入口修复。

### TDD 与 cleanup 修复

1. 先运行当前测试并加入失败路径断言。新测试首次失败：token exchange 失败后子进程没有终止，`child-state` 不存在。
2. `startOfficialWeb()` 现在接受仅供测试启动替身使用的命令参数；URL 等待、token exchange、成功返回和显式 `stop()` 共用幂等的 SIGTERM + exit wait。启动 URL、token exchange、页面 index、bundle 和 RPC 请求均带 `AbortSignal.timeout(10000)`；URL 等待失败也清理 timer 和子进程。
3. cleanup 回归转绿：

   ```text
   npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts -t 'stops and waits'
   ✓ 1 test (2 skipped)
   ```

4. 真实测试内部的 page/bundle 请求均处于 `try/finally`，页面请求失败时等待 `web.stop()`。本轮手工探查曾发现 6 个 rc7 临时进程（PID 7649、7678、92439、92475、95857、95893），已 SIGTERM；随后 `pgrep -fl 'apps/cli|dsh --profile web|node.*dsh'` 无输出。临时 rc7 archive、runtime home、pack、手工 HTML/log 目录均已删除。

### alpha：真实 Settings/Client/Host 通道

目标官方 checkout：`/Volumes/hydisk/deepseek-harness`；随机临时 home/profile 由官方 `pnpm dsh plugin --profile web add <tarball>` 创建并在测试 finally 删除。

```text
DSH_LOADER_INTEGRATION=1 DSH_CLI_ROOT=/Volumes/hydisk/deepseek-harness npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
[DSH loader integration] /Volumes/hydisk/deepseek-harness http://127.0.0.1:51928/
✓ tests/loader-composition.test.ts (3 tests)
Tests 3 passed
```

本轮测试从真实页面读取 `__DSH_BOOT__`，请求实际 alpha combo bundle route，并通过认证的真实 HTTP RPC transport 调用 `settings/describe` 和 `settings/mutate`（空 ops，无配置副作用）。结果均 HTTP 200、`server-response.result.ok: true`；同一真实响应分别交给实际 `settingsBridge` modern 分支（`remote.settings`）并完成 describe/mutate，返回有效 `ClientResult`。真实页面/served bundle 仍断言 `@hytime/dsh-thinking-effort` loader id 和 module factory。

alpha 的 locale capability gating（`addLanguage` 对 ja/ko 的运行时显隐）、`settings.section` 实际挂载渲染，以及真实 Agent turn 中 `agent/request` hook 的执行仍为 **BLOCKED**：当前环境没有可用 Chromium，且没有无 key、可观测的官方 Agent 请求入口。页面 boot/bundle 字符串和 mock focused tests 不能作为这些子项的版本证据，故未声称通过。

### rc2：真实 legacy Settings/Client/Host 通道

```text
DSH_LOADER_INTEGRATION=1 DSH_CLI_ROOT=/tmp/dsh-compat-dsh-v0.1.1-rc.2 npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
[DSH loader integration] /tmp/dsh-compat-dsh-v0.1.1-rc.2 http://127.0.0.1:51968/
✓ tests/loader-composition.test.ts (3 tests)
Tests 3 passed
```

rc2 通过旧版官方 `settings.describe` / `settings.mutate` dot endpoint 和 legacy HTTP envelope（`payload` 直接承载请求对象）完成真实 describe/空 ops mutate；随后将真实 RPC 结果按旧版 `connection.api.settings` 的 `{ result: ... }` 形状交给实际 `settingsBridge` legacy 分支，describe/mutate 均返回有效 `ClientResult`。实际旧版 Web bundle direct route、scoped loader id、Host marker 也通过。

rc2 的 locale capability gating、`settings.section` 实际页面挂载和真实 `agent/request` 执行同样为 **BLOCKED**，原因与 alpha 相同；focused mock tests 不计作版本证据。

### rc7：精确历史源码与真实回归

先按要求尝试 worktree，官方 git metadata 写入仍被 sandbox 拒绝：

```text
git worktree add --detach /tmp/dsh-compat-dsh-v0.1.0-rc.7 dsh-v0.1.0-rc.7
fatal: could not create directory of '.git/worktrees/dsh-compat-dsh-v0.1.0-rc.7': Operation not permitted
exit code 128
```

随后 archive fallback 成功，没有修改官方 checkout：

```text
git -C /Volumes/hydisk/deepseek-harness archive dsh-v0.1.0-rc.7 | tar -x -C /tmp/dsh-compat-dsh-v0.1.0-rc.7
git -C /Volumes/hydisk/deepseek-harness rev-parse dsh-v0.1.0-rc.7
99f6f02fecdb7dff40c3fbc9470f5907c29f74ca
```

在 `/tmp/dsh-compat-dsh-v0.1.0-rc.7` 执行 `npm_config_cache=/tmp/dsh-pi-effort-npm-cache pnpm install --frozen-lockfile --ignore-scripts` 成功（925 packages）；`pnpm run build` 成功。通过 rc7 自己的官方命令安装同一 tarball 并 dump profile，输出含：

```text
- id: thinking-effort
  name: '@hytime/dsh-thinking-effort'
```

真实 rc7 回归首次暴露其 CLI 不支持现代 `--no-open`，改用 rc7 官方支持的 `--port 0` 后，历史 `window.__DSH_BOOT__` 语法、legacy direct bundle route、legacy `settings.describe` / `settings.mutate` RPC envelope、实际 legacy bridge、marker 和 loader 全部通过：

```text
DSH_LOADER_INTEGRATION=1 DSH_CLI_ROOT=/tmp/dsh-compat-dsh-v0.1.0-rc.7 npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
[DSH loader integration] /tmp/dsh-compat-dsh-v0.1.0-rc.7 http://127.0.0.1:51863/
✓ tests/loader-composition.test.ts (3 tests)
Tests 3 passed
```

rc7 的 locale gating、settings section 实际渲染和真实 Agent request hook 仍为 **BLOCKED**，同样没有用 mock focused tests 冒充版本证据。rc7 archive、profile、pack 和运行进程已清理；官方 checkout 未写入。

### 本轮最终验证

```text
npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm run build
locale parity OK: zh, en, ja, ko
Build complete: lib/index.js 8.53 kB, lib/client.js 79.42 kB

npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test
Test Files 7 passed (7)
Tests 57 passed | 1 skipped (58)

npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm run typecheck
exit code 0

node --check lib/index.js && node --check lib/client.js
exit code 0

npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm pack --dry-run
@hytime/dsh-thinking-effort@0.1.11
filename: hytime-dsh-thinking-effort-0.1.11.tgz
total files: 39

git diff --check
exit code 0
```

上述普通 `npm test` 保持外部 DSH 测试 opt-in；本轮 alpha、rc2、rc7 均显式设置 `DSH_LOADER_INTEGRATION=1` 并完成 3 tests。剩余阻塞仅为无浏览器/无可观测真实 Agent turn 导致的 locale capability gating、settings section 实际渲染和 `agent/request` hook 执行证据缺口；因此任务 7 状态必须继续标为 **BLOCKED**，不能写成完成。

### 最终三版本重跑与清理

在 marker 断言和 envelope 修正后的当前工作树上再次显式运行：

```text
alpha: DSH_CLI_ROOT=/Volumes/hydisk/deepseek-harness
[DSH loader integration] ... http://127.0.0.1:53163/
✓ tests/loader-composition.test.ts (3 tests)
Tests 3 passed

rc2: DSH_CLI_ROOT=/tmp/dsh-compat-dsh-v0.1.1-rc.2
[DSH loader integration] ... http://127.0.0.1:53200/
✓ tests/loader-composition.test.ts (3 tests)
Tests 3 passed

rc7: DSH_CLI_ROOT=/tmp/dsh-compat-dsh-v0.1.0-rc.7
[DSH loader integration] ... http://127.0.0.1:53225/
✓ tests/loader-composition.test.ts (3 tests)
Tests 3 passed
```

三次测试的 `finally` 均调用并等待 `web.stop()`；重跑后 `pgrep -fl 'apps/cli|dsh --profile web|node.*dsh'` 无输出。随后删除 `/tmp/dsh-compat-dsh-v0.1.0-rc.7`、`/tmp/dsh-pi-effort-rc7-home`、`/tmp/dsh-thinking-effort-pack-fix2` 和 `/tmp/dsh-pi-effort-rc7-manual`，逐项 `test ! -e` 通过。

## Fix round 3：真实 Client runtime gating 与有界 cleanup

### 状态

- 状态：**部分完成；真实页面渲染与真实 Agent request 仍 BLOCKED，不能声称任务 7 完成**。
- 本轮修改：`tests/loader-composition.test.ts`、`src/client/index.ts`、`src/client/settings-bridge.ts`、`src/client/types.ts`，以及对应 `lib` 构建产物。
- 未发布 npm，未推送 GitHub，未启动替代 `3080`，未修改 `/Volumes/hydisk/deepseek-harness` 或历史 DSH checkout。
- commit：本轮所有改动组成一个最终提交；最终 hash 以提交后的 `git rev-parse HEAD` 为准，并在最终回执中同步。

### TDD cleanup 证据

1. 先加入失败路径测试再实现。旧实现的红灯结果：

   ```text
   npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
   2 failed:
   - close descendant: stop returned after 3ms instead of waiting for close
   - ignored SIGTERM: child was still alive after the 1000ms test bound
   ```

   spawn error 也证明不能只等待 `exit`；该路径在旧实现中依赖未必发生的 exit 事件。

2. 当前 `startOfficialWeb()` 的 stop 为幂等 Promise：`error` 事件立即 settle spawn failure；`exit` 只记录进程退出，正常 cleanup 等待 `close`；SIGTERM 后使用明确 timeout，超时发送 SIGKILL，再有界等待 settle。token exchange、URL 等待、child error/exit、close descendant 和 caller 的重复 stop 都由测试覆盖。

3. cleanup 回归转绿：

   ```text
   npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
   Test Files 1 passed
   Tests 5 passed | 1 skipped
   ```

   close fixture 的后代进程持有 stdout 直到完成标记，stop 等待 close 后才返回；幂等断言确认两次 stop 返回同一 Promise；SIGTERM ignored fixture 在 timeout 后由 SIGKILL 终止。测试 finally 清理 child marker/temp directory。

### 真实 alpha/rc2/rc7 Client runtime

测试使用当前工作树 `lib/client.js` 打包产物，经官方 DSH CLI 安装到临时 profile，从真实 Web 页面读取并执行实际 loader factory；随后在每个官方 checkout 中创建真实 Cordis `Context`，加载官方 Slot/Locale runtime，并让产品 client `apply` 直接运行。没有手工 fake Context。

- alpha：

  ```text
  DSH_LOADER_INTEGRATION=1 DSH_CLI_ROOT=/Volumes/hydisk/deepseek-harness npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
  Test Files 1 passed; Tests 6 passed
  ```

  真实 alpha Web route、scoped loader、modern settings RPC/bridge、实际 `settings.section` ledger registration 通过；官方 LocaleRuntime 提供 `addLanguage` 时，modern settings capability 实际注册 ja/ko，legacy capability 实际不注册 ja/ko。此前源码只按 `locale.addLanguage` 判断，导致 legacy 也注册语言；本轮真实 probe 暴露并修复为“modern transport capability 与真实 addLanguage 方法的交集”。

- rc2：

  ```text
  DSH_LOADER_INTEGRATION=1 DSH_CLI_ROOT=/tmp/dsh-compat-dsh-v0.1.1-rc.2 npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
  Test Files 1 passed; Tests 6 passed
  ```

  真实 rc2 direct route、legacy settings RPC/bridge、scoped loader、实际 SlotRegistry 的 `thinking-effort` registration 通过。rc2 官方 LocaleRuntime 没有 `addLanguage`，probe 明确记录该真实能力缺失，因此 modern/legacy 均不注册 ja/ko；没有把不存在的能力写成通过。

- rc7：精确 tag `dsh-v0.1.0-rc.7`（commit `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`）先用 archive fallback 创建独立 `/tmp/dsh-compat-dsh-v0.1.0-rc.7`，官方依赖安装和 build 成功；随后：

  ```text
  DSH_LOADER_INTEGRATION=1 DSH_CLI_ROOT=/tmp/dsh-compat-dsh-v0.1.0-rc.7 npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test -- tests/loader-composition.test.ts
  Test Files 1 passed; Tests 6 passed
  ```

  真实 rc7 legacy route、settings RPC/bridge、scoped loader 和 SlotRegistry `thinking-effort` registration 通过。其 LocaleRuntime 的外部语言能力按 probe 实际结果判定，未对缺失 `addLanguage` 的历史 runtime 作过度断言。

三次 final opt-in 均含 cleanup 测试和真实 loader/runtime probe，各 6/6 passed。probe 只证明 `settings.section` slot registration/挂载到真实 SlotRegistry，不证明浏览器 DOM 渲染；当前环境无 Chromium executable，真实页面交互与 DOM render 仍 **BLOCKED**，没有用 bundle 字符串或 mock focused test 冒充。

### 真实 Agent runtime 尝试与 BLOCKED 证据

已在 alpha 官方 checkout 的真实 runtime 中尝试：Cordis `Context`、官方 TimerService、LlmRuntime、SessionStore、SystemPrompt、ToolRuntime、AgentRegistry、AgentLoop，以及允许的自定义 `LlmAdapter` boundary 均实际装配；agent session header 设置为 `origin: subagent`，产品构建后的 Host `apply` 也实际注册全局 `agent/request` hook。结果：

```text
real AgentLoop setup: succeeded
session origin: subagent
session events: agent/inbox/spliced, turn/start, agent/inbox/spliced,
  step/start, user/message, step/end, turn/end
mock adapter requests: 0
request header: undefined
```

没有 keyless、可观测的官方 Agent turn 入口能让该历史运行时进入真实 LLM request；因此 alpha/rc2/rc7 的真实 `agent/request` hook 执行仍 **BLOCKED**。当前产品 focused host tests 的 callback 断言不计作版本证据。

### 最终验证与资源清理

```text
npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm run build
locale parity OK: zh, en, ja, ko
Build complete: lib/index.js 8.53 kB, lib/client.js 79.54 kB

npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm test
Test Files 7 passed (7)
Tests 60 passed | 1 skipped (61)

npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm run typecheck
exit code 0

node --check lib/index.js && node --check lib/client.js
exit code 0

npm_config_cache=/tmp/dsh-pi-effort-npm-cache npm pack --dry-run
@hytime/dsh-thinking-effort@0.1.11
filename: hytime-dsh-thinking-effort-0.1.11.tgz
total files: 39

git diff --check
exit code 0
```

三版本测试各自 finally 等待并停止 Web child；随后执行：

```text
no matching DSH processes
rc7 archive removed
```

临时 alpha/rc2/rc7 profiles、Web homes、pack directories 由测试 finally 删除；本轮 rc7 archive `/tmp/dsh-compat-dsh-v0.1.0-rc.7` 已删除。官方 alpha checkout 和 rc2 checkout 工作树保持未修改；既有 `http://127.0.0.1:3080` 未写入或替换。npm cache 按用户指定保留为 `/tmp/dsh-pi-effort-npm-cache`，未把临时包加入仓库。

剩余问题：无 Chromium 时真实 settings 页面 DOM render 仍 BLOCKED；无 keyless/可观测官方 Agent turn 时真实 `agent/request` 执行仍 BLOCKED；前序任务 2/5/6 minor deferred 保持不处理。

