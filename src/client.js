/**
 * dsh-thinking-effort-client — 浏览器半区 bundle。
 *
 * 注册“设置 → 思考强度档位”页面：按路由列出 pi-ai 手工声明模型，
 * 逐模型自定义思考档位（勾选档位 + 自由填写发送给网关的线上值）。
 * 数据经标准 API client（connection.api.settings）读写，无需自定义 remote。
 *
 * 本文件即产物 bundle：CJS 工厂经 window.__ModuleLoader__.load 注册，
 * 与 tsdown 生成的 client bundle 格式一致（手写、内联样式、零构建）。
 */
window.__ModuleLoader__.load({
  id: '@hytime/dsh-thinking-effort',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require('react');

    const ALL_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    const PRESETS = [
      { key: 'official', levels: { off: null, high: 'high', max: 'max' }, labelKey: 'presetOfficial' },
      { key: 'generic', levels: { off: null, low: 'low', medium: 'medium', high: 'high' }, labelKey: 'presetGeneric' },
    ];
    const NS = 'llm-pi-ai';
    const LOCALE_NS = 'settings.thinkingEffort';
    const PLUGIN_VERSION = '0.1.5';
    const DEFAULT_LEVELS = { off: null, high: 'high', max: 'max' };
    const LEVEL_LABEL_KEYS = {
      off: 'levelOff', minimal: 'levelMinimal', low: 'levelLow', medium: 'levelMedium',
      high: 'levelHigh', xhigh: 'levelXhigh', max: 'levelMax',
    };
    /* BEGIN GENERATED LOCALE DATA */
    const LOCALE_DATA = {"zh":{"title":"第三方模型思考强度档位","description":"勾选档位后，右侧输入框可自由定义发送给网关的线上值。例如给 high 填 ultra，Composer 选中 High 时网关会收到 ultra。未设置档位的模型自动采用默认档位（Off / High / Max）。","subagentTitle":"子 agent 思考强度（Subagent 默认档位）","currentDefault":"当前默认：{effort}","unconfiguredSubagent":"未配置（子 agent 继承主 agent / 提供方默认）","providerDefault":"提供方默认","apply":"应用","presetOfficial":"应用到全部：Off / High / Max（官方 DeepSeek 风格）","presetGeneric":"应用到全部：Off / Low / Medium / High（通用）","searchPlaceholder":"搜索模型（名称或 ID）…","loading":"加载中…","noModels":"没有手工声明的 pi-ai 模型","noMatches":"没有匹配的模型","noDeclared":"未声明","route":"路由：{route}","customize":"自定义档位","collapse":"收起","editorTitle":"编辑档位（勾选后填写线上值，点击“应用此档位”保存）","applyLevel":"应用此档位","restoreDefault":"恢复默认档位","expandedCount":"已展开 {count} 个模型，可编辑档位","versionLabel":"插件版本","languageLabel":"页面语言","languageChinese":"中文","languageEnglish":"English","customPlaceholder":"自定义档位，如 ultra","offPlaceholder":"留空 = 不发送","wirePlaceholder":"自定义线上值，如 ultra","noNamespace":"未找到 llm-pi-ai 设置命名空间（无第三方模型配置）。","customEffortRequired":"请输入自定义思考档位","levelNeedsValue":"档位 {level} 需要填写线上值","atLeastThinking":"至少需要一个思考档位","readSettingsFailed":"读取设置失败：{message}","writeFailed":"写入失败，请重试","writeError":"写入失败：{message}","levelOff":"off","levelMinimal":"minimal","levelLow":"low","levelMedium":"medium","levelHigh":"high","levelXhigh":"xhigh","levelMax":"max"},"en":{"title":"Third-party model reasoning effort","description":"Select an effort and enter the exact value sent to the gateway. For example, set high to ultra to send ultra when High is selected in Composer. Models without a declaration use the default options (Off / High / Max).","subagentTitle":"Subagent reasoning effort","currentDefault":"Current default: {effort}","unconfiguredSubagent":"Not configured (subagents inherit the provider default)","providerDefault":"Provider default","apply":"Apply","presetOfficial":"Apply to all: Off / High / Max (official DeepSeek style)","presetGeneric":"Apply to all: Off / Low / Medium / High (generic)","searchPlaceholder":"Search models by name or ID…","loading":"Loading…","noModels":"No hand-declared pi-ai models","noMatches":"No matching models","noDeclared":"Not declared","route":"Route: {route}","customize":"Customize effort","collapse":"Collapse","editorTitle":"Edit effort (select a level, enter its wire value, then apply)","applyLevel":"Apply effort","restoreDefault":"Restore defaults","expandedCount":"{count} models expanded","versionLabel":"Plugin version","languageLabel":"Page language","languageChinese":"中文","languageEnglish":"English","customPlaceholder":"Custom effort, e.g. ultra","offPlaceholder":"Empty = do not send","wirePlaceholder":"Custom wire value, e.g. ultra","noNamespace":"llm-pi-ai settings were not found (no third-party model configuration).","customEffortRequired":"Enter a custom reasoning effort","levelNeedsValue":"Effort {level} needs a wire value","atLeastThinking":"Select at least one reasoning effort","readSettingsFailed":"Failed to read settings: {message}","writeFailed":"Write failed. Please try again.","writeError":"Write failed: {message}","levelOff":"off","levelMinimal":"minimal","levelLow":"low","levelMedium":"medium","levelHigh":"high","levelXhigh":"xhigh","levelMax":"max"}};
    const { zh, en } = LOCALE_DATA;
    /* END GENERATED LOCALE DATA */

    function btn(text, onClick, disabled) {
      return React.createElement('button', {
        type: 'button',
        disabled: disabled === true,
        onClick,
        style: {
          fontSize: '12px', padding: '4px 12px', borderRadius: '12px',
          border: '1px solid currentColor', background: 'transparent',
          cursor: disabled === true ? 'default' : 'pointer',
          opacity: disabled === true ? 0.5 : 1,
        },
      }, text);
    }

    function draftFrom(levels) {
      const draft = {};
      for (const level of ALL_LEVELS) {
        const wire = levels && typeof levels === 'object' && levels[level] !== undefined
          ? (levels[level] === null ? '' : String(levels[level]))
          : '';
        draft[level] = { on: wire !== '' || (level === 'off' && levels && levels.off === null), wire };
      }
      return draft;
    }

    function buildLevels(draft) {
      const out = {};
      for (const level of ALL_LEVELS) {
        const cell = draft[level];
        if (!cell || !cell.on) continue;
        if (level === 'off') out[level] = cell.wire && cell.wire.trim() !== '' ? cell.wire.trim() : null;
        else out[level] = cell.wire.trim();
      }
      return out;
    }

    function validateLevels(levels, t) {
      let hasThinking = false;
      for (const [level, wire] of Object.entries(levels)) {
        if (level === 'off') continue;
        hasThinking = true;
        if (typeof wire !== 'string' || wire.length === 0) {
          return t('levelNeedsValue', { level: t(LEVEL_LABEL_KEYS[level] || level) });
        }
      }
      if (!hasThinking) return t('atLeastThinking');
      return null;
    }

    /** 从 settings.describe 的 llm-pi-ai 命名空间构建模型清单（含数组下标/覆写标记）。 */
    function inventoryFrom(ns) {
      const out = [];
      if (!ns || typeof ns.value !== 'object' || ns.value === null) return out;
      const providers = ns.value.providers;
      if (typeof providers !== 'object' || providers === null) return out;
      for (const [route, profile] of Object.entries(providers)) {
        if (typeof profile !== 'object' || profile === null) continue;
        if (Array.isArray(profile.models)) {
          profile.models.forEach((entry, index) => {
            if (typeof entry !== 'object' || entry === null) return;
            out.push({
              route, model: entry.id,
              name: typeof entry.name === 'string' && entry.name.length ? entry.name : entry.id,
              levels: entry.reasoningEfforts === undefined ? null : entry.reasoningEfforts,
              raw: entry,
              index, inOverrides: false,
            });
          });
        }
        if (typeof profile.modelOverrides === 'object' && profile.modelOverrides !== null) {
          for (const [id, entry] of Object.entries(profile.modelOverrides)) {
            const obj = typeof entry === 'object' && entry !== null ? entry : {};
            out.push({
              route, model: id,
              name: typeof obj.name === 'string' && obj.name.length ? obj.name : id,
              levels: obj.reasoningEfforts === undefined ? null : obj.reasoningEfforts,
              raw: obj,
              index: -1, inOverrides: true,
            });
          }
        }
      }
      return out;
    }

    /**
     * 构造档位写入 ops。
     *
     * settings.mutate 的 path 只支持对象字段；把数组下标（models/0/...）
     * 当作路径继续下钻会把 models 解析成对象，最终触发 schema 校验失败。
     * 因此按路由整体替换 models/modelOverrides，同时保留所有未编辑字段。
     */
    function setOps(inventory, updates) {
      const groups = {};
      for (const update of updates) {
        const item = update && update.item;
        if (!item) continue;
        const type = item.inOverrides ? 'modelOverrides' : 'models';
        const key = item.route + '\u0000' + type;
        if (!groups[key]) groups[key] = { route: item.route, type, updates: [] };
        groups[key].updates.push(update);
      }
      return Object.values(groups).map((group) => {
        const candidates = inventory.filter((item) => item.route === group.route
          && (group.type === 'modelOverrides' ? item.inOverrides : !item.inOverrides));
        if (group.type === 'modelOverrides') {
          const overrides = {};
          for (const item of candidates) {
            overrides[item.model] = item.raw && typeof item.raw === 'object' ? { ...item.raw } : {};
          }
          for (const update of group.updates) {
            const item = update.item;
            overrides[item.model] = { ...(overrides[item.model] || {}), reasoningEfforts: update.levels };
          }
          return { op: 'set', path: ['providers', group.route, 'modelOverrides'], value: overrides };
        }
        const models = candidates.slice().sort((a, b) => a.index - b.index).map((item) => {
          const update = group.updates.find((candidate) => candidate.item.index === item.index
            && candidate.item.model === item.model);
          const raw = item.raw && typeof item.raw === 'object' ? { ...item.raw } : { id: item.model };
          return update ? { ...raw, reasoningEfforts: update.levels } : raw;
        });
        return { op: 'set', path: ['providers', group.route, 'models'], value: models };
      });
    }

    function SectionEditor(props) {
      const connection = props.__connection;
      const locale = props.__locale;
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const [state, setState] = React.useState({
        loading: true, inventory: [], revision: 0, expanded: {}, drafts: {},
        busy: false, error: null, query: '', nsFound: true,
        subagent: null, subagentDraft: 'default', subagentCustom: '',
      });

      const load = () => {
        setState(s => ({ ...s, loading: true, error: null }));
        connection.api.settings.describe({}).then((response) => {
          if (!response.result.ok) {
            setState(s => ({ ...s, loading: false, busy: false, error: t('readSettingsFailed', { message: response.result.error.message }) }));
            return;
          }
          const namespaces = response.result.value.namespaces || [];
          const ns = namespaces.find(n => n.ns === NS);
          if (!ns) {
            setState(s => ({ ...s, loading: false, busy: false, nsFound: false, inventory: [], subagent: null }));
            return;
          }
          // 子 agent 默认思考强度：存储在 llm-pi-ai 用户层顶层键 subagentEffort
          // （pi-ai schema 会忽略该键但原样持久化，因此从 user 层读取）。
          const rawUser = ns.user && typeof ns.user === 'object' ? ns.user : {};
          const subagent = {
            effort: typeof rawUser.subagentEffort === 'string' && rawUser.subagentEffort.length > 0
              ? rawUser.subagentEffort
              : null,
            revision: typeof ns.revision === 'number' ? ns.revision : 0,
          };
          const subagentDraft = subagent.effort === null
            ? 'default'
            : ALL_LEVELS.includes(subagent.effort) ? subagent.effort : 'custom';
          const subagentCustom = subagentDraft === 'custom' ? subagent.effort : '';
          setState(s => ({
            ...s, loading: false, busy: false, nsFound: true,
            inventory: inventoryFrom(ns), revision: typeof ns.revision === 'number' ? ns.revision : 0,
            subagent, subagentDraft, subagentCustom,
          }));
        }).catch((error) => {
          setState(s => ({ ...s, loading: false, busy: false, error: t('readSettingsFailed', { message: error && error.message ? error.message : String(error) }) }));
        });
      };

      React.useEffect(() => { load(); }, []);

      const runOps = (ops) => {
        setState(s => ({ ...s, busy: true, error: null }));
        connection.api.settings.mutate({ ns: NS, ops, expectedRevision: state.revision }).then((response) => {
          if (!response.result.ok) {
            setState(s => ({ ...s, busy: false, error: t('writeError', { message: response.result.error.message }) }));
            return;
          }
          load();
        }).catch(() => {
          setState(s => ({ ...s, busy: false, error: t('writeFailed') }));
        });
      };

      const applyModel = (item) => {
        const key = item.route + '/' + item.model;
        const levels = buildLevels(state.drafts[key] || {});
        const err = validateLevels(levels, t);
        if (err) { setState(s => ({ ...s, error: err })); return; }
        runOps(setOps(state.inventory, [{ item, levels }]));
      };

      const restoreDefault = (item) => { runOps(setOps(state.inventory, [{ item, levels: DEFAULT_LEVELS }])); };
      const applyPreset = (levels) => {
        const updates = state.inventory.map(item => ({ item, levels }));
        runOps(setOps(state.inventory, updates));
      };

      // 子 agent 思考强度：写入本插件命名空间 dsh-thinking-effort。
      const applySubagentEffort = () => {
        const ops = [];
        if (state.subagentDraft === 'default') {
          ops.push({ op: 'unset', path: ['subagentEffort'] });
        } else {
          const value = state.subagentDraft === 'custom'
            ? state.subagentCustom.trim()
            : state.subagentDraft;
          if (value.length === 0) {
            setState(s => ({ ...s, error: t('customEffortRequired') }));
            return;
          }
          ops.push({ op: 'set', path: ['subagentEffort'], value });
        }
        setState(s => ({ ...s, busy: true, error: null }));
        connection.api.settings.mutate({ ns: NS, ops, expectedRevision: state.subagent ? state.subagent.revision : 0 }).then((response) => {
          if (!response.result.ok) {
            setState(s => ({ ...s, busy: false, error: t('writeError', { message: response.result.error.message }) }));
            return;
          }
          load();
        }).catch((error) => {
          setState(s => ({ ...s, busy: false, error: t('writeError', { message: error && error.message ? error.message : String(error) }) }));
        });
      };

      const keyOf = (item) => item.route + '/' + item.model;
      const toggleExpand = (item) => {
        const key = keyOf(item);
        setState(s => {
          const expanded = { ...s.expanded };
          if (expanded[key]) {
            delete expanded[key];
            return { ...s, expanded };
          }
          expanded[key] = true;
          const drafts = { ...s.drafts, [key]: draftFrom(item.levels) };
          return { ...s, expanded, drafts };
        });
      };
      const patchDraft = (item, level, patch) => {
        const key = keyOf(item);
        setState(s => ({
          ...s,
          drafts: { ...s.drafts, [key]: { ...s.drafts[key], [level]: { ...s.drafts[key][level], ...patch } } },
        }));
      };

      const inventory = state.inventory;
      const query = (state.query || '').trim().toLowerCase();
      const visible = query === ''
        ? inventory
        : inventory.filter(i => String(i.model || '').toLowerCase().includes(query)
          || String(i.name || '').toLowerCase().includes(query));
      const routes = [];
      for (const item of visible) { if (!routes.includes(item.route)) routes.push(item.route); }
      const expandedCount = Object.keys(state.expanded).length;
      const localeSnapshot = locale.getSnapshot();
      const levelLabel = (level) => t(LEVEL_LABEL_KEYS[level] || level);

      const summary = (item) => {
        const parts = [];
        if (item.levels) {
          for (const [level, wire] of Object.entries(item.levels)) {
            parts.push(wire === null ? levelLabel(level) : levelLabel(level) + '→' + wire);
          }
        }
        return parts.length ? parts.join('  ') : t('noDeclared');
      };

      const subagentOptions = [['default', t('providerDefault')]]
        .concat(ALL_LEVELS.map(level => [level, levelLabel(level)]))
        .concat([['custom', t('customize')]]);

      return React.createElement('div', { style: { position: 'relative', boxSizing: 'border-box', padding: '8px 12px 32px' } },
        React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end', fontSize: '12px', marginBottom: '6px' } },
          t('languageLabel'),
          React.createElement('select', {
            value: localeSnapshot.active,
            onChange: (e) => locale.setLocale(e.target.value),
            style: { height: '26px', padding: '0 6px', border: '1px solid rgba(128,128,128,0.35)', borderRadius: '6px', fontSize: '12px', background: 'transparent', color: 'inherit' },
          },
            React.createElement('option', { value: 'zh' }, t('languageChinese')),
            React.createElement('option', { value: 'en' }, t('languageEnglish')),
          ),
        ),
        React.createElement('h3', { style: { fontSize: '15px', fontWeight: 600, margin: '0 0 4px' } }, t('title')),
        React.createElement('p', { style: { fontSize: '12px', opacity: 0.75, margin: '0 0 10px' } }, t('description')),
        state.error ? React.createElement('p', { style: { fontSize: '12px', color: '#d92d20', margin: '0 0 8px' } }, state.error) : null,
        React.createElement('div', { style: { border: '1px solid rgba(128,128,128,0.25)', borderRadius: '8px', padding: '10px', marginBottom: '12px' } },
          React.createElement('div', { style: { fontSize: '13px', fontWeight: 600, marginBottom: '4px' } }, t('subagentTitle')),
          React.createElement('div', { style: { fontSize: '12px', opacity: 0.75, marginBottom: '8px' } },
            state.subagent
              ? t('currentDefault', { effort: state.subagent.effort || t('providerDefault') })
              : t('unconfiguredSubagent')),
          React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
            React.createElement('select', {
              value: state.subagentDraft,
              disabled: state.busy,
              onChange: (e) => setState(s => ({ ...s, subagentDraft: e.target.value })),
              style: { height: '28px', padding: '0 8px', border: '1px solid rgba(128,128,128,0.35)', borderRadius: '6px', fontSize: '12px', background: 'transparent', color: 'inherit' },
            }, subagentOptions.map(function (pair) {
              return React.createElement('option', { key: pair[0], value: pair[0] }, pair[1]);
            })),
            state.subagentDraft === 'custom'
              ? React.createElement('input', {
                  type: 'text',
                  value: state.subagentCustom,
                  placeholder: t('customPlaceholder'),
                  style: { flex: 1, minWidth: '140px', height: '28px', padding: '0 8px', border: '1px solid rgba(128,128,128,0.35)', borderRadius: '6px', fontSize: '12px', background: 'transparent', color: 'inherit' },
                  onChange: (e) => setState(s => ({ ...s, subagentCustom: e.target.value })),
                })
              : null,
            btn(t('apply'), applySubagentEffort, state.busy),
          ),
        ),
        state.nsFound === false
          ? React.createElement('p', { style: { fontSize: '12px', opacity: 0.75 } }, t('noNamespace'))
          : React.createElement('div', null,
            React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' } },
              PRESETS.map(p => btn(t(p.labelKey), () => applyPreset(p.levels), state.busy)),
            ),
            React.createElement('input', {
              type: 'text',
              value: state.query,
              placeholder: t('searchPlaceholder'),
              style: { boxSizing: 'border-box', width: '100%', height: '30px', padding: '0 10px', marginBottom: '10px', border: '1px solid rgba(128,128,128,0.35)', borderRadius: '8px', fontSize: '13px', background: 'transparent', color: 'inherit' },
              onChange: (e) => setState(s => ({ ...s, query: e.target.value })),
            }),
            state.loading
              ? React.createElement('div', { style: { fontSize: '12px', opacity: 0.7 } }, t('loading'))
              : visible.length === 0
                ? React.createElement('div', { style: { fontSize: '12px', opacity: 0.7 } }, inventory.length === 0 ? t('noModels') : t('noMatches'))
                : routes.map(route => React.createElement('div', { key: route, style: { marginBottom: '12px' } },
                    React.createElement('div', { style: { fontSize: '13px', fontWeight: 600, marginBottom: '6px' } }, t('route', { route })),
                    visible.filter(i => i.route === route).map(item => {
                      const key = keyOf(item);
                      const open = state.expanded[key] === true;
                      const draft = state.drafts[key];
                      return React.createElement('div', { key: key, style: { border: open ? '2px solid #4f8cff' : '1px solid rgba(128,128,128,0.25)', borderRadius: '8px', padding: '8px', marginBottom: '6px', background: open ? 'rgba(128,128,128,0.1)' : 'transparent' } },
                        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
                          React.createElement('span', { style: { fontSize: '13px' } }, item.model),
                          React.createElement('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
                            React.createElement('span', { style: { fontSize: '12px', opacity: 0.7 } }, summary(item)),
                            btn(open ? t('collapse') + ' ▲' : t('customize') + ' ▼', () => toggleExpand(item), false),
                          ),
                        ),
                        open && draft
                          ? React.createElement('div', { style: { marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed rgba(128,128,128,0.3)' } },
                            React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, t('editorTitle')),
                            ALL_LEVELS.map(level => {
                              const cell = draft[level];
                              return React.createElement('label', { key: level, style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '12px' } },
                                React.createElement('input', {
                                  type: 'checkbox',
                                  checked: cell.on,
                                  disabled: state.busy,
                                  onChange: (e) => patchDraft(item, level, { on: e.target.checked }),
                                }),
                                React.createElement('span', { style: { width: '64px' } }, levelLabel(level)),
                                cell.on
                                  ? React.createElement('input', {
                                    type: 'text',
                                    value: cell.wire,
                                    disabled: state.busy,
                                    placeholder: level === 'off' ? t('offPlaceholder') : t('wirePlaceholder'),
                                    style: { flex: 1, minWidth: '120px', height: '24px', padding: '0 6px', border: '1px solid rgba(128,128,128,0.35)', borderRadius: '6px', fontSize: '12px', background: 'transparent', color: 'inherit' },
                                    onChange: (e) => patchDraft(item, level, { wire: e.target.value }),
                                  })
                                  : null,
                              );
                            }),
                            React.createElement('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
                              btn(t('applyLevel'), () => applyModel(item), state.busy),
                              btn(t('restoreDefault'), () => restoreDefault(item), state.busy),
                            ),
                          )
                          : null,
                      );
                    }),
                  )),
            expandedCount > 0
              ? React.createElement('div', { style: { fontSize: '12px', opacity: 0.7, marginTop: '4px' } }, t('expandedCount', { count: expandedCount }))
              : null,
          ),
          React.createElement('span', {
            'aria-label': t('versionLabel'),
            style: {
              position: 'absolute', right: '12px', bottom: '8px', fontSize: '10px',
              lineHeight: '14px', opacity: 0.45, pointerEvents: 'none', userSelect: 'none',
            },
          }, 'v' + PLUGIN_VERSION),
      );
    }

    module.exports = {
      name: '@hytime/dsh-thinking-effort',
      inject: ['slots', 'connection', 'locale'],
      apply(ctx) {
        const slots = ctx.get('slots');
        if (slots === undefined) return;
        const connection = ctx.get('connection');
        if (connection === undefined) return;
        const locale = ctx.get('locale');
        if (locale === undefined) return;
        ctx.effect(() => locale.register(LOCALE_NS, { zh, en }), 'dsh-thinking-effort: dictionaries');
        const t = locale.bind(LOCALE_NS);
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'thinking-effort', order: 12, locale: LOCALE_NS, label: () => t('title') },
          (props) => React.createElement(SectionEditor, Object.assign({}, props, { __connection: connection, __locale: locale })),
        ));
      },
    };

    return module.exports;
  },
});
