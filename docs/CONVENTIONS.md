# 共享原语约定

本文件是团队共享记忆的唯一载体。`AGENTS.md` 被 `.gitignore` 忽略，只对本机生效，不能承担这个职责。

`scripts/check-conventions.mjs` 会在 `npm test` 中强制执行下表；违反时给出 `路径:行号` 与规则名。

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
| `isUnknownRecord` | `src/shared/guards.ts` | 任何 `typeof value === 'object' && value !== null && !Array.isArray(value)` 的重新实现 |
| `isSettingsConflict` | `src/shared/conflict.ts` | 各自的 `/conflict/i` 或 `code === 'settings/conflict'` 判定 |

例外：`src/compat/model-source.ts` 的 `isPlainObject` 语义不同（额外排除类实例），允许保留，但必须在注释中说明差异。

## 单一来源的常量

| 常量 | 唯一定义处 |
|---|---|
| `ALL_LEVELS` / `DEFAULT_LEVELS` | `src/shared/constants.ts` |
| `FORMAT_MODES` / `FORMAT_TIMES` / `FORMAT_INVALID_POLICIES` | `src/shared/constants.ts` |

## 新增常量的流程

1. 先查上表是否已有同义常量；有则 `import`，不要新写。
2. 确需新增时，加在 `src/shared/constants.ts`，并在此表补一行。
3. 如果它不该被复现，在 `scripts/check-conventions.mjs` 的 `RULES` 中加一条规则，并在 `tests/conventions.test.ts` 中加一个"会失败"的用例。