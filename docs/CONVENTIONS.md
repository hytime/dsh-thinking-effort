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
例外：`src/client/index.ts` 的 `SLOT_ID = 'thinking-effort'` 是**设置页 Slot id**，与设置 section id 无关，允许保留独立字面量。豁免是**逐行**的：只有形如 `const SLOT_ID = '<值>'` 的那一行声明被跳过，该文件其余每一行都照常参与全部规则。早先的实现按**文件名**跳过整个 `src/client/index.ts`，等于把该文件里所有规则的断言一起关掉——现在有测试钉住「该行仍放行、该文件别处的真实违规会被拦下」。

## 禁止复现的实现

| 原语 | 唯一定义处 | 反例 |
|---|---|---|
| `isUnknownRecord` | `src/shared/guards.ts` | 任何 `typeof <任意参数名> === 'object' && <同一参数名> !== null && !Array.isArray(<同一参数名>)` 的重新实现 |
| `isSettingsConflict` | `src/shared/conflict.ts` | 各自的 `code === 'settings/conflict'` 比较，或 `/conflict/i.test(message)` / `/changed since it was read/i.test(message)` 正则判定 |

**强制状态：**

- `isUnknownRecord` — **已强制**。`guard-duplication` 规则用反向引用（`\1`）绑定参数名，因此 `nested` / `compatSource` / `entry` 等任意参数名下的同形表达式都会被 `npm test` 拦下；`RULES` 覆盖的复现处当前为 0。**已知边界（精确说明）：**① 只匹配**单行**表达式；② 空白只在**相连记号之间**宽松——模式尾部写死为 `!Array\.isArray\(\1\)`，`!` 之后、`(` 之后、`)` 之前都没有 `\s*`，因此 `!Array.isArray( value )` 与 `! Array.isArray(value)` **不会**被拦下；③ 只匹配**肯定**合取式本身，逻辑等价的**否定**改写（`typeof x !== 'object' || x === null || Array.isArray(x)`）不在覆盖范围内——`src/host/legacy-scan.ts:58,77` 与 `src/compat/gateway/ops.ts:150` 三处即这种形状，**有意不迁移**：`src/compat/model-source.ts` 的否定形状是刻意的（它还必须排除类实例，故保留自己的 `isPlainObject`），一条笼统的否定式规则会误伤它。本节只承诺上述确切范围，不代表否定式已被强制。
- `isSettingsConflict` — **已强制**。`conflict-duplication` 规则匹配两种**可执行**的复现形状，二者都在 `src/shared/conflict.ts` 之外被拦下：① 与冲突 code 的比较（`code === 'settings/conflict'` / `!== 'SETTINGS_CONFLICT'`，左右操作数顺序都算）；② 加上 `.test(` 调用的冲突消息正则（`/conflict/i`、`/changed since it was read/i`，即 Task 4 合并掉的另一半）。`RULES` 覆盖的复现处当前为 0；三处旧实现（`SectionEditor.tsx`、`config-snapshot/apply.ts`、`OpenCodeFormatCard.tsx`）已改为导入。已知边界：规则按**单行**匹配，所以跨行表达式、把字面量藏进 `includes(...)` / `switch` case / enum，以及 `new RegExp('conflict')` 都不会被拦；未被调用的裸 `/conflict/i` 也不算——规则覆盖的是三处调用点实际用过的比较与「已调用正则」两种形状。**注释豁免只到「仅提及 code 名」为止**：像 `// the conflict code lives in shared/conflict.ts` 这样不含比较运算符、不含 `.test(` 的注释不判违规；但**引述可执行形式的注释仍会命中**——`// was: return error.code === 'settings/conflict'`、`// legacy: /conflict/i.test(message)`、` * if (code === 'SETTINGS_CONFLICT') ...` 都会被拦下。原因是规则做的是**逐行文本**匹配，不区分注释与代码（与上表其它规则一致）；把旧判定抄进注释同样是让被合并的原语回到源码树，所以只豁免「点名」不豁免「引述」。扫描范围与 `guard-duplication` 相同：只走 `src/**/*.ts{,x}`，`tests/` 与 `scripts/` 不在内（`src/shared/conflict.ts` 已加入 `OWNERS` 白名单）。

例外：`src/compat/model-source.ts` 的 `isPlainObject` 语义不同（额外排除类实例），允许保留，但必须在注释中说明差异。

## 单一来源的常量

| 常量 | 唯一定义处 | 强制规则 |
|---|---|---|
| `ALL_LEVELS` | `src/shared/constants.ts` | **已强制** — `level-table`（七级完整序列） |
| `DEFAULT_LEVELS` | `src/shared/constants.ts` | **已强制** — `default-levels`（`{ off: null, high: 'high', max: 'max' }` 整体） |
| `FORMAT_MODES` | `src/shared/constants.ts` | **已强制** — `format-modes`（五值逗号序列） |
| `FORMAT_TIMES` | `src/shared/constants.ts` | **已强制** — `format-times`（`firstUse`, `hash`） |
| `FORMAT_INVALID_POLICIES` | `src/shared/constants.ts` | **已强制** — `format-policies`（`warn`, `drop`, `send`） |

上表每一行都有对应 `RULES` 条目与「会失败」用例；四条新增规则（`default-levels` / `format-modes` / `format-times` / `format-policies`）在**序列**层面匹配，因此单值用法（`mode: 'ses-derive'`、`case 'passthrough':`、`config.onInvalid === 'drop'`）不会被误报——只有重新声明整份词表才算复现。

`ALL_LEVELS` / `DEFAULT_LEVELS` 的**唯一字面量**在 `src/shared/constants.ts`；`src/host/settings.ts` 与 `src/client/constants.ts` 现在都只是该值的别名（前者 `SHARED_DEFAULT_LEVELS`，后者用 `satisfies` 补上 `ReasoningLevel` 约束）。

## 新增常量的流程

1. 先查上表是否已有同义常量；有则 `import`，不要新写。
2. 确需新增时，加在 `src/shared/constants.ts`，并在此表补一行。
3. 如果它不该被复现，在 `scripts/check-conventions.mjs` 的 `RULES` 中加一条规则，并在 `tests/conventions.test.ts` 中加一个"会失败"的用例。
