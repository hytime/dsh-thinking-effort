# 安装指南（AI 可执行版）

本文件为机器可执行步骤：每步给出精确命令、期望输出与校验点。适合任何 AI
助手或人工按序执行。全文以 `<profile>` 占位符表示目标 DSH profile，步骤 0
会教你如何确定它。

---

## 0. 前置条件与确定 profile

前置：已安装 `dsh` CLI，且 `gh`（或等效 git 凭据）可访问 GitHub。

```bash
# 确认 dsh 可用
dsh --version

# 确定目标 profile：列出 DSH home 下已存在的 profile
# （一般部署为 web；以实际存在、正在运行的那个为准）
echo "DSH_HOME=${DSH_HOME:-$HOME/.dsh}"
ls "$HOME/.dsh/profiles"
```

> 校验点：上面 `ls` 至少列出一个 profile 名（如 `web`）。把你要用的名字记为
> `<profile>`。不确定时优先选启动命令里 `--profile` 指定的那个；没有则用 `web`。

---

## 1. 安装

二选一（推荐 git 方式，来源单一、可升级）：

### 方式 A：从 GitHub 安装（推荐）

```bash
dsh plugin --profile <profile> add github:hytime/dsh-pi-effort
```

### 方式 B：本地目录安装（先用 git 克隆或解压到本机）

```bash
# 克隆（或用你已有的本地副本路径）
git clone https://github.com/hytime/dsh-pi-effort.git /tmp/dsh-pi-effort
dsh plugin --profile <profile> add /tmp/dsh-pi-effort
```

> 校验点：命令成功退出；profile 的 package.json 里出现
> `"dsh-pi-effort"` 依赖，且 bundles 列表包含它：

```bash
grep -n "dsh-pi-effort" "$HOME/.dsh/profiles/<profile>/package.json"
```

---

## 2. 授权构建（仅 git 安装需要）

pnpm >= 10 默认拒绝 git 依赖的 `prepare`。若上一步输出提示需要授权，把提示
中的包键写入该 profile 的 `pnpm-workspace.yaml`：

```bash
cat >> "$HOME/.dsh/profiles/<profile>/pnpm-workspace.yaml" <<'EOF'
allowBuilds:
  dsh-pi-effort: true
EOF
# 然后重跑安装
dsh plugin --profile <profile> add github:hytime/dsh-pi-effort
```

> 说明：本插件为纯手写 bundle、无构建脚本；授权仅满足 pnpm 的默认安全策略。

---

## 3. 生效

### 3a. 热加载（无需重启）

DSH 的组合补丁支持热加载。安装后等待几秒，然后：

```bash
# 宿主加载标记应出现（包含 "apply"）
cat "$HOME/.dsh/pi-effort-loaded.json"
```

### 3b. 若未热加载：重启 DSH

```bash
# 重启你的 DSH 服务进程（以你的启动方式为准），重启后再验证。
```

### 3c. 浏览器侧

**刷新 Web 页面**（Cmd+R / F5）。验证设置页 bundle 已被 Web 清单注入：

```bash
# 以默认 3080 端口为例；换成你实际监听的端口
curl -s http://127.0.0.1:3080/ | grep -o "dsh-pi-effort[^\"]*" | head -3
# 期望输出至少包含：
#   dsh-pi-effort
#   dsh-pi-effort/client.js?rev=...
```

---

## 4. 功能验证清单

1. **宿主自动补齐**：打开/查看 `llm-pi-ai` 设置（`$HOME/.dsh/settings.yaml`），
   手工声明模型缺少 `reasoningEfforts` 的会自动补上 `off: null / high: high / max: max`；
   也可以手动移除一个模型的档位后，等待数秒确认被补回。
2. **设置页**：Web 界面 → 设置 → 左侧出现「思考强度档位」（位于「模型」与
   「插件」之间）；可展开模型、勾选档位、填线上值、应用/恢复默认。
3. **composer**：选择该第三方模型 → 模型选择器出现「推理等级」（Off / High / Max
   或你自定义的档位）。

---

## 5. 故障排查

| 现象 | 检查 |
| --- | --- |
| 宿主未加载（无 `pi-effort-loaded.json`） | 组合行是否生效：`grep -rn pi-effort "$HOME/.dsh/profiles/<profile>/cordis.patch.yml"`；重启 DSH；看启动日志里 `[pi-effort]` 行 |
| 设置页没出现 | 刷新页面；`curl` 校验清单含 `dsh-pi-effort-client`；bundle 路由 `curl -s http://127.0.0.1:3080/plugins/dsh-pi-effort/client.js` 是否 200 |
| 设置页报「未找到 llm-pi-ai」 | 该部署没有配置任何 `llm-pi-ai` 第三方模型；先配置模型再使用 |
| 写档位报错 | 页面红字会显示具体原因（通常是档位字典不合法，如非 off 档位缺线上值） |

---

## 6. 卸载

```bash
dsh plugin --profile <profile> remove dsh-pi-effort
# 清理加载标记
rm -f "$HOME/.dsh/pi-effort-loaded.json"
```

---

## 附：手动组合安装（不经过 `dsh plugin`，适合已有补丁文件的部署）

若你的部署直接用 `cordis.patch.yml` 组合，追加：

```yaml
- insert:
    - id: pi-effort
      name: dsh-pi-effort
```

并确保 `dsh-pi-effort` 包可被解析（npm link / node_modules / workspace）。
