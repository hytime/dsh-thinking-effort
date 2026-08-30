# 兼容新旧 DSH Settings Remote 的客户端挂载设计

## 背景

客户端设置页同时面对两代 DSH 运行时：

- 新版 DSH（当前验证版本 `0.1.2-alpha.1`）将 `remote.settings` 注册为独立的 Cordis 服务。读取 `ctx.remote.settings` 的插件必须在自身的注入作用域中声明 `remote.settings`，否则 Context 代理抛出 `cannot get property "remote.settings" without inject`。
- 旧版 DSH 没有 `remote.settings` provider，若客户端插件顶层硬注入 `remote.settings`，客户端 entry 会保持 `pending`，Web boot 随后报告等待该服务的注入错误。

目标是在同一个客户端 bundle 中兼容两种运行时，同时保持现有旧版 `connection.api.settings` 回退和新版直接 `ClientResult` 契约。

## 目标与非目标

### 目标

1. 旧版 DSH 在缺少 `remote.settings` 时仍能激活插件并显示设置页。
2. 新版 DSH 在 `remote.settings` 可用时通过合法的注入作用域挂载设置页。
3. 不在未声明 `remote.settings` 的 Context 上访问该属性。
4. 继续统一旧版 RPC 包装响应与新版直接结果，并保留并发版本号写入行为。
5. 用回归测试锁定两版启动和设置读写路径。

### 非目标

- 不修改 DSH 宿主、Cordis loader 或 Remote provider。
- 不发布两个按 DSH 版本区分的客户端包。
- 不重构设置页业务 UI、数据模型或 Host 半区逻辑。

## 方案

客户端插件的顶层注入清单只保留跨版本都稳定存在的服务：

```js
['slots', 'connection', 'locale']
```

在 `apply` 内部拆分 Settings 通道：

1. 先检查 `connection.api.settings`。若存在且具备 `describe` 与 `mutate`，立即构造 legacy bridge 并挂载设置页。
2. 另外调用 `ctx.inject(['remote.settings'], callback)`。该调用只创建一个可选的子 fiber；旧版缺少 provider 时子 fiber 保持 pending，但不会阻塞顶层客户端 entry。
3. 新版子 fiber 的 callback 接收已经声明 `remote.settings` 的 Context，通过 `remoteCtx.get('remote.settings')` 取得服务对象，再构造 modern bridge 并挂载设置页。
4. 用单次挂载状态避免 legacy 与 modern 通道重复注册 slot、字典和语言包。

`settingsBridge` 不再从 Context 或 `remote` 对象读取 `.settings`，而是接收已经解析的 modern settings service；因此属性访问边界只存在于 `ctx.inject(['remote.settings'])` 的合法作用域中。

## 数据流与错误处理

- 设置页读取：`SectionEditor -> bridge.describe() -> ClientResult`。
- 设置页写入：`SectionEditor -> bridge.mutate(ns, ops, expectedRevision) -> ClientResult`。
- modern bridge 直接转发 `remote.settings.describe()` / `mutate(ns, ops, expectedRevision)`。
- legacy bridge 保持旧签名 `describe({})` / `mutate({ ns, ops, expectedRevision })`，并用 `directResult` 解开 `{ result: ClientResult }`。
- Remote 不存在时不产生错误；只有旧版 legacy API 也不存在时，设置页不会注册，但顶层插件仍可正常激活。
- 远程调用返回的业务失败继续由现有页面显示；Transport rejection 继续由现有 `catch` 分支转换为本地化错误。

## 测试策略

1. **注册契约**：断言顶层 `inject` 不包含可选的 `remote.settings`。
2. **旧版 harness**：不提供 `remote.settings`，提供 legacy `connection.api.settings`；验证插件上下文能激活、读取和保存仍走 legacy 参数。
3. **新版 harness**：模拟 `ctx.inject(['remote.settings'], callback)`，callback 只能通过 `get('remote.settings')` 提供 service；验证 modern 参数为 `ns, ops, expectedRevision`，响应无需 `.result` 包装。
4. **缺失 Remote**：模拟 `ctx.inject` 不执行 callback；验证 apply 不抛出、不会把顶层 entry 置为 pending。
5. **静态边界检查**：验证源码不存在绕过注入作用域的 `ctx.remote.settings` 或对未注入 `remote` 对象读取 `.settings` 的路径。
6. 运行项目已有 `node --test`，并执行 `node --check`、构建和打包 dry-run。

## 兼容性结论

采用“稳定服务顶层硬注入、Settings Remote 可选嵌套注入、legacy API 回退”的组合。它同时满足新版 Context 代理的属性注入约束和旧版 Web boot 的可激活要求，且不要求修改宿主配置。
