# 双语 Bug Report Issue Form 设计

## 目标

为 DSH 插件仓库提供一个中英文双语的 GitHub Bug Report Issue Form，降低空泛、缺少环境信息和无法复现的问题提交，统一收集维护者定位问题所需的最小信息。

本次只新增错误报告模板，不新增功能建议、使用咨询或安全问题模板，也不修改 README、贡献指南和插件代码。

## 文件与入口

新增文件：

```text
.github/ISSUE_TEMPLATE/bug_report.yml
```

模板使用 GitHub Issue Form 格式。标题前缀为 `[Bug] `，标签为 `bug`，模板名称和说明同时提供中文与英文。

## 字段设计

字段标签采用“中文 / English”并列形式，字段说明同样提供双语，方便中英文用户填写。

| 字段 | 类型 | 必填 | 目的 |
| --- | --- | --- | --- |
| 问题概述 / Problem summary | textarea | 否 | 用一句话说明可观察到的问题 |
| 环境信息 / Environment | textarea | 是 | 收集 DSH、插件、操作系统、Node.js、模型/API 和安装方式 |
| 复现步骤 / Steps to reproduce | textarea | 是 | 收集最小且可执行的复现步骤 |
| 期望行为 / Expected behavior | textarea | 是 | 明确正常情况下应该发生什么 |
| 实际行为 / Actual behavior | textarea | 是 | 明确实际发生了什么 |
| 复现概率 / Reproduction rate | dropdown | 否 | 区分必现、偶现和低概率问题 |
| 日志和截图 / Logs and screenshots | textarea | 否 | 提供脱敏后的日志和截图，日志使用纯文本渲染 |
| 临时解决方法 / Workaround | textarea | 否 | 记录当前可用的临时规避方案 |

环境字段的说明应明确要求提供：

- DSH 版本
- 插件版本
- 操作系统
- Node.js 版本
- 模型或 API 类型
- 安装方式

日志字段必须提醒提交者删除 API Key、Token、Cookie、Authorization 请求头、凭据和其他敏感信息。

## 交互与约束

- 必填字段由 GitHub Issue Form 原生校验，不依赖用户阅读说明后自觉填写。
- 日志和截图保持选填，避免用户因没有日志而无法提交问题。
- 一个模板只处理 Bug，不承担功能建议、使用咨询或安全漏洞报告。
- 不自动收集个人数据，不要求提交完整配置文件或完整请求内容。
- 不在模板中预设具体 DSH 插件包名，使模板可以复用于其他插件仓库。

## 验证方式

实现后执行以下检查：

1. 使用 YAML 解析器验证文件语法。
2. 检查 GitHub Issue Form 必需字段结构，包括 `name`、`description`、`title`、`labels` 和 `body`。
3. 确认四个核心字段为必填：环境信息、复现步骤、期望行为、实际行为；其中环境信息作为一个字段覆盖六项运行环境资料。
4. 确认日志字段包含敏感信息脱敏提醒并使用纯文本渲染。
5. 运行 `git diff --check`，确保没有空白错误。
6. 检查 Git 状态，只确认新增模板和本设计文档，不触碰用户已有的无关未提交文件。
