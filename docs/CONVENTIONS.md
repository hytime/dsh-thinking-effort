# 共享原语约定

本文件是团队共享记忆的唯一载体。`AGENTS.md` 被 `.gitignore` 忽略，只对本机生效，不能承担这个职责。

`scripts/check-conventions.mjs` 会在 `npm test` 中强制执行 `RULES` 里已有的规则；违反时给出 `路径:行号` 与规则名。**下表并非"已全部强制"**：只有被某条 `RULES` 规则覆盖的行才会真正让测试变红，其余行是待办目标。每行下方标注其当前状态——把未强制的一行读成已有断言，就是本文件最容易犯的错。

## 禁止复现的字面量

| 常量 | 唯一定义处 | 值 | 反例 |
|---|---|---|---|
| `LLM_PI_AI_NS` | `src/shared/constants.ts` | `llm-pi-ai` | `const NS = 'llm-pi-ai'` |
| `PLUGIN_NS` | `src/shared/constants.ts` | `dsh-thinking-effort` | `inject(..., 'dsh-thinking-effort')` |
| `PLUGIN_ENTRY_ID` | `src/shared/constants.ts` | `thinking-effort` | `entry.options.id === 'thinking-effort'` |
| `LOG_PREFIX` | `src/shared/constants.ts` | `[@hytime/dsh-thinking-effort]` | `console.log('[@hytime/...]')` |
| `SNAPSHOT_KIND` | `src/shared/constants.ts` | `dsh-thinking-effort/config-snapshot` | `kind: 'dsh-thinking-effort/config-snapshot'` |
例外：`src/client/index.ts` 的 `SLOT_ID = 'thinking-effort'` 是**设置页 Slot id**，与设置 section id 无关，允许保留独立字面量。

## 禁止复现的实现

| 原语 | 唯一定义处 | 反例 |
|---|---|---|
| `isUnknownRecord` | `src/shared/guards.ts` | 任何 `typeof <任意参数名> === 'object' && <同一参数名> !== null && !Array.isArray(<同一参数名>)` 的重新实现 |
| `isSettingsConflict` | `src/shared/conflict.ts` | 各自的 `/conflict/i` 或 `code === 'settings/conflict'` 判定 |

**强制状态：**

- `isUnknownRecord` — **已强制**。`guard-duplication` 规则用反向引用（`\1`）绑定参数名，因此 `nested` / `compatSource` / `entry` 等任意参数名下的同形表达式都会被 `npm test` 拦下；`RULES` 覆盖的复现处当前为 0。已知边界：该规则只匹配**单行**表达式。
- `isSettingsConflict` — **尚未强制**。`RULES` 里目前**没有** conflict 规则，因此上面这一行今天只是一个目标，不会让测试变红。三处复现仍在：`src/client/SectionEditor.tsx:39-45`、`src/client/config-snapshot/apply.ts:29-30`、`src/client/components/OpenCodeFormatCard.tsx:191`。它们的迁移属于 **Task 4**；Task 4 合并这些调用点后，才需要在 `RULES` 中新增 conflict 规则（并配一个"会失败"的用例），届时本行才转为"已强制"。

例外：`src/compat/model-source.ts` 的 `isPlainObject` 语义不同（额外排除类实例），允许保留，但必须在注释中说明差异。

## 单一来源的常量

| 常量 | 唯一定义处 |
|---|---|
| `ALL_LEVELS` / `DEFAULT_LEVELS` | `src/shared/constants.ts` |
| `FORMAT_MODES` / `FORMAT_TIMES` / `FORMAT_INVALID_POLICIES` | `src/shared/constants.ts` |

`ALL_LEVELS` / `DEFAULT_LEVELS` 的**唯一字面量**在 `src/shared/constants.ts`；`src/host/settings.ts` 与 `src/client/constants.ts` 现在都只是该值的别名（前者 `SHARED_DEFAULT_LEVELS`，后者用 `satisfies` 补上 `ReasoningLevel` 约束）。

## 新增常量的流程

1. 先查上表是否已有同义常量；有则 `import`，不要新写。
2. 确需新增时，加在 `src/shared/constants.ts`，并在此表补一行。
3. 如果它不该被复现，在 `scripts/check-conventions.mjs` 的 `RULES` 中加一条规则，并在 `tests/conventions.test.ts` 中加一个"会失败"的用例。
