# 设置页版本水印实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 在插件设置页右下角显示当前版本，并让整个插件设置页根据 DSH 当前 locale 在中文和英文之间切换；版本号与 npm 包、CHANGELOG 和 DSH 插件列表保持一致。

**架构：** 客户端手写 bundle 注册 `settings.thinkingEffort` locale namespace，提供完整的 `zh`/`en` 字典，并通过 Slot 的 `locale` 注册选项让语言切换自动触发重新渲染。客户端使用明确的 `PLUGIN_VERSION` 常量渲染不可交互的右下角水印；`package.json.version` 作为 npm 和 DSH 插件列表的权威版本，测试静态检查客户端常量与 package 版本一致。Cordis 组合 ID 和设置页 Slot ID 继续使用 `thinking-effort`。

**技术栈：** 原生 JavaScript、React.createElement、DSH `locale` 服务、Node.js `node:test`、npm pack、DSH 官方 `dsh plugin` CLI。

---

## 文件结构

- 修改：`src/client.js`，增加 locale 字典、locale 服务注册、双语渲染、版本常量和设置页水印；不改变 loader、runtime name 或 Slot ID。
- 修改：`test/client-registration.test.mjs`，增加版本一致性、水印样式和中英文文案覆盖回归检查。
- 修改：`package.json`，将版本从 `0.1.4` 升至 `0.1.5`，并保持 `CHANGELOG.md` 在 npm 包白名单中。
- 修改：`CHANGELOG.md`，新增 `0.1.5` 条目，记录水印和版本一致性行为。
- 修改：`README.md`，将固定安装示例更新为 `0.1.5`，说明设置页水印和版本查看入口。
- 修改：`INSTALL.md`，将固定安装/升级示例更新为 `0.1.5`，补充安装后查看插件版本和设置页水印的验证步骤。
- 保留：`docs/superpowers/specs/2026-08-18-settings-version-watermark-design.md`，作为本次实现规格，不再扩展范围。

### 任务 1：先添加失败的版本一致性测试

**文件：**
- 修改：`test/client-registration.test.mjs`

- [ ] **步骤 1：增加 package 版本读取和失败断言**

在测试文件中增加 package JSON 路径和客户端源码读取，新增测试要求：

```js
const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
const REQUIRED_LOCALE_KEYS = [
  'title', 'description', 'subagentTitle', 'providerDefault', 'apply',
  'searchPlaceholder', 'loading', 'noModels', 'noMatches', 'route',
  'customize', 'collapse', 'editorTitle', 'applyLevel', 'restoreDefault',
  'expandedCount', 'versionLabel', 'customEffortRequired', 'readSettingsFailed',
  'writeFailed',
]

function readPackage() {
  return JSON.parse(readFileSync(packagePath, 'utf8'))
}

test('keeps the client version and watermark style tied to package version', () => {
  const pkg = readPackage()
  const source = readFileSync(clientPath, 'utf8')

  assert.ok(source.includes(`const PLUGIN_VERSION = '${pkg.version}'`))
  assert.ok(source.includes("'v' + PLUGIN_VERSION"))
  assert.ok(source.includes("pointerEvents: 'none'"))
})

test('registers balanced Chinese and English dictionaries', () => {
  const source = readFileSync(clientPath, 'utf8')

  assert.ok(source.includes("const LOCALE_NS = 'settings.thinkingEffort'"))
  assert.ok(source.includes('locale.register(LOCALE_NS, { zh, en })'))
  assert.ok(source.includes('locale: LOCALE_NS'))
  for (const key of REQUIRED_LOCALE_KEYS) {
    assert.ok(source.includes(`${key}:`), `missing locale key: ${key}`)
  }
})
```

- [ ] **步骤 2：运行测试确认新测试失败**

运行：

```bash
npm test
```

预期：现有 loader/runtime identity 测试通过，新增版本和 locale 测试失败，因为 `PLUGIN_VERSION`、字典和 locale 注册尚未实现。

### 任务 2：实现设置页版本水印

**文件：**
- 修改：`src/client.js:19` 附近的常量区；增加 `PLUGIN_VERSION = '0.1.5'`。
- 修改：`src/client.js:293` 附近的设置页根容器。

- [ ] **步骤 1：注册 locale namespace 和双语字典**

在常量区加入：

```js
const LOCALE_NS = 'settings.thinkingEffort'
const PLUGIN_VERSION = '0.1.5'
const zh = {
  title: '第三方模型思考强度档位',
  description: '勾选档位后，右侧输入框可自由定义发送给网关的线上值。',
  subagentTitle: '子 agent 思考强度',
  providerDefault: '提供方默认',
  apply: '应用',
  searchPlaceholder: '搜索模型（名称或 ID）…',
  loading: '加载中…',
  noModels: '没有手工声明的 pi-ai 模型',
  noMatches: '没有匹配的模型',
  route: '路由：{route}',
  customize: '自定义档位',
  collapse: '收起',
  editorTitle: '编辑档位',
  applyLevel: '应用此档位',
  restoreDefault: '恢复默认档位',
  expandedCount: '已展开 {count} 个模型，可编辑档位',
  versionLabel: '插件版本',
  customEffortRequired: '请输入自定义思考档位',
  readSettingsFailed: '读取设置失败：{message}',
  writeFailed: '写入失败，请重试',
  // 其余 level/preset/error 文案也必须在 zh 与 en 中成对出现。
}
const en = {
  title: 'Third-party model reasoning effort',
  description: 'Select an effort and enter the exact value sent to the gateway.',
  subagentTitle: 'Subagent reasoning effort',
  providerDefault: 'Provider default',
  apply: 'Apply',
  searchPlaceholder: 'Search models by name or ID…',
  loading: 'Loading…',
  noModels: 'No hand-declared pi-ai models',
  noMatches: 'No matching models',
  route: 'Route: {route}',
  customize: 'Customize effort',
  collapse: 'Collapse',
  editorTitle: 'Edit effort',
  applyLevel: 'Apply effort',
  restoreDefault: 'Restore defaults',
  expandedCount: '{count} models expanded',
  versionLabel: 'Plugin version',
  customEffortRequired: 'Enter a custom reasoning effort',
  readSettingsFailed: 'Failed to read settings: {message}',
  writeFailed: 'Write failed. Please try again.',
  // 其余 level/preset/error 文案也必须在 zh 与 en 中成对出现。
}
```

实际实现时不得保留中文硬编码 UI 文案；每个字典必须包含相同 key，包括 7 个档位、2 个批量预设和所有错误/按钮/空状态文本。`off`、`minimal` 等标准 ID 和模型/路由/网关值继续使用原始值。

将插件的 `inject` 增加 `locale`，在 `apply(ctx)` 中通过 `ctx.get('locale')` 获取 locale 服务，并用 `ctx.effect()` 注册字典：

```js
const locale = ctx.get('locale')
const t = locale.bind(LOCALE_NS)
ctx.effect(() => locale.register(LOCALE_NS, { zh, en }), 'dsh-thinking-effort: dictionaries')
```

- [ ] **步骤 2：让设置页使用 locale 渲染**

在 `slots.register` 的选项中增加：

```js
locale: LOCALE_NS
```

通过 Slot 注入的 `props.t` 读取翻译函数；组件中所有自有文案改为 `t('key', params)`，例如：

```js
React.createElement('h3', null, t('title'))
React.createElement('span', null, t('route', { route: item.route }))
```

`label` 回调使用 `t('title')`。这样 locale 服务的 revision 变化会重新渲染已注册的设置页。

将设置页根容器样式从：

```js
{ style: { padding: '8px 12px' } }
```

改为包含：

```js
{
  style: {
    position: 'relative',
    boxSizing: 'border-box',
    padding: '8px 12px 28px',
  },
}
```

- [ ] **步骤 3：增加不可交互的右下角水印**

在根容器最后一个子元素后追加：

```js
React.createElement('span', {
  'aria-label': '插件版本',
  style: {
    position: 'absolute',
    right: '12px',
    bottom: '8px',
    fontSize: '10px',
    lineHeight: '14px',
    opacity: 0.45,
    pointerEvents: 'none',
    userSelect: 'none',
  },
}, 'v' + PLUGIN_VERSION),
```

水印只存在于 `SectionEditor` 返回的插件设置页，不注册全局组件，不调用网络和 settings API。

- [ ] **步骤 4：运行测试确认实现通过**

运行：

```bash
npm test
```

预期：所有 loader、runtime name、版本常量和水印样式测试通过。

### 任务 3：同步版本文档和发布元数据

**文件：**
- 修改：`package.json`
- 修改：`CHANGELOG.md`
- 修改：`README.md`
- 修改：`INSTALL.md`

- [ ] **步骤 1：升级 package 版本**

将：

```json
"version": "0.1.4"
```

改为：

```json
"version": "0.1.5"
```

保持 `files` 列表包含：

```json
"CHANGELOG.md"
```

- [ ] **步骤 2：新增 0.1.5 changelog 条目**

在 `CHANGELOG.md` 顶部增加：

```markdown
## [0.1.5] - 设置页版本信息与中英文支持

### 新增

- 在插件设置页右下角增加低对比度版本水印，例如 `v0.1.5`。
- 设置页支持中文和英文，跟随 DSH 当前 locale 自动切换。
- 增加版本和双语字典一致性检查。

### 兼容性

- 不改变 Cordis 组合条目 ID `thinking-effort`。
- 不改变设置页 Slot ID `thinking-effort`。
- 插件安装、升级和卸载仍使用 DSH 官方 `dsh plugin` 命令。
```

- [ ] **步骤 3：同步 README 和 INSTALL 固定版本示例**

把固定安装示例从 `@hytime/dsh-thinking-effort@0.1.4` 更新为 `@hytime/dsh-thinking-effort@0.1.5`，保留旧版本迁移说明中的历史版本引用不变。README 增加两点：设置页右下角的 `v0.1.5` 是当前已安装插件版本；设置页文案会跟随 DSH 的中文/English locale 切换。完整变更见 `CHANGELOG.md`。

### 任务 4：完成发布前验证

**文件：**
- 验证：`src/host.mjs`
- 验证：`src/client.js`
- 验证：`test/client-registration.test.mjs`
- 验证：`package.json`、`CHANGELOG.md`、`README.md`、`INSTALL.md`

- [ ] **步骤 1：运行测试和语法检查**

运行：

```bash
npm test
node --check src/host.mjs
node --check src/client.js
git diff --check
```

预期：测试全部通过，两个源码文件语法检查通过，locale namespace 声明和双语字典检查通过，diff 无空白错误。

- [ ] **步骤 2：检查 npm 包内容**

运行：

```bash
npm pack --dry-run
```

预期：tarball 包含 `README.md`、`CHANGELOG.md`、`package.json`、`cordis.patch.yml`、`src/host.mjs` 和 `src/client.js`，版本为 `0.1.5`。

- [ ] **步骤 3：提交实现**

```bash
git add src/client.js test/client-registration.test.mjs package.json CHANGELOG.md README.md INSTALL.md
git diff --cached --check
git commit -m "feat: show plugin version in settings"
```

不要添加被 `.gitignore` 忽略的本地 `AGENTS.md`。

### 任务 5：发布并安装

**文件：**
- 外部发布：npm `@hytime/dsh-thinking-effort@0.1.5`
- 外部安装：DSH `web` profile

- [ ] **步骤 1：推送 GitHub**

```bash
git push origin main
```

- [ ] **步骤 2：发布 npm**

```bash
npm publish --access public
npm view @hytime/dsh-thinking-effort@0.1.5 version dist.tarball --json
```

预期 registry 返回版本 `0.1.5` 和 tarball 地址。

- [ ] **步骤 3：使用官方 DSH CLI 安装**

在 DeepSeek Harness checkout 中运行：

```bash
pnpm dsh plugin --profile web add @hytime/dsh-thinking-effort@0.1.5
```

禁止手工编辑 `/Users/huangyu/.dsh/profiles/web/package.json`。

- [ ] **步骤 4：验证 profile 和水印版本**

```bash
pnpm dsh --profile web --dump-default-config
node -p "require('/Users/huangyu/.dsh/profiles/web/node_modules/@hytime/dsh-thinking-effort/package.json').version"
```

预期组合树包含：

```yaml
- id: thinking-effort
  name: '@hytime/dsh-thinking-effort'
```

预期安装版本为 `0.1.5`。重启 DSH 并刷新 Web 页面后，插件设置页右下角显示 `v0.1.5`。
