/**
 * dsh-pi-effort-client — 浏览器半区 bundle。
 *
 * 注册“设置 → 思考强度档位”页面：按路由列出 pi-ai 手工声明模型，
 * 逐模型自定义思考档位（勾选档位 + 自由填写发送给网关的线上值）。
 * 数据经标准 API client（connection.api.settings）读写，无需自定义 remote。
 *
 * 本文件即产物 bundle：CJS 工厂经 window.__ModuleLoader__.load 注册，
 * 与 tsdown 生成的 client bundle 格式一致（手写、内联样式、零构建）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-pi-effort-client',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require('react');

    const ALL_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    const PRESETS = [
      { key: 'official', levels: { off: null, high: 'high', max: 'max' }, label: '应用到全部：Off / High / Max（官方 DeepSeek 风格）' },
      { key: 'generic', levels: { off: null, low: 'low', medium: 'medium', high: 'high' }, label: '应用到全部：Off / Low / Medium / High（通用）' },
    ];
    const NS = 'llm-pi-ai';
    const DEFAULT_LEVELS = { off: null, high: 'high', max: 'max' };

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

    function validateLevels(levels) {
      let hasThinking = false;
      for (const [level, wire] of Object.entries(levels)) {
        if (level === 'off') continue;
        hasThinking = true;
        if (typeof wire !== 'string' || wire.length === 0) return '档位 ' + level + ' 需要填写线上值';
      }
      if (!hasThinking) return '至少需要一个思考档位';
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
              index: -1, inOverrides: true,
            });
          }
        }
      }
      return out;
    }

    /** 单个模型的档位写入 path op。 */
    function setOp(item, levels) {
      const path = item.inOverrides
        ? ['providers', item.route, 'modelOverrides', item.model, 'reasoningEfforts']
        : ['providers', item.route, 'models', String(item.index), 'reasoningEfforts'];
      return { op: 'set', path, value: levels };
    }

    function SectionEditor(props) {
      const connection = props.__connection;
      const [state, setState] = React.useState({
        loading: true, inventory: [], revision: 0, expanded: {}, drafts: {},
        busy: false, error: null, query: '', nsFound: true,
      });

      const load = () => {
        setState(s => ({ ...s, loading: true, error: null }));
        connection.api.settings.describe({}).then((response) => {
          if (!response.result.ok) {
            setState(s => ({ ...s, loading: false, busy: false, error: response.result.error.message }));
            return;
          }
          const namespaces = response.result.value.namespaces || [];
          const ns = namespaces.find(n => n.ns === NS);
          if (!ns) {
            setState(s => ({ ...s, loading: false, busy: false, nsFound: false, inventory: [] }));
            return;
          }
          setState(s => ({
            ...s, loading: false, busy: false, nsFound: true,
            inventory: inventoryFrom(ns), revision: typeof ns.revision === 'number' ? ns.revision : 0,
          }));
        }).catch(() => {
          setState(s => ({ ...s, loading: false, busy: false, error: '无法读取设置，请重试' }));
        });
      };

      React.useEffect(() => { load(); }, []);

      const runOps = (ops) => {
        setState(s => ({ ...s, busy: true, error: null }));
        connection.api.settings.mutate({ ns: NS, ops, expectedRevision: state.revision }).then((response) => {
          if (!response.result.ok) {
            setState(s => ({ ...s, busy: false, error: response.result.error.message }));
            return;
          }
          load();
        }).catch(() => {
          setState(s => ({ ...s, busy: false, error: '写入失败，请重试' }));
        });
      };

      const applyModel = (item) => {
        const key = item.route + '/' + item.model;
        const levels = buildLevels(state.drafts[key] || {});
        const err = validateLevels(levels);
        if (err) { setState(s => ({ ...s, error: err })); return; }
        runOps([setOp(item, levels)]);
      };

      const restoreDefault = (item) => { runOps([setOp(item, DEFAULT_LEVELS)]); };
      const applyPreset = (levels) => {
        const ops = state.inventory.map(item => setOp(item, levels));
        runOps(ops);
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

      const summary = (item) => {
        const parts = [];
        if (item.levels) {
          for (const [level, wire] of Object.entries(item.levels)) {
            parts.push(wire === null ? level : level + '→' + wire);
          }
        }
        return parts.length ? parts.join('  ') : '未声明';
      };

      return React.createElement('div', { style: { padding: '8px 12px' } },
        React.createElement('h3', { style: { fontSize: '15px', fontWeight: 600, margin: '0 0 4px' } }, '第三方模型思考强度档位'),
        React.createElement('p', { style: { fontSize: '12px', opacity: 0.75, margin: '0 0 10px' } },
          '勾选档位后，右侧输入框可自由定义“发送给网关的线上值”——例如给 high 填 ultra，composer 选中 High 时网关就收到 ultra。未设置档位的模型自动采用默认档位（Off / High / Max）。'),
        state.error ? React.createElement('p', { style: { fontSize: '12px', color: '#d92d20', margin: '0 0 8px' } }, state.error) : null,
        state.nsFound === false
          ? React.createElement('p', { style: { fontSize: '12px', opacity: 0.75 } }, '未找到 llm-pi-ai 设置命名空间（无第三方模型配置）。')
          : React.createElement('div', null,
            React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' } },
              PRESETS.map(p => btn(p.label, () => applyPreset(p.levels), state.busy)),
            ),
            React.createElement('input', {
              type: 'text',
              value: state.query,
              placeholder: '搜索模型（名称或 ID）…',
              style: { boxSizing: 'border-box', width: '100%', height: '30px', padding: '0 10px', marginBottom: '10px', border: '1px solid rgba(128,128,128,0.35)', borderRadius: '8px', fontSize: '13px', background: 'transparent', color: 'inherit' },
              onChange: (e) => setState(s => ({ ...s, query: e.target.value })),
            }),
            state.loading
              ? React.createElement('div', { style: { fontSize: '12px', opacity: 0.7 } }, '加载中…')
              : visible.length === 0
                ? React.createElement('div', { style: { fontSize: '12px', opacity: 0.7 } }, inventory.length === 0 ? '没有手工声明的 pi-ai 模型' : '没有匹配的模型')
                : routes.map(route => React.createElement('div', { key: route, style: { marginBottom: '12px' } },
                    React.createElement('div', { style: { fontSize: '13px', fontWeight: 600, marginBottom: '6px' } }, '路由：' + route),
                    visible.filter(i => i.route === route).map(item => {
                      const key = keyOf(item);
                      const open = state.expanded[key] === true;
                      const draft = state.drafts[key];
                      return React.createElement('div', { key: key, style: { border: open ? '2px solid #4f8cff' : '1px solid rgba(128,128,128,0.25)', borderRadius: '8px', padding: '8px', marginBottom: '6px', background: open ? 'rgba(128,128,128,0.1)' : 'transparent' } },
                        React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
                          React.createElement('span', { style: { fontSize: '13px' } }, item.model),
                          React.createElement('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
                            React.createElement('span', { style: { fontSize: '12px', opacity: 0.7 } }, summary(item)),
                            btn(open ? '收起 ▲' : '自定义档位 ▼', () => toggleExpand(item), false),
                          ),
                        ),
                        open && draft
                          ? React.createElement('div', { style: { marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed rgba(128,128,128,0.3)' } },
                            React.createElement('div', { style: { fontSize: '12px', fontWeight: 600, marginBottom: '6px' } }, '编辑档位（勾选后填写线上值，点“应用此档位”保存）'),
                            ALL_LEVELS.map(level => {
                              const cell = draft[level];
                              return React.createElement('label', { key: level, style: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '12px' } },
                                React.createElement('input', {
                                  type: 'checkbox',
                                  checked: cell.on,
                                  disabled: state.busy,
                                  onChange: (e) => patchDraft(item, level, { on: e.target.checked }),
                                }),
                                React.createElement('span', { style: { width: '64px' } }, level),
                                cell.on
                                  ? React.createElement('input', {
                                    type: 'text',
                                    value: cell.wire,
                                    disabled: state.busy,
                                    placeholder: level === 'off' ? '留空 = 不发送' : '自定义线上值，如 ultra',
                                    style: { flex: 1, minWidth: '120px', height: '24px', padding: '0 6px', border: '1px solid rgba(128,128,128,0.35)', borderRadius: '6px', fontSize: '12px', background: 'transparent', color: 'inherit' },
                                    onChange: (e) => patchDraft(item, level, { wire: e.target.value }),
                                  })
                                  : null,
                              );
                            }),
                            React.createElement('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
                              btn('应用此档位', () => applyModel(item), state.busy),
                              btn('恢复默认档位', () => restoreDefault(item), state.busy),
                            ),
                          )
                          : null,
                      );
                    }),
                  )),
            expandedCount > 0
              ? React.createElement('div', { style: { fontSize: '12px', opacity: 0.7, marginTop: '4px' } }, '已展开 ' + expandedCount + ' 个模型，可编辑档位')
              : null,
          ),
      );
    }

    module.exports = {
      name: 'dsh-pi-effort-client',
      inject: ['slots', 'connection'],
      apply(ctx) {
        const slots = ctx.get('slots');
        if (slots === undefined) return;
        const connection = ctx.get('connection');
        if (connection === undefined) return;
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'thinking-effort', order: 12, label: () => '思考强度档位' },
          (props) => React.createElement(SectionEditor, Object.assign({}, props, { __connection: connection })),
        ));
      },
    };

    return module.exports;
  },
});
