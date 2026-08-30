# 双语 Bug Report Issue Form 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为插件仓库增加一个可校验必填字段的中英文双语 GitHub Bug Report Issue Form。

**架构：** 仅新增 GitHub Issue Form 配置，不修改运行时代码。模板通过 GitHub 原生 `body` 字段收集环境、复现、期望和实际行为，日志与截图保持选填并带脱敏提醒。

**技术栈：** GitHub Issue Forms、YAML、Ruby 标准库 YAML 解析器、Git。

---

## 文件清单

- 创建：`.github/ISSUE_TEMPLATE/bug_report.yml`，定义中英文双语 Bug Report 表单、标题前缀和 `bug` 标签。
- 不修改：插件源码、README、贡献指南以及工作区中已有的未跟踪文件。

### 任务 1：创建并验证双语 Bug Report Issue Form

**文件：**
- 创建：`.github/ISSUE_TEMPLATE/bug_report.yml`
- 测试：使用 Ruby 标准库解析 YAML，并用脚本检查 Issue Form 的关键结构

- [ ] **步骤 1：创建目录和 Issue Form 文件**

  创建 `.github/ISSUE_TEMPLATE/bug_report.yml`，写入以下顶层结构：

  ```yaml
  name: Bug Report / 错误报告
  description: Report a reproducible problem / 报告一个可复现的问题
  title: "[Bug] "
  labels: [bug]
  body:
  ```

  `body` 按以下顺序定义字段：

  1. `problem-summary`：`textarea`，选填，收集问题概述。
  2. `environment`：`textarea`，必填，要求填写 DSH、插件、操作系统、Node.js、模型或 API 类型、安装方式。
  3. `reproduction-steps`：`textarea`，必填，要求填写最小复现步骤和相关命令或配置。
  4. `expected-behavior`：`textarea`，必填，收集期望行为。
  5. `actual-behavior`：`textarea`，必填，收集实际行为。
  6. `reproduction-rate`：`dropdown`，选填，选项为必现、偶现、低概率和无法确认，并提供英文翻译。
  7. `logs-and-screenshots`：`textarea`，选填，说明日志和截图必须脱敏，并设置 `render: text`。
  8. `workaround`：`textarea`，选填，收集临时解决方法。

  每个字段的 `label`、`description` 和占位文本都使用“中文 / English”双语。每个字段使用稳定、唯一的小写连字符 `id`。

- [ ] **步骤 2：验证 YAML 语法**

  运行：

  ```bash
  ruby -e 'require "yaml"; YAML.load_file(".github/ISSUE_TEMPLATE/bug_report.yml"); puts "YAML OK"'
  ```

  预期：输出 `YAML OK`，命令退出码为 0。

- [ ] **步骤 3：验证 Issue Form 结构和必填字段**

  运行以下检查，确认顶层 `name`、`description`、`title`、`labels`、`body` 存在，且 `body` 包含 8 个唯一字段；`environment`、`reproduction-steps`、`expected-behavior`、`actual-behavior` 的 `validations.required` 为 `true`，日志字段的 `render` 为 `text`。

  ```bash
  ruby -e 'require "yaml"; d = YAML.load_file(".github/ISSUE_TEMPLATE/bug_report.yml"); abort "missing top-level key" unless %w[name description title labels body].all? { |k| d.key?(k) }; ids = d.fetch("body").map { |x| x.fetch("id") }; abort "duplicate id" unless ids.uniq == ids; required = %w[environment reproduction-steps expected-behavior actual-behavior]; abort "required field mismatch" unless required.all? { |id| d.fetch("body").find { |x| x["id"] == id }.dig("validations", "required") == true }; logs = d.fetch("body").find { |x| x["id"] == "logs-and-screenshots" }; abort "logs must render as text" unless logs.dig("attributes", "render") == "text"; puts "Issue Form structure OK"'
  ```

  预期：输出 `Issue Form structure OK`，命令退出码为 0。

- [ ] **步骤 4：检查文本和变更范围**

  运行：

  ```bash
  git diff --check
  git status --short
  ```

  预期：`git diff --check` 无输出；状态只显示新增的 Issue Form，已有的图片、锁文件和加载标记保持未修改。

- [ ] **步骤 5：Commit**

  ```bash
  git add .github/ISSUE_TEMPLATE/bug_report.yml
  git commit -m "docs: 添加双语错误报告模板"
  ```

  只暂存 Issue Form 文件，不暂存其他未跟踪文件。
