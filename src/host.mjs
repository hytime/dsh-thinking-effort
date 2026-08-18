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

export const name = '@hytime/dsh-thinking-effort'
export const inject = ['settings', 'timer']

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
  const log = (...args) => console.log('[@hytime/dsh-thinking-effort]', ...args)

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

  // 设置变更时，新增模型自动补齐，并同步子 agent 档位缓存。
  ctx.on('settings/updated', (ns) => {
    if (ns !== NS) return
    readSubagentEffort()
    void fillDefaults().catch((error) => {
      log('watch fill error:', error && error.message ? error.message : String(error))
    })
  })

  // ── 子 agent 思考强度 ─────────────────────────────────────────────
  // 存储：llm-pi-ai 用户层顶层键 `subagentEffort`（该命名空间已对配置客户端
  // 暴露；键不在 pi-ai schema 中，schema 解析会忽略它但原样持久化，因此
  // 从 describe 的 user 层读取）。自注册命名空间不可行——api-proxy 的
  // exposedNamespaces() 门控只有模型提供方与白名单，插件无法开放新命名空间。
  let subagentEffort = undefined
  const readSubagentEffort = () => {
    try {
      const desc = ctx.settings.describe().find(d => d.ns === NS)
      const raw = desc && desc.user && typeof desc.user === 'object' ? desc.user : {}
      subagentEffort = typeof raw.subagentEffort === 'string' && raw.subagentEffort.length > 0
        ? raw.subagentEffort
        : undefined
    } catch (error) {
      log('read subagent effort error:', error && error.message ? error.message : String(error))
      subagentEffort = undefined
    }
  }
  readSubagentEffort()

  /** 将子 agent 配置中的线上值还原为 DSH 标准档位 ID。 */
  const resolveSubagentEffort = (config) => {
    if (typeof subagentEffort !== 'string' || subagentEffort.length === 0) return undefined
    const standard = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']
    if (standard.includes(subagentEffort)) return subagentEffort
    const section = readSection()
    const profile = section && section.providers && config && section.providers[config.provider]
    if (!profile || typeof profile !== 'object') return undefined
    let model
    if (Array.isArray(profile.models)) model = profile.models.find(entry => entry && entry.id === config.model)
    if (!model && profile.modelOverrides && typeof profile.modelOverrides === 'object') {
      model = profile.modelOverrides[config.model]
    }
    const efforts = model && model.reasoningEfforts
    if (!efforts || typeof efforts !== 'object' || Array.isArray(efforts)) return undefined
    for (const [level, wire] of Object.entries(efforts)) {
      if (typeof wire === 'string' && wire === subagentEffort) return level
    }
    log('subagent custom effort is not mapped for', config.provider + '/' + config.model)
    return undefined
  }

  // agent/request waterfall：子 agent 的模型调用若未显式指定思考档位，
  // 则填入配置的 subagentEffort（调用 next() 后改写，遵守 waterfall 纪律）。
  ctx.on('agent/request', async (payload, next) => {
    const config = await next()
    try {
      const agent = payload && payload.agent
      const header = agent && agent.session && agent.session.header
      if (!header || header.origin !== 'subagent') return config
      if (config.reasoningEffort !== undefined) return config
      const effort = resolveSubagentEffort(config)
      return effort === undefined ? config : { ...config, reasoningEffort: effort }
    } catch (error) {
      log('agent/request override error:', error && error.message ? error.message : String(error))
      return config
    }
  })
}
