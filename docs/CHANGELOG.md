# 更新日志 / Changelog

- [English / 中文](./CHANGELOG.md)
- [日本語](./CHANGELOG.ja.md)
- [한국어](./CHANGELOG.ko.md)

本文件记录 `@hytime/dsh-thinking-effort` 每个已发布版本的功能、修复和使用影响。

This file records the features, fixes, and user-facing impact of every published version of `@hytime/dsh-thinking-effort`.

版本号遵循 [Semantic Versioning](https://semver.org/)。

Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.4] - 2026-09-26

### 修复 / Fixed

- 修复上一版引入的保存重试会丢弃并发改动的问题：为修复 issue #16 加入的「冲突后重试」会原样重放写入操作，而模型档位/能力写入携带的是按面板打开时快照重建的整个 `models` 数组。若冲突期间其他写入改动了同一数组（宿主的默认档位补齐新增了一个模型、另一个窗口编辑了同路由下的兄弟模型），重试会用自己的旧数组覆盖文档，静默删掉或回退对方的结果——比原来「拒绝写入」更糟。现在重试只对「叶子路径」写入直接重放（provider / 模型 compat 单字段、OpenCode 会话开关、`subagentEffort`），携带整个容器的写入必须用重试时重新读取的分区重建数组；重建后没有任何目标模型时如实报错而不是假装成功。
- Fix a save retry from the previous release discarding concurrent changes: the "retry after a conflict" added for issue #16 replayed the write's ops verbatim, and a model-levels/capability write carries a whole `models` array rebuilt from the inventory the panel read at mount. When another writer changed that same array during the conflict — the Host's default-levels fill adding a model, or another window editing a sibling model on the same route — the retry overwrote the document with its stale array, silently deleting or reverting the other writer's result, which is worse than the original refusal. A retry now replays only leaf-path writes directly (provider/model compat fields, the OpenCode session toggle, `subagentEffort`); a write carrying a whole container must rebuild it from the section re-read at retry time, and a rebuild that leaves no target model reports the conflict instead of claiming success.

- 修复设置页保存被过期 revision 永久卡死（issue #16）：面板挂载时读一次 revision 并在每次成功写入后更新，外部写入（切换默认模型、宿主的默认档位补齐、另一个窗口）不会同步，因此面板打开后只要别处写过一次，之后每次「保存更改」都会被 `dsh-settings` 以版本冲突拒绝，且面板不会重新读取，用户侧表现为「设置再也保存不了」。现在写入被判定为冲突时会重新读取该分区并重试一次：只写入单个路径的操作（provider / 模型 compat 单字段、OpenCode 会话开关、`subagentEffort`）直接重放，携带整个 `models` 数组的写入则按重试时重新读取的分区重建，因此并发改动不会被覆盖。第二次仍冲突则如实报错，避免持续争抢时无限重试。
- Fix settings saves being fenced forever by a stale revision (issue #16): the panel read the revision once at mount and updated it only after its own successful writes, so an external write (a default-model switch, the Host's own default-levels fill, another window) was never observed. Once anything else had written, every later Save was refused by `dsh-settings` as a version conflict and the panel never re-read, which the user experienced as "settings can no longer be saved". A write refused as a conflict now re-reads that section and retries once: a leaf-path write (a provider/model compat field, the OpenCode session toggle, `subagentEffort`) is replayed directly, while a write carrying a whole `models` array is rebuilt from the section re-read at retry time, so a concurrent change is never overwritten. A second conflict is reported as-is rather than retried again, so a persistently losing writer cannot spin.

- 修复思考档位只勾 `off` 时「保存更改」点击后毫无反馈（issue #15）：该配置被 `validateLevels()` 拒绝（宿主侧同样拒绝只声明 `off` 的模型），但拒绝只把错误横幅渲染在页面标题下方，即整页最顶部，用户在下方模型卡片处操作时完全看不到，且按钮状态不变、不转圈、不发请求，只能判定为「按钮失灵」。现在保存按钮在校验不通过时直接禁用，并把原因（如「至少需要一个思考档位」）就近显示在按钮下方；写入路径与按钮可见性共用同一个校验函数，两者不会对「能否保存」给出不同答案。
- Fix the Save button appearing dead when a model's thinking levels are reduced to `off` only (issue #15): that configuration is refused by `validateLevels()` (the Host likewise rejects a model declaring only `off`), but the refusal rendered its banner below the page title — the very top of the page — so a user working in a model card below never saw it, while the button neither changed state nor showed progress nor sent a request. The Save button is now disabled on exactly that validation failure and the reason ("Select at least one reasoning effort") is shown beside it. The write path and the button's affordance read one shared predicate, so they cannot disagree about what is savable.

- 修复中文界面下模型菜单把供应商分组标题显示成英文（issue #17）：分组标题此前直接渲染供应商注册的 `displayName`，而 `deepseek-account` 注册的是英文 `DeepSeek Account`，等于插件替 DSH 做了英文本地化。现在按 provider id 映射本地化名称（zh `DeepSeek 账号`、en `DeepSeek Account`、ja `DeepSeek アカウント`、ko `DeepSeek 계정`），与 DSH 自带模型菜单的规则一致；其他供应商（含用户自建的网关）继续使用其注册名，不被替换。
- Fix the model menu showing an English provider heading in a Chinese UI (issue #17): the heading rendered the provider's registered `displayName`, and `deepseek-account` registers the English `DeepSeek Account`, so the plugin effectively localized the name into English. The signed-in account route is now mapped by provider id (zh `DeepSeek 账号`, en `DeepSeek Account`, ja `DeepSeek アカウント`, ko `DeepSeek 계정`), matching DSH's own model menu. Every other provider — including a user-declared gateway — keeps its registered name.

- 修复模型座位面板与模型菜单半透明、下层文字直接透出（issue #14）：两者此前使用 `--dsw-specific-menu`，而该令牌是 DSH 核心的 58% 半透明菜单材质，核心只把它与 `--dsw-menu-backdrop-filter` 一起使用，单独使用等于没有底衬，面板后面的档位文字会 1:1 透上来。现在改用不透明且随主题切换的表面令牌 `--dsw-alias-bg-layer-1`（面板）与 `--dsw-alias-bg-layer-2`（浮在其上的菜单）；这两个令牌在全部受支持的 DSH 版本（0.1.0-rc.7 起）都声明在 `body` 上，因此不依赖任何模糊效果或核心内部属性。
- Fix the composer seat's panel and model menu being translucent with the page text readable through them (issue #14): both painted `--dsw-specific-menu`, which is DSH core's 58%-translucent menu material and is only ever used together with `--dsw-menu-backdrop-filter`. Painted bare it provides no backing, so the effort labels behind the panel showed through it one-to-one. They now use the opaque, theme-aware surface tokens `--dsw-alias-bg-layer-1` (panel) and `--dsw-alias-bg-layer-2` (the menu floating over it). Both tokens are declared on `body` by every supported DSH release (0.1.0-rc.7 and later), so the fix depends on neither a blur effect nor a core-internal attribute.
- 修复推理等级刻度与滑块始终对不齐、且滑块拖不到两端：刻度行此前用 flex 均分，而圆点按 `i/(n-1)` 定位，首尾两个刻度因此各自内缩半格；两行现在读同一分数并改为绝对定位。更关键的是原生 range 的 thumb 必须整体留在轨道内，其圆心只能到达 `[半个 thumb 宽, 宽度 - 半个 thumb 宽]`，所以 thumb 永远够不到轨道两端（实测圆心偏差 −3.5…−21.5px）；现在轨道、填充与刻度行都按半个 thumb 内缩，偏差收敛到 1px 以内。刻度行的内缩用 margin 而非 padding：绝对定位子元素的 `left: N%` 基准是包含块的 padding box，父元素上的 padding 对它完全不起作用，用 padding 时每个刻度仍会偏离自己的圆点 2-3px。首尾两个刻度改为按朝外的边锚定到各自圆点的外边缘、文字向内展开——端点圆点只内缩 9px（半个 18px thumb，浏览器硬下限）而 "Max" 半宽 12.2px，居中会超出内容区 3.2px，且面板内边距在这个比较中会相消（12/20/28px 实测外溢都是 3.18px）、缩字号要压到 9.6px 才装得下，低于宿主定义的最小档。
- 修复模型菜单分组标题吸顶时半透明、展开分组时行尾三角位移：标题此前不吸顶，滚动后 provider 名称直接丢失；且 `background` 简写把不透明底色替换成了 8% 白的半透明令牌（`#ffffff14`），吸顶时下方选项透出。现在标题吸顶并偏移一个自身内边距以覆盖菜单的 padding（`top: 0` 只钉在 scrollport 即菜单的 padding box，菜单自身的 padding 区仍会漏出下层），悬停色改用 `background-image` 叠加在不透明底色之上而非替换它。展开某个 provider 时列表变长，Windows 上经典滚动条占布局宽度导致内容变窄、每行尾部三角整体左移，现由 `scrollbar-gutter: stable` 固定内容宽度；菜单同时采用宿主自己的滚动条令牌（`--dsh-scrollbar-thumb` 指向 L2），使其读起来属于菜单而非页面。
- 推理面板与模型菜单对齐 DSH 整体设计：面板内边距改为 12px（与官方 composer 浮层一致），两个浮层圆角统一用 `--dsw-radius-lg`（此前是 8px 与 6px，而 6px 不在宿主的圆角阶梯上），菜单与面板共用同一个内边距令牌以保持与内容边缘齐平（绝对定位子元素的 inset 相对父元素 padding box 解析，之前的 16px 内缩使菜单比内容边缘还内缩 4px）。面板字号改读宿主内容级联 `--dsh-content-font-size-secondary`（由 `dsh-client-ui-theme` 定义在 `body` 上），因此跟随设置里的字号偏好；菜单项为 34px 居中行、分组标题为 11px/16px 字重 500，均对齐官方模型菜单。模型行的焦点框从 `:focus-within` 收窄到按钮自身的 `:focus-visible`（前者鼠标按下也触发，整行画框看起来像一个输入框），模型行的三角在二级菜单展开时翻转为向上。
- Fix the reasoning scale never lining up with its slider, and the slider not reaching either end: the labels were divided evenly across the row while the pips were positioned at `i/(n-1)`, so the first and last labels each sat half a step inside; both rows now read the same fraction and the labels are absolutely positioned against it. More fundamentally, a native range keeps the thumb's whole box inside the track, so the thumb's centre can only travel between half a thumb at each end and could never reach the track's ends (measured at −3.5 to −21.5px). The track, the fill and the scale row are now inset by half a thumb, bringing the error under a pixel. The scale row is inset with a margin, not a padding: an absolutely positioned child resolves `left: N%` against the containing block's padding box, so padding on the parent does not move it at all, and with a padding every label still sat 2-3px off its own pip. The two end labels are now anchored by their outward edge to the outer edge of their own pip, growing inward — an end pip only sits 9px in (half an 18px thumb, the browser's own limit) while "Max" is 12.2px half its width, so centring overran the content box by 3.2px, and the panel's padding cancels out of that comparison (12, 20 and 28px all leave the same 3.18px overrun) while shrinking the label to fit would mean 9.6px, below the smallest step the host defines.
- Fix the model menu's provider heading going see-through while stuck, and row chevrons shifting when a group is expanded: the heading did not stick at all, so scrolling a long list lost the provider name, and the `background` shorthand replaced its opaque fill with an 8% white token (`#ffffff14`), letting the options underneath show through. The heading now sticks, offset by one of the menu's own paddings so it covers the padding area (`top: 0` pins to the scrollport, which is the menu's padding box, leaving the padding itself uncovered), and the hover colour is layered on top of the fill with `background-image` instead of substituting for it. Expanding a provider grew the list, a classic scrollbar took layout width on Windows, the content box narrowed and every row's trailing chevron shifted left; `scrollbar-gutter: stable` now fixes the content width. The menu also adopts the host's own scrollbar tokens (`--dsh-scrollbar-thumb` pointed at L2) so its thumb reads as part of the menu rather than of the page.
- Bring the composer seat panel and model menu onto the host's own design: the panel pads by 12px like the official composer surface, both floating surfaces round with `--dsw-radius-lg` (they carried 8px and 6px, and 6px is not on the host's radius scale), and the menu and panel read one shared padding token so they stay flush with the content edges — an absolute child's insets resolve against the parent's padding box, so the old hardcoded 16px left the menu 4px inside the content edges. The panel takes its type from the host's content scale, `--dsh-content-font-size-secondary`, which `dsh-client-ui-theme` declares on `body`, so it moves with the Settings font-size preference; the menu's cells are 34px centred rows and its group headings run 11px on 16px at weight 500, both matching the official model menu. The model row's focus frame is narrowed from `:focus-within` to the button's own `:focus-visible` (the former also fires on a mouse press, framing the whole row so it read as a text input), and the model row's chevron turns up while its second-level menu is open.

## [0.3.3] - 2026-09-23

### 修复 / Fixed

- 修复新增功能的按钮样式：启动提示的三个按钮与设置页的「重新扫描旧数据」此前渲染成未主题化的默认按钮，与旁边同类的按钮明显不一致。它们现在统一使用插件自己的按钮原语（28px 高、8px 圆角、按主次分级：迁移为主按钮、不再询问为次按钮、稍后为无边框），启动提示还在视觉上对齐了 DSH 自己的弹窗（24px 圆角、模糊遮罩、同一标题层级），候选行改为等宽字体并保留来源标签。
- Fix the new feature's buttons: the startup prompt's three controls and the settings page's "Rescan legacy data" rendered as untinted default buttons, visibly unlike the equivalent buttons beside them. They now use the plugin's own button primitive (28px tall, 8px radius, ranked by weight: Migrate is the filled action, Don't ask again an ordinary one, Later borderless), and the prompt follows DSH's own dialog treatment (24px radius, blurred mask, same title scale), with candidate rows in a monospace face and the provenance label kept alongside.

## [0.3.2] - 2026-09-23

### 变更 / Changed

- 发布前的兼容矩阵新增 `dsh-v0.1.7-alpha.1`（entry-config 设置模型）作为第五个官方能力代表，0.1.7 根节点上会验证插件确实加载成功、其设置分区被发布，以及宿主的三条行为（`llm-pi-ai` 的 `providers` 仍为 volatile；路径写入仍基于用户原始层；默认档位补齐自己的写入能够落盘）。
- The pre-publish compatibility matrix adds `dsh-v0.1.7-alpha.1` (the entry-config settings model) as a fifth official capability representative; the 0.1.7 root verifies that the plugin loads, that its settings section is published, and that three host behaviours hold (`llm-pi-ai`'s `providers` stays volatile; a path write is still derived from the raw user layer; the provider-defaults fill's own write lands).
- 修复 0.1.7 上默认档位补齐无法写回的问题：该版本把设置变更事件放在写入事务内部触发，插件在事务里再发起写入会被宿主以 `HMR transactions cannot be nested` 拒绝，而事务上下文会随 `AsyncLocalStorage` 传播到任何延迟调用。补齐现在从一个在插件加载时创建的执行上下文中发起写入，因此新增模型时会正常补上默认档位，无需重启。
- Fix the provider-defaults fill being unable to write back on 0.1.7: that release raises the settings-change event from inside its own write transaction, so a write started from the listener is refused with `HMR transactions cannot be nested` — and the transaction context travels with `AsyncLocalStorage` into anything the listener defers. The fill now starts its write from an execution context created while the plugin is applied, so a newly added model gets its default levels without a restart.
- 默认档位补齐改为只写入用户层：由组合 base 或 schema 默认值提供的模型不会被补全（0.1.7 的 entry-config 设置服务会把整棵解析后的子树落盘，为它们补全会把 `input`、`compat`、`headers`、`thinkingBudgets`、`defaultContextWindow` 等 schema 默认值钉进你的设置文档）。跳过的模型会在宿主日志中报出数量。
- The provider-default fill now writes through the user layer only: a model a composition base or a schema default supplies is left unfilled (under the 0.1.7 entry-config settings service a resolved subtree lands on disk whole, so filling those models pinned `input`, `compat`, `headers`, `thinkingBudgets`, `defaultContextWindow` and other schema defaults into your settings document). The Host logs how many models it skipped.

### 新增 / Added

- 设置页新增「会话值生成器」卡片，可在 UI 中读写 `opencodeSession.format` 的全部字段（生成模式、时间戳来源、模板 / 表达式 / 脚本路径、校验正则与校验失败策略），无需再手写设置文档。卡片按当前模式只显示相关字段，并在写入前校验：非法正则、空模板 / 表达式 / 脚本、相对脚本路径，以及无法解析或引用了不存在名字的表达式，都会被拦下并给出原因——这些取值在宿主侧会静默退化（正则失效为「不校验」、其余回退为派生值），UI 里看不到就会误导。表达式校验与宿主共用同一份解析代码。写入按字段进行，不覆盖同命名空间的其他配置。
- Add a "Session value generator" card to the settings page that reads and writes every `opencodeSession.format` field (mode, timestamp source, template / expression / script path, validation regex, and the on-invalid policy), so the settings document no longer has to be edited by hand. The card shows only the fields the current mode uses and validates before writing: an invalid regex, an empty template / expression / script, a relative script path, and an expression that does not parse or names something that does not exist are refused with a reason — each of those silently degrades on the Host side (the regex to "no validation at all", the rest to the derived value), so leaving them invisible in the UI would mislead. Expression validation shares one parser with the Host. Writes are field-level, so nothing else in the namespace is overwritten.

- 支持 DSH 0.1.7 的 entry-config 设置模型：插件现在导出根节点 `.volatile()` 的 `Config`，设置页表单才能在该版本上出现（此前插件在 0.1.7 上会以 `register is missing` 加载失败）。`0.1.7` 及以后设置分区使用 Loader 条目 ID `thinking-effort`，`0.1.0-rc.7` 至 `0.1.6` 仍使用注册的 namespace `dsh-thinking-effort`，客户端按宿主实际发布的那一个解析。`subagentEffort` 随之迁入本插件自己的设置分区；在 0.1.7 上旧的 `llm-pi-ai` 位置既不可写也不可读（该 schema 只声明 `providers`，写入其他路径会被整批拒绝，用户层投影也会丢掉未声明的键），所以升级前设在那里的默认值会显示为未设置，需要在插件设置卡片里重新选择。导入旧快照时插件会把 `llm-pi-ai` 里的这个键迁移到自己的分区，同一批次的 providers 也才能被接受。`0.1.7` 及以后的设置保存在当前 profile 的 `cordis.patch.yml`，而不再是 `~/.dsh/settings.yaml`（`0.1.7` 会重命名旧文件并尝试导入；对这个分区而言该导入会被拒绝并只留下警告，旧值仅保留在 `settings.yaml.imported` 中）。
- Support the DSH 0.1.7 entry-config settings model: the plugin now exports a root-`.volatile()` `Config`, which is what makes its settings form appear on that release at all (before, the plugin failed to load there with `register is missing`). On `0.1.7`+ the settings section is the Loader entry id `thinking-effort`, while `0.1.0-rc.7` through `0.1.6` keep the registered namespace `dsh-thinking-effort`, and the Client resolves whichever the running host publishes. `subagentEffort` moves into this plugin's own settings section; on 0.1.7 the old `llm-pi-ai` location is neither writable nor readable (that schema declares only `providers`, so a write to any other path is refused for the whole batch and the user layer drops undeclared keys), which means a default set there before the upgrade reads as unset and has to be chosen again in the plugin's settings card. Importing an older snapshot migrates that key out of `llm-pi-ai` into the plugin's own section, which is also what lets its providers import. Settings are now stored in the active profile's `cordis.patch.yml` instead of `~/.dsh/settings.yaml`, which `0.1.7` renames and tries to import; for this section that import is refused with only a warning, so the old value survives in `settings.yaml.imported` alone.

- 新增旧数据自动检测与迁移：DSH 0.1.7 把 `settings.yaml` 重命名并只导入一次，而旧版本插件在该版本上加载失败，因此你此前的思考档位与模型开关只留在 `settings.yaml.imported` 里。插件现在会在启动时扫描该文件（以及尚未重命名的 `settings.yaml` 与活的 `llm-pi-ai` 用户层），发现可迁移项后在设置页上方弹出询问，你确认后才把这些旧数据值写入插件自己的设置分区。迁移只补齐你尚未设置的值，绝不覆盖；写入前会先把当时的设置存进「配置备份与方案」的回滚槽（`autoBackup`，来源标记为 `migration`），且快照与迁移值在同一批写入中落盘，因此不会出现「有快照却没有迁移」的中间状态。选择「不再询问」后，仅当旧数据发生变化才会再次提示。
- Add automatic detection and migration of stranded legacy data: DSH 0.1.7 renames and imports `settings.yaml` exactly once, and older plugin releases failed to load on that version, so a user's thinking levels and model toggles survive only inside `settings.yaml.imported`. On startup the plugin now scans that file (plus a not-yet-renamed `settings.yaml` and the live `llm-pi-ai` user layer) and, when it finds migratable values, asks above the settings page before writing any of those legacy values into its own settings section. The migration only fills in values you have not set and never overwrites; before writing it saves the then-current settings into the Backup and profiles rollback slot (`autoBackup`, marked `sourceProfile: migration`), and the snapshot rides the same write batch as the migrated values, so there is no state in which a rollback copy exists without the migration. After you choose not to be asked again, it re-prompts only when the legacy data changes.

### 修复 / Fixed

- 修复两处只有真实宿主才会暴露的问题：迁移成功后弹窗不关闭（宿主尚未落地时的一次读取把提示重新打开，而重新打开后就不再轮询，于是过期候选与可用按钮一直留在屏幕上）；以及重启后对已迁移的值重复提示（宿主自己的分区尚未发布时扫描，`declared()` 看到的用户层为空，于是整批又被当作未迁移）。
- Fix two problems only a real host exposed: the prompt not closing after a successful migration (a read taken before the host had acted reopened it, and a reopened prompt stops polling, so stale candidates and live buttons stayed on screen), and a restart re-offering values that were already migrated (a scan taken before the plugin's own section was published saw an empty user layer, so `declared()` treated the whole set as unmigrated).
## [0.3.1] - 2026-09-19

### 新增 / Added

- 新增可配置的 OpenCode 会话 Header 生成器（`opencodeSession.format`）。开关打开且未配置 `format` 时，默认按 OpenCode Zen 规范格式生成随 DSH 会话绑定的确定性 `ses_` 值：`ses_` + 12 位十六进制（48 位毫秒时间戳，会话内首次使用时铸造一次）+ 14 位 Base62（DSH 会话 ID 归一化后的 80 位 SHA-256 摘要）。同一 DSH 会话内值恒定，不同会话（含每次子 agent 运行）各不相同，14 位后缀在 DSH 重启后仍然稳定。为应对上游格式变化，提供 `ses-derive` / `passthrough` / `template` / `expression` / `script` 四档生成模式、`time: firstUse | hash` 时间戳来源、`validate` 正则与 `onInvalid: warn | drop | send` 校验策略，均可通过设置文档手写配置、无需改代码或重建插件。
- Add a configurable OpenCode session Header generator (`opencodeSession.format`). With the switch on and no `format` configured, the Host now sends a deterministic `ses_` value bound to the DSH session in the canonical OpenCode Zen shape: `ses_` + 12 hex characters (a 48-bit millisecond timestamp minted once per session) + 14 Base62 characters (an 80-bit SHA-256 digest of the normalized DSH session id). The value is stable within one DSH session, distinct per session (including each subagent run), and its 14-character suffix survives DSH restarts. To keep up with upstream format changes, the generator supports `ses-derive` / `passthrough` / `template` / `expression` / `script` modes, a `time: firstUse | hash` timestamp source, and `validate` / `onInvalid` checks — all configurable in the settings document without code changes.
- 新增按 provider/model 的 `user-agent` 覆盖（`opencodeSession.userAgent`）。`llm-pi-ai` 适配器会强制自己的归因 `user-agent` 并删除同名的 provider 配置，因此本插件在请求离开前的最后一层改写该 header：支持路由级 `enabled`、模型级开关与可选的路由级值（优先于总 `value`），默认关闭，未命中的请求保持 DSH 归因 UA 不变。
- Add a per-provider/model `user-agent` override under `opencodeSession.userAgent`. Because the `llm-pi-ai` adapter forces its attribution `user-agent` and strips provider-configured values, this plugin rewrites the header at the last layer before the request leaves: routes can enable the override wholesale (`enabled`), exact models can be toggled, and an optional per-route `value` wins over the master `value`. Off by default; unmatched requests keep DSH's attribution header.

### 变更 / Changed

- OpenCode 会话 Header 的默认发送值从「原始 DSH 会话 ID」改为「符合上游格式的派生 `ses_` 值」；需要旧行为的用户可显式配置 `format: { mode: passthrough }`。
- The default `x-opencode-session` value changes from the raw DSH session id to a derived upstream-compliant `ses_` value; users who need the old behavior can configure `format: { mode: passthrough }`.

### 安全 / Security

- 配置快照导入默认不再应用 provider 的 `baseURL`、`apiKeyEnv`、`headers` 与 `opencodeSession.format.script`：这些属于本机部署接线，导入他人文件不再能改写请求终点或指定本地可执行模块。预览会提示被跳过的项数，并提供默认关闭、不粘滞的高级开关（issue #11）。
- Config snapshot import no longer applies a provider's `baseURL`, `apiKeyEnv`, or `headers`, nor `opencodeSession.format.script`: these are local deployment wiring, so importing someone else's file can no longer redirect requests or name a local module to execute. The preview reports how many entries were skipped and offers a default-off, non-sticky advanced opt-in (issue #11).

## [0.3.0] - 2026-09-16

### 新增 / Added

- 新增「配置备份与方案」：可把 `llm-pi-ai` 与 `dsh-thinking-effort` 两个 namespace 的用户层导出成 JSON 文件，在另一台机器或重装后导入恢复；也可在设置页内保存多份命名方案并切回。导入会显示新增 / 覆盖 / 删除的条数预览，默认使用「合并」（保留文件里没有的 provider），并可在预览中改选「替换」（完全以文件为准）；第一次写入前会自动留存一份可回滚的导入前快照，写入结果需要重启时会列出对应 namespace。整个功能复用现有 Settings 通道，同时支持新版 Remote Settings 与旧版 `connection.api.settings`，不新增依赖。
- Add "Backup and profiles": export the user layer of the `llm-pi-ai` and `dsh-thinking-effort` namespaces as a JSON file and import it on another machine or after a reinstall; save named profiles in the settings page and switch back to them. An import shows an added / overwritten / removed preview, defaults to merge (keeps providers the file omits), and can switch to replace (the file wins) in that preview; a rollback snapshot is kept automatically before the first write, and an apply that needs a restart names the namespaces involved. The feature reuses the existing Settings transport for both modern Remote Settings and the legacy `connection.api.settings`, with no new dependencies.

### 变更 / Changed

- 兼容层的版本映射上界由 `<0.1.6-0` 提升到 `<0.1.7-0`：已发布的 DSH `0.1.6-alpha.1` 经逐项核对后归入既有 modern 能力区间（modern Settings transport、`describe()` 返回 `user` 原始层、全部 15 个网关兼容字段、外部语言包、可选 takeover），不再被判定为未映射版本。
- Map the newest compatibility window to `<0.1.7-0` (was `<0.1.6-0`): the released DSH `0.1.6-alpha.1` was verified field by field to stay inside the existing modern window (modern Settings transport, `user`-layer `describe()` reads, all 15 gateway compat fields, external language packs, optional takeover) instead of being treated as unmapped.
- 发布前的兼容矩阵把最新能力代表从 `dsh-v0.1.5-rc.2` 升级为 `dsh-v0.1.6-alpha.1`，与 `dsh-v0.1.0-rc.7`、`dsh-v0.1.1-rc.2`、`dsh-v0.1.3-alpha.2` 一起构建并执行真实安装与兼容检查；真实浏览器 DOM 探针改在 `0.1.6-alpha.1` 上执行。
- The pre-publish compatibility matrix upgrades its newest capability representative from `dsh-v0.1.5-rc.2` to `dsh-v0.1.6-alpha.1`, built and tested alongside `dsh-v0.1.0-rc.7`, `dsh-v0.1.1-rc.2`, and `dsh-v0.1.3-alpha.2` with the official install and real compatibility checks; the real-browser DOM probe now runs on `0.1.6-alpha.1`.

## [0.2.4] - 2026-09-11

### 修复 / Fixed

- 修复折叠供应商时「模型能力与档位」页面仍显示该供应商的网关兼容性详情面板和保存按钮的问题。现在兼容面板与模型行一样遵循 `providerOpen` 门控，折叠供应商会隐藏整个面板；未保存的兼容性草稿会在重新展开时恢复，不会丢失（[#7](https://github.com/hytime/dsh-thinking-effort/issues/7)）。
- Fix the provider gateway-compat details panel (and its save button) staying visible under a collapsed provider header on the model capabilities settings page. The panel now follows the same `providerOpen` gate as the model rows, so collapsing a provider hides the whole panel; unsaved compat drafts are restored on re-expand and never lost ([#7](https://github.com/hytime/dsh-thinking-effort/issues/7)).
- 兼容层的版本映射覆盖到已发布的 DSH `0.1.5`：`0.1.5-rc.1` / `0.1.5-rc.2` 现在归入既有的 modern 能力区间（modern Settings transport、全部 15 个网关兼容字段、外部语言包、可选 takeover），不再被判定为未知版本。比最新区间更新的版本保持未映射：此时按宿主实际暴露的能力工作，并回退到运行时能力探测，不再静默关闭 takeover。
- Map the released DSH `0.1.5` line in the compatibility layer: `0.1.5-rc.1` / `0.1.5-rc.2` now fall inside the existing modern window (modern Settings transport, all 15 gateway compat fields, external language packs, optional takeover) instead of being treated as unknown. Releases newer than the newest window stay unmapped: they follow the capabilities the host exposes and fall back to runtime capability detection, so takeover is no longer silently disabled.
- 发布前的兼容矩阵新增第四个官方代表版本 `dsh-v0.1.5-rc.2`，与 `dsh-v0.1.0-rc.7`、`dsh-v0.1.1-rc.2`、`dsh-v0.1.3-alpha.2` 一起构建并执行真实安装与兼容检查；真实浏览器 DOM 探针改在最新代表版本上执行。同时让探针适配新宿主的引导流程（工作区对话框可能不出现）（[#9](https://github.com/hytime/dsh-thinking-effort/issues/9)）。
- The pre-publish compatibility matrix builds and tests a fourth official representative, `dsh-v0.1.5-rc.2`, alongside `dsh-v0.1.0-rc.7`, `dsh-v0.1.1-rc.2`, and `dsh-v0.1.3-alpha.2`, using the official install and real compatibility checks; the real-browser DOM probe now runs on the newest representative. The probe also tolerates the newer host's onboarding flow, where the workspace dialog may not appear ([#9](https://github.com/hytime/dsh-thinking-effort/issues/9)).

## [0.2.3] - 2026-09-09

### 变更 / Changed

- OpenCode 会话 Header 开关改为拨动即保存：切换开关时立即写入 `dsh-thinking-effort` Settings namespace，不再需要单独点击保存按钮。界面移除了该保存按钮和未保存标记；打开模型后显示的是已持久化的值。
- The OpenCode session Header switch now saves immediately on toggle: flipping the switch writes the `dsh-thinking-effort` Settings namespace right away, with no separate save button. The save button and unsaved marker were removed from the UI; reopening a model shows the persisted value.

## [0.2.2] - 2026-09-09

### 新增 / Added

- 新增模型级 OpenCode 会话 Header 开关。它默认关闭，只对精确的 `provider/model` 动态发送当前 DSH `sessionId` 作为 `x-opencode-session`，不保存固定值，也不会继承到同一路由的 GPT 或其他模型。已有的 `x-opencode-session` 会被保留，不会被覆盖；该设置支持新版 Remote Settings 和旧版 `connection.api.settings` 两种 Settings transport。
- Add a model-level OpenCode session Header switch. It is off by default and sends the current DSH `sessionId` as `x-opencode-session` only for the exact `provider/model`; it stores no fixed value and does not inherit to GPT or other models on the same route. An existing `x-opencode-session` is preserved and never overwritten; the setting supports both modern Remote Settings and legacy `connection.api.settings` transports.
- 文档补充 Sub2API/CPA 转发、静态 route Header 限制、`api` 协议不变，以及 Host 重启和 Web 刷新要求。
- Document Sub2API/CPA forwarding, the limitation of static route Headers, unchanged `api` protocol selection, and Host restart/Web refresh requirements.

### 修复 / Fixed

- 发布包不再把 `@deepseek-ai/dsh-settings` 作为运行时依赖；Host 直接使用宿主提供的 Settings `installSection` 或旧版 `register` 路径。这样在 `autoInstallPeers: false` 的 DSH profile 中不会引入第二份 Cordis 运行时，也不会因缺失的 peer 解析失败。
- The published package no longer depends on `@deepseek-ai/dsh-settings` at runtime; the Host uses the host-provided Settings `installSection` or the legacy `register` path directly. This avoids introducing a second Cordis runtime and failing peer resolution in DSH profiles with `autoInstallPeers: false`.

## [0.2.1] - 2026-09-08

### 新增 / Added

- 新增：Web 运行时提供 `modelDirectories` 服务时，注册 Composer 的可选 `seat`，按当前 `provider/model` 的宿主已解析 `reasoning.efforts` 显示离散推理档位；模型未声明 `defaultEffort` 时可恢复为「跟随模型默认」。控件使用宿主深浅色主题 token，通过会话模型选择提交，不修改 Settings 文档。
- Add an optional Composer `seat` when the Web runtime exposes `modelDirectories`. It renders host-resolved reasoning efforts for the current `provider/model`, supports **Follow model default**, follows host light/dark theme tokens, and submits through session model selection without mutating the Settings document.
- 新增中英日韩四语设置页、Composer、模型分组折叠和搜索截图画廊。
- Add a four-language screenshot gallery covering Settings, Composer, grouped model selection, and model search.

### 兼容性与界面 / Compatibility and UI

- 将官方 DSH 最新兼容代表更新为 `dsh-v0.1.3-alpha.2`，并扩展现代能力范围至 `<0.1.4-0`。
- Update the official DSH compatibility representative to `dsh-v0.1.3-alpha.2` and extend the modern capability range to `<0.1.4-0`.
- 优化设置页开关、模型编辑行、浅色/深色主题、未选档位圆点和 Follow model default 状态。
- Refine settings switches, model editor rows, light/dark theme states, unselected effort markers, and the Follow model default state.

## [0.2.0] - 2026-09-04

### 新增 / Added

- 新增：网关兼容性支持常用标量字段（`supportsStore`、`thinkingFormat`、`supportsThinkingTokenBudget` 等）的独立配置与自动继承，并按语义分组默认收起。
- Add independent configuration and automatic inheritance for common scalar gateway compatibility fields such as `supportsStore`, `thinkingFormat`, and `supportsThinkingTokenBudget`, grouped by meaning and collapsed by default.

## [0.1.14] - 网关能力映射与可选 takeover / Gateway capability mapping and optional takeover

### 发布兼容矩阵 / Release compatibility matrix

| 顺序 / Order | 官方 DSH 代表 / Official representative | 版本 / Version |
| --- | --- | --- |
| 1 | `dsh-v0.1.0-rc.7` | `0.1.0-rc.7` |
| 2 | `dsh-v0.1.1-rc.2` | `0.1.1-rc.2` |
| 3 | `dsh-v0.1.2-alpha.3` | `0.1.2-alpha.3` |

### 变更 / Changed

- 统一 `version-map.ts` 对 DSH Runtime transport、Gateway compat 字段和 takeover transport 的能力映射，并明确 rc7 不支持 `supportsDeveloperRole`/`maxTokensField`、rc8+ 支持。
- Unify capability mapping for DSH Runtime transports, Gateway compat fields, and takeover transport in `version-map.ts`; rc7 does not support `supportsDeveloperRole`/`maxTokensField`, while rc8+ does.
- 新增 rc7、rc2 和 alpha3 三个能力组合代表的独立加载与真实兼容性验证。
- Add independent loading and real compatibility checks for the rc7, rc2, and alpha3 capability-composition representatives.
- 支持可选的 `dsh-llm-openai-completions` takeover：仅在运行时支持 Gateway compat、目标供应商为自定义 OpenAI 兼容思考网关且 transport 已启用时生效。
- Support optional `dsh-llm-openai-completions` takeover only when the runtime supports Gateway compat, the target provider is a custom OpenAI-compatible thinking gateway, and the transport is enabled.
- Runtime capability detection is authoritative; optional version metadata never overrides detected runtime capabilities.
- 新增 provider 全局 `compat` 默认值和单模型覆盖：catalog 模型使用 `modelOverrides.<model>.compat`，`models[]` 模型使用 `models[].compat`。模型层只覆盖写出的字段，`Auto` 删除当前层字段并恢复 provider 继承；对同一路由（provider）而言，只要同时存在非空的 `models[]` 和非空的 `modelOverrides`，配置就无效，官方 schema 会拒绝该配置，插件对异常数据 fail closed。catalog/modelOverrides 与 `models[]` 两种模型形式都支持设置页单模型编辑；`models[]` 保存使用一个完整的 `providers.<route>.models` 数组 set，保留其他模型、未知字段和其他 compat 字段，不使用数组索引 path op。
- Add provider-wide `compat` defaults and per-model overrides: catalog models use `modelOverrides.<model>.compat`, while `models[]` entries use `models[].compat`. Model fields override the provider field-by-field, and `Auto` deletes the current-layer field to restore provider inheritance; for a given route/provider, any non-empty `models[]` together with any non-empty `modelOverrides` is invalid. The official schema rejects this configuration, and the plugin fails closed for malformed data. Both catalog/modelOverrides and `models[]` models support single-model editing in Settings; `models[]` saves use one complete `providers.<route>.models` array set that preserves other models, unknown fields, and other compat fields instead of an array-index path operation.
- 这些 compat 值只负责控制面配置，不实现外部 transport。
- These compat values configure the control plane only; the plugin does not implement external transport.

## [0.1.13] - 按兼容范围验证 / Range-based compatibility verification

### 变更 / Changed

- 将兼容层的版本诊断从逐版本枚举改为范围判断，并让发布 workflow 每个兼容范围只选择一个官方代表版本。
- Replace per-release compatibility enumeration with range-based version diagnostics, and make the release workflow select one official representative per compatibility range.

## [0.1.12] - 官方 alpha.3 兼容验证 / Official alpha.3 compatibility verification

### 变更 / Changed

- 将官方 DSH 兼容验证基线更新至 `dsh-v0.1.2-alpha.3`，并修正旧版 rc7 标签为官方实际的 `dsh-v0.1.0-rc.7`；Host/Client 运行逻辑保持不变。
- Update the official DSH compatibility baseline to `dsh-v0.1.2-alpha.3` and correct the legacy rc7 tag to the actual official `dsh-v0.1.0-rc.7`; Host and Client runtime behavior is unchanged.

## [0.1.11] - TypeScript 构建迁移与跨版本兼容 / TypeScript build migration and cross-version compatibility

### 变更 / Changed

- 将 Host 和 Client 运行时代码迁移到 TypeScript，并发布构建后的 `lib/index.js`、`lib/client.js` 及声明文件；行为和设置数据格式保持兼容。
- Migrate Host and Client runtime code to TypeScript and publish the built `lib/index.js`, `lib/client.js`, and declaration files; behavior and settings data formats remain compatible.
- 兼容适配器支持显式版本 metadata 或测试输入，但当前 DSH 没有公开的 semver metadata 契约，运行时能力探测是权威来源；未知合法版本按实际能力继续运行。新版 `remote.settings` 和旧版 `connection.api.settings` 均受支持。
- Runtime capability detection is authoritative because current DSH does not expose a public semver metadata contract; an optional version is used only when explicit metadata or test input supplies it. Unknown valid versions use the detected capabilities, and both modern `remote.settings` and legacy `connection.api.settings` are supported.
- 未知版本在所需能力满足时继续运行；能力不足时保持不可用，并继续隐藏不受支持的 `ja/ko` locale 选项。
- Unknown versions continue when required capabilities are present; otherwise the related feature remains unavailable, including hiding unsupported `ja/ko` locale options.


### 修复 / Fixed

- 客户端顶层只硬注入跨版本稳定服务（`slots`、`connection`、`locale`）；新版通过可选 Remote 服务探测（使用 `ctx.get` 并监听 `internal/service`）获取 Settings service，旧版继续回退 `connection.api.settings`。
- The client hard-injects only cross-version stable services (`slots`, `connection`, and `locale`); newer DSH hosts discover the optional Remote Settings service through `ctx.get` and `internal/service`, while older hosts continue using the `connection.api.settings` fallback.
- 没有 Remote provider 的旧版不会因可选 Remote 探测进入 pending。
- Older profiles without a Remote provider do not enter pending because Remote discovery is optional.
- 旧版 DSH 没有外部 locale catalog 时，设置页现在隐藏不可用的 `ja/ko` 选项，避免点击后触发未注册错误。
- On older DSH builds without an external locale catalog, the settings page now hides unavailable `ja/ko` options instead of allowing an unregistered-locale error.

## [0.1.9] - 兼容新版 DSH Remote / Support current DSH Remotes

### 修复 / Fixed

- 适配 DSH `0.1.2-alpha.1` 的 `ctx.remote.settings`，并保留旧版 `connection.api.settings` 回退。
- Adapt to DSH `0.1.2-alpha.1` `ctx.remote.settings` while retaining a legacy `connection.api.settings` fallback.
- 统一新版直接 `ClientResult` 与旧版 RPC 包装响应的读取和写入处理。
- Normalize current direct `ClientResult` responses and legacy RPC-wrapped settings responses.
- 更新日语和韩语 locale 说明，反映 DSH language-pack 动态注册支持。
- Update Japanese and Korean locale documentation for DSH language-pack registration.

## [0.1.8] - 修复子 agent 默认档位注入 / Fix subagent default effort injection

### 修复 / Fixed

- 修复 `agent/request` 未使用全局监听，导致子 agent 请求无法被插件处理。
- Fix the missing global `agent/request` listener that prevented the plugin from handling subagent requests.
- 修复 `llm-pi-ai` 设置命名空间延迟注册时 `subagentEffort` 缓存为空的问题。
- Read the current `subagentEffort` at request time so delayed namespace registration and later settings changes take effect.
- 新增 Host 侧回归测试，覆盖全局监听和实时配置读取。
- Add Host regression tests for global event registration and live settings reads.

## [0.1.7] - 日语和韩语本地化 / Japanese and Korean localization

### 新增 / Added

- 设置页新增 `日本語` 和 `한국어`，并继续支持中文与 English。
- Add Japanese and Korean settings-page localization while retaining Chinese and English.
- 四份语言字典统一由构建脚本校验并生成到客户端 bundle。
- Validate and generate all four locale dictionaries into the client bundle.
- 新增日语和韩语 README、INSTALL、CHANGELOG 文档，并提供四语言互链。
- Add Japanese and Korean README, INSTALL, and CHANGELOG documents with links across all four languages.

### 兼容性 / Compatibility

- 版本升级到 `0.1.7`，设置页版本水印同步显示 `v0.1.7`。
- Bump the package to `0.1.7`; the settings-page watermark shows `v0.1.7`.
- Host 行为、Cordis 组合条目 `thinking-effort`、设置 Slot ID 和运行时 ID 保持不变。
- Host behavior, the `thinking-effort` Cordis composition and settings Slot IDs, and runtime IDs remain unchanged.
- 日语和韩语切换需要 DSH 核心支持全局 locale ID；当前原版 DSH 中这两个选择项暂不可用。
- Japanese and Korean switching requires DSH core global locale IDs; the two entries are not usable on current stock DSH.



### 变更 / Changed

- `README.md` 和 `INSTALL.md` 现在是默认英文文档入口。
- `README.md` and `INSTALL.md` are now the default English documentation entrypoints.
- 中文文档分别移动到 `README.zh.md` 和 `INSTALL.zh.md`，并通过链接手动切换。
- Chinese documentation is provided as `README.zh.md` and `INSTALL.zh.md`, with explicit links for manual switching.
- npm 包文件白名单同步新的文档文件名。
- Update the npm package file list for the renamed documentation files.

## [0.1.5] - 设置页版本信息与中英文支持 / Settings version and bilingual UI

### 新增 / Added

- 在插件设置页右下角增加低对比度版本水印，例如 `v0.1.5`。
- Add a low-contrast version watermark such as `v0.1.5` to the plugin settings page.
- 设置页支持中文和英文，默认优先使用 DSH 的持久化 locale，其次使用浏览器语言，最后回退中文；页面可以手动选择语言，选择会持久化。
- Add Chinese and English support with persisted DSH locale, browser-language detection, and Chinese fallback; the page provides a persistent language selector.
- 中英文语言文件分别维护在 `src/locales/zh.json` 和 `src/locales/en.json`，发布前生成到客户端 bundle。
- Maintain Chinese and English dictionaries separately in `src/locales/zh.json` and `src/locales/en.json`, then generate them into the client bundle before publishing.

### 修复 / Fixed

- 修复模型档位写入路径，避免使用数组下标路径导致 settings schema 校验失败。
- Fix model effort writes that used array-index paths and could fail settings schema validation.
- 按路由整体更新 `models` 和 `modelOverrides` 时保留未编辑的模型字段。
- Preserve untouched model fields when updating `models` and `modelOverrides` by route.
- 修复批量档位预设在多个路由之间互相覆盖的问题。
- Fix batch presets overwriting values across routes.
- 修复设置页刷新后子 agent 自定义线上值丢失的问题。
- Preserve custom subagent wire values after refreshing the settings page.
- 将子 agent 自定义线上值映射回当前模型支持的 DSH 标准档位。
- Map custom subagent wire values back to the DSH effort supported by the selected model.

### 兼容性 / Compatibility

- npm 包、浏览器 loader、宿主和客户端运行时 ID 统一为 `@hytime/dsh-thinking-effort`。
- The npm package, browser loader, host runtime, and client runtime use `@hytime/dsh-thinking-effort` consistently.
- Cordis 组合条目 ID 和设置页 Slot ID 继续使用 `thinking-effort`。
- The Cordis composition and settings Slot IDs remain `thinking-effort`.

### 文档 / Documentation

- README.md 和 INSTALL.md 现在作为英文主文档，中文版本分别为 `README.zh.md` 和 `INSTALL.zh.md`。
- `README.md` and `INSTALL.md` are now the primary English documents; Chinese versions are `README.zh.md` and `INSTALL.zh.md`.
- 补充官方 DSH CLI 的安装、升级、卸载、旧包迁移和验证流程。
- Document official DSH CLI installation, upgrade, removal, old-package migration, and verification.

## [0.1.4] - 运行时 ID 统一与配置修复 / Runtime identity and configuration fixes

### 修复 / Fixed

- 修复模型档位写入、批量预设和子 agent 自定义映射问题。
- Fix model effort writes, batch presets, and custom subagent effort mapping.
- 修复 scoped client bundle 与 DSH loader 注册 ID 不一致的问题。
- Fix the mismatch between the scoped client bundle and the DSH loader registration ID.

### 文档 / Documentation

- 增加官方插件生命周期和旧包迁移说明。
- Add official plugin lifecycle and old-package migration documentation.

## [0.1.3] - 修复 scoped 浏览器 bundle 注册 / Scoped browser bundle registration

### 修复 / Fixed

- 将 `__ModuleLoader__.load` 的注册 ID 从旧的 `dsh-thinking-effort` 改为 `@hytime/dsh-thinking-effort`。
- Change the `__ModuleLoader__.load` registration ID from `dsh-thinking-effort` to `@hytime/dsh-thinking-effort`.
- 修复 scoped npm 包安装后 Web 页面加载插件失败的问题。
- Fix Web plugin loading after installing the scoped npm package.

### 测试 / Tests

- 增加浏览器 bundle 注册 ID 回归测试。
- Add a regression test for browser bundle registration.

## [0.1.2] - 切换 scoped npm 包 / Switch to the scoped npm package

### 变更 / Changed

- npm 包名切换为 `@hytime/dsh-thinking-effort`。
- Rename the npm package to `@hytime/dsh-thinking-effort`.
- `cordis.patch.yml` 的 bundle name 切换为 scoped 包名。
- Update the bundle name in `cordis.patch.yml` to the scoped package name.
- README 和 INSTALL 同步 scoped npm 安装、挂载和卸载命令。
- Update README and INSTALL with scoped npm installation, mounting, and removal commands.

## [0.1.1] - 首次公开发布准备 / First public release preparation

### 变更 / Changed

- 完善 npm 发布元数据，包括 repository、homepage、bugs 和 public access 配置。
- Complete npm publication metadata, including repository, homepage, bugs, and public access settings.
- 重新编写 README，补充使用场景、快速开始、限制和排查说明。
- Rewrite the README with use cases, quick start, limitations, and troubleshooting.
- 补充 GitHub 和 npm 安装入口。
- Add GitHub and npm installation paths.

## [0.1.0] - 初始版本 / Initial release

### 新增 / Added

- 宿主侧自动为缺少 `reasoningEfforts` 的第三方模型补充 `off`、`high`、`max` 默认档位。
- Add host-side `off`, `high`, and `max` defaults to third-party models without `reasoningEfforts`.
- 浏览器设置页支持按模型勾选档位并填写发送给网关的线上值。
- Add a browser settings page for per-model levels and gateway wire values.
- 支持将 DSH 标准档位映射为网关自定义值，例如 `high → ultra`。
- Map DSH levels to gateway-specific values such as `high → ultra`.
- 支持通过快捷预设批量应用档位。
- Add batch effort presets.
- 支持配置子 agent 默认思考强度。
- Add configurable default reasoning effort for subagents.
