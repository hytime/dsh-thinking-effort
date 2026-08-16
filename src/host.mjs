/**
 * dsh-thinking-effort — 宿主半区：第三方模型思考强度默认档位自动补齐。
 *
 * 扫描 llm-pi-ai 设置中手工声明的模型，给缺少 reasoningEfforts 的模型自动
 * 补上默认档位（Off / High / Max，官方 DeepSeek 风格），使 composer 选择该
 * 模型时出现“推理等级”。用户自定义的档位不会被覆盖。挂载时执行一次，
 * 之后监听设置变更，新增模型自动补齐。
 *
 * 只依赖 ctx 注入的服务（settings / timer）与 node:fs（写加载标记）。
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'

export const name = 'dsh-thinking-effort'
export const inject = ['settings', 'timer']

/** 本插件自己的设置命名空间：子 agent 默认思考强度。 */
const EFFORT_NS = settingsNamespace('dsh-thinking-effort')
const EFFORT_SCHEMA = z.object({ subagentEffort: z.string() })

const MARKER = join(process.env.DSH_HOME || process.cwd(), 'thinking-effort-loaded.json')

/** 写加载/运行标记，便于确认插件是否被组合加载。 */
function mark(event) {
  try {
    writeFileSync(MARKER, JSON.stringify({
      event,
      at: new Date().toISOString(),
      pid: process.pid,
    }, null, 2))
  } catch {
    /* 标记文件写入失败不影响功能 */
  }
}

export function apply(ctx) {
  const NS = 'llm-pi-ai'
  const DEFAULT_LEVELS = { off: null, high: 'high', max: 'max' }
  const log = (...args) => console.log('[dsh-thinking-effort]', ...args)

  mark('apply')

  const readSection = () => {
    let section
    try { section = ctx.settings.get(NS) } catch { section = undefined }
    return section
  }

  /** 给所有缺档位的显式模型补默认档位；幂等。返回补了多少模型。 */
  const fillDefaults = async () => {
    const settings = ctx.settings
    if (settings === undefined || settings.writable !== true) return 0
    const section = readSection()
    if (typeof section !== 'object' || section === null) return 0
    const providers = section.providers
    if (typeof providers !== 'object' || providers === null) return 0
    const next = {}
    let filled = 0
    for (const [route, profile] of Object.entries(providers)) {
      if (typeof profile !== 'object' || profile === null) {
        next[route] = profile
        continue
      }
      const nextProfile = { ...profile }
      let dirty = false
      if (Array.isArray(profile.models)) {
        nextProfile.models = profile.models.map((entry) => {
          if (typeof entry !== 'object' || entry === null || entry.reasoningEfforts !== undefined) return entry
          dirty = true
          filled += 1
          return { ...entry, reasoningEfforts: DEFAULT_LEVELS }
        })
      }
      if (typeof profile.modelOverrides === 'object' && profile.modelOverrides !== null) {
        const overrides = {}
        for (const [id, entry] of Object.entries(profile.modelOverrides)) {
          if (typeof entry === 'object' && entry !== null && entry.reasoningEfforts !== undefined) {
            overrides[id] = entry
            continue
          }
          if (typeof entry !== 'object' || entry === null) {
            overrides[id] = entry
            continue
          }
          dirty = true
          filled += 1
          overrides[id] = { ...entry, reasoningEfforts: DEFAULT_LEVELS }
        }
        nextProfile.modelOverrides = overrides
      }
      next[route] = dirty ? nextProfile : profile
    }
    if (filled === 0) return 0
    await settings.update(NS, { providers: next })
    mark('filled-' + filled)
    log('filled default thinking levels for', filled, 'model(s)')
    return filled
  }

  // 挂载时补齐（带重试：llm-pi-ai 命名空间可能稍晚注册）。
  let attempts = 0
  const tryOnce = async () => {
    try {
      if ((await fillDefaults()) > 0) return
    } catch (error) {
      log('fill error:', error && error.message ? error.message : String(error))
    }
    attempts += 1
    if (attempts < 6) ctx.timeout(() => { void tryOnce() }, 2000)
  }
  ctx.timeout(() => { void tryOnce() }, 500)

  // 设置变更时，新增模型自动补齐。
  ctx.on('settings/updated', (ns) => {
    if (ns !== NS) return
    void fillDefaults().catch((error) => {
      log('watch fill error:', error && error.message ? error.message : String(error))
    })
  })

  // ── 子 agent 思考强度 ─────────────────────────────────────────────
  // 1) 注册自己的设置命名空间 dsh-thinking-effort（subagentEffort）。
  let effortSource = () => ({})
  installSettingsSection(ctx, EFFORT_NS, EFFORT_SCHEMA, {}, {
    setSource: (current) => { effortSource = current },
    onChange: () => {},
  })

  // 2) agent/request waterfall：子 agent 的模型调用若未显式指定思考档位，
  //    则填入配置的 subagentEffort（调用 next() 后改写，遵守 waterfall 纪律）。
  ctx.on('agent/request', async (payload, next) => {
    const config = await next()
    try {
      const effort = effortSource().subagentEffort
      if (typeof effort !== 'string' || effort.length === 0) return config
      const agent = payload && payload.agent
      const header = agent && agent.session && agent.session.header
      if (!header || header.origin !== 'subagent') return config
      if (config.reasoningEffort !== undefined) return config
      return { ...config, reasoningEffort: effort }
    } catch (error) {
      log('agent/request override error:', error && error.message ? error.message : String(error))
      return config
    }
  })
}
