import z from '@deepseek-ai/schemastery'
import type { OpenCodeSessionSettings } from './compat/opencode-session.js'
import type { LegacyMigrationState } from './compat/legacy-migration.js'
import { SNAPSHOT_KIND } from './shared/constants.js'
import { DEFAULT_RETAIN_RATIO, DEFAULT_THRESHOLD_RATIO } from './shared/compaction.js'
import type { CompactionPolicySettings } from './shared/compaction.js'

/**
 * One stored configuration snapshot. Fields carry defaults so a section
 * hand-written without them still resolves; `createdAt` is the sentinel for
 * "never written", because the defaults materialize this object either way.
 */
const configSnapshot = z.object({
  kind: z.string().default(SNAPSHOT_KIND),
  version: z.number().default(1),
  createdAt: z.string().default(''),
  pluginVersion: z.string().default(''),
  sourceProfile: z.string().default('unknown'),
  sections: z.dict(z.any()).default({}),
})

const openCodeSessionModels = z.dict(z.boolean()).default({})
const openCodeSessionProvider = z.object({
  models: openCodeSessionModels,
}).default({ models: {} })
const openCodeSessionProviders = z.dict(openCodeSessionProvider).default({})
/**
 * Defaults shared by the `format` section schema and the stored namespace
 * shape, so the three literal copies stay in sync by construction.
 */
const OPENCODE_SESSION_FORMAT_DEFAULTS = {
  mode: 'ses-derive',
  time: 'firstUse',
  template: '',
  expression: '',
  script: '',
  validate: '',
  onInvalid: 'warn',
}

const openCodeSessionFormat = z.object({
  mode: z.string().default('ses-derive'),
  time: z.string().default('firstUse'),
  template: z.string().default(''),
  expression: z.string().default(''),
  script: z.string().default(''),
  validate: z.string().default(''),
  onInvalid: z.string().default('warn'),
}).default({ ...OPENCODE_SESSION_FORMAT_DEFAULTS })

/**
 * Defaults shared by the `userAgent` section schema and the stored namespace
 * shape (mirrors the `format` section above).
 */
const OPENCODE_SESSION_USER_AGENT_DEFAULTS = { value: '', providers: {} }

const openCodeSessionUserAgent = z.object({
  value: z.string().default(''),
  providers: z.dict(z.object({
    enabled: z.boolean().default(false),
    value: z.string().default(''),
    models: openCodeSessionModels,
  }).default({ enabled: false, value: '', models: {} })).default({}),
}).default({ ...OPENCODE_SESSION_USER_AGENT_DEFAULTS })

/**
 * The resolved `opencodeSession` section, described once for both the section
 * default and the namespace default below.
 */
const OPENCODE_SESSION_DEFAULTS = {
  providers: {},
  format: { ...OPENCODE_SESSION_FORMAT_DEFAULTS },
  userAgent: { ...OPENCODE_SESSION_USER_AGENT_DEFAULTS },
}

/** The `opencodeSession` section, shared by both schema roots. */
const openCodeSession = z.object({
  providers: openCodeSessionProviders,
  format: openCodeSessionFormat,
  userAgent: openCodeSessionUserAgent,
}).default({ ...OPENCODE_SESSION_DEFAULTS })

/**
 * One per-model compaction override. Both fields are optional and default to
 * absent so a row can carry only the ratio the user actually edited — a written
 * default would pin the global value into the override and make a later global
 * change invisible to that model.
 */
const compactionModelPolicy = z.object({
  thresholdRatio: z.number(),
  retainRatio: z.number(),
})

/**
 * The plugin's own compaction policy section.
 *
 * `models` is a two-level dict rather than an array of `{ provider, model }`
 * records because the panel already addresses a model by that exact pair (the
 * same shape `modelOverrides` uses), and a dict cannot express a duplicate
 * target — the official backend rejects duplicates at load, so the storage
 * shape removes the failure instead of validating it.
 */
const compactionPolicy = z.object({
  thresholdRatio: z.number().default(DEFAULT_THRESHOLD_RATIO),
  retainRatio: z.number().default(DEFAULT_RETAIN_RATIO),
  models: z.dict(z.dict(compactionModelPolicy)).default({}),
}).default({
  thresholdRatio: DEFAULT_THRESHOLD_RATIO,
  retainRatio: DEFAULT_RETAIN_RATIO,
  models: {},
})

/**
 * The subagent default route.
 *
 * Empty strings mean "unset", which is what keeps the current inheritance
 * behavior: a child that inherits its parent's route is the shipped default, and
 * the plugin must not pin a route the user never chose. The two fields are
 * written together — a provider without a model names no route — so the panel
 * clears both in one op batch.
 */
const subagentModel = z.object({
  provider: z.string().default(''),
  model: z.string().default(''),
}).default({ provider: '', model: '' })

/**
 * One legacy leaf offered for migration. Declared here because the entry-config
 * model derives the plugin's settings form from this schema, and a field the
 * schema does not declare is neither publishable nor writable — the host would
 * refuse a write to it for the whole batch.
 */
const legacyCandidate = z.object({
  path: z.array(z.string()).default([]),
  // Leaf scalars only: `legacy-shape.ts` never emits a subtree, and schemastery
  // has no `z.null()`, so the union does not need one.
  value: z.union([z.string(), z.boolean(), z.number()]).default(''),
  source: z.string().default(''),
})

/**
 * The migration control object. The Host owns every field; the Client writes
 * only `decision`.
 */
const legacyMigration = z.object({
  pending: z.boolean().default(false),
  candidates: z.array(legacyCandidate).default([]),
  signature: z.string().default(''),
  dismissedSignature: z.string().default(''),
  /** `''` | `'migrate'` | `'dismiss'` | `'scan'`. */
  decision: z.string().default(''),
  /** `''` | `'applied'` | `'dismissed'` | `'failed:<reason>'`. */
  lastResult: z.string().default(''),
  scannedAt: z.string().default(''),
  decidedAt: z.string().default(''),
}).default({
  pending: false,
  candidates: [],
  signature: '',
  dismissedSignature: '',
  decision: '',
  lastResult: '',
  scannedAt: '',
  decidedAt: '',
})

/**
 * One stored configuration snapshot, as it appears in the settings document.
 * Every field is optional because a hand-written section may omit any of them
 * and the schema supplies the defaults on resolution.
 */
export interface PluginStoredSnapshot {
  readonly kind?: string
  readonly version?: number
  readonly createdAt?: string
  readonly pluginVersion?: string
  readonly sourceProfile?: string
  readonly sections?: Readonly<Record<string, unknown>>
}

/** The namespace's resolved shape: an OpenCode session section plus the snapshot fields. */
export interface PluginSettings extends OpenCodeSessionSettings {
  /**
   * The subagent thinking effort the plugin applies to subagent requests,
   * overriding the effort a child inherits from its parent session. Empty means
   * "unset", which leaves the request untouched so inheritance keeps deciding,
   * so the default is an empty string rather than a level: the stored
   * value is a wire spelling, not necessarily a level key.
   */
  readonly subagentEffort?: string
  /** Whether the host automatically supplies missing model reasoning efforts. */
  readonly autoFillDefaults?: boolean
  /**
   * The subagent default provider/model pair. Both empty means "inherit the
   * parent route", which is the shipped behavior; a provider without a model
   * names no route and is treated as unset.
   */
  readonly subagentModel?: { readonly provider?: string; readonly model?: string }
  /** The plugin's own context-compaction policy. */
  readonly compaction?: CompactionPolicySettings
  /** The host-managed legacy-data migration control object. */
  readonly legacyMigration?: LegacyMigrationState
  /**
   * A counter the Host bumps whenever the Loader's component rows change.
   *
   * The plugin's client surfaces render from the switches the Host reports, and
   * a row toggled in the plugin page emits no forwardable event of its own —
   * `plugin-manager/changed` covers installs and removals only. This field is
   * the plugin's own announcement: the Host writes it on a Loader update, which
   * raises `settings/document-updated`, and the client re-reads the inventory
   * when that lands.
   *
   * A counter rather than a timestamp because two toggles inside one clock tick
   * are common and would otherwise be indistinguishable.
   */
  readonly switchesStamp?: number
  readonly profiles?: Readonly<Record<string, PluginStoredSnapshot>>
  readonly autoBackup?: PluginStoredSnapshot
}

/**
 * The fields both schema roots expose: the namespace the older releases
 * register, and the Loader entry schema `Config` below. They are declared once
 * so a field can never reach one root without the other.
 *
 * `subagentEffort` belongs here rather than in a section of its own because
 * the 0.1.7 entry-config model derives one form per Loader entry, so the
 * plugin owns exactly one section and every plugin setting lives in it.
 */
const PLUGIN_SETTINGS_FIELDS = {
  opencodeSession: openCodeSession,
  subagentEffort: z.string().default(''),
  autoFillDefaults: z.boolean().default(true),
  /**
   * The subagent default provider/model pair the plugin selects before a child's
   * first step. Empty means inherit the parent route, which is the shipped
   * behavior and the reason both fields default to an empty string rather than
   * being required.
   */
  subagentModel,
  /**
   * The plugin's own context-compaction policy. It is deliberately NOT a
   * `compaction-basic` config write: that backend is a Loader row inside each
   * preset's isolate realm, so the plugin owns its own percentages here and
   * applies them through the official `compactRegion()` seam.
   */
  compaction: compactionPolicy,
  legacyMigration,
  switchesStamp: z.number().default(0),
  profiles: z.dict(configSnapshot).default({}),
  autoBackup: configSnapshot,
}

/**
 * The value an absent namespace resolves to. Both roots share it because
 * schemastery deep-clones a fallback before normalizing it, so a resolution
 * through one root is invisible to the other.
 *
 * It only supplies an empty `autoBackup`; a section that was written but never
 * had a backup taken still resolves one from `configSnapshot`'s own defaults.
 */
const PLUGIN_SETTINGS_DEFAULTS = {
  opencodeSession: { ...OPENCODE_SESSION_DEFAULTS },
  subagentEffort: '',
  autoFillDefaults: true,
  subagentModel: { provider: '', model: '' },
  compaction: {
    thresholdRatio: DEFAULT_THRESHOLD_RATIO,
    retainRatio: DEFAULT_RETAIN_RATIO,
    models: {},
  },
  legacyMigration: {
    pending: false,
    candidates: [],
    signature: '',
    dismissedSignature: '',
    decision: '',
    lastResult: '',
    scannedAt: '',
    decidedAt: '',
  },
  switchesStamp: 0,
  profiles: {},
  autoBackup: {
    kind: SNAPSHOT_KIND,
    version: 1,
    createdAt: '',
    pluginVersion: '',
    sourceProfile: 'unknown',
    sections: {},
  },
}

/**
 * The `dsh-thinking-effort` namespace schema. Keeping it in one module makes
 * the stored shape knowable without reading the settings UI.
 *
 * The explicit `z<PluginSettings>` annotation is load-bearing, not decoration:
 * without it the inferred type names a transitive dependency by its installed
 * path, so `tsc` refuses to emit a portable declaration (`TS2742`) under a
 * pnpm-style layout.
 */
export const PLUGIN_SETTINGS_SCHEMA: z<PluginSettings> = z.object(PLUGIN_SETTINGS_FIELDS)
  .default({ ...PLUGIN_SETTINGS_DEFAULTS })

/**
 * The Loader entry's own config schema, from which DSH 0.1.7 derives this
 * plugin's settings form; a plugin that exports no `Config` gets no form at
 * all. It sits beside the namespace schema rather than replacing it, because
 * `register`/`installSection` still serve the releases that predate entry
 * configs.
 *
 * The root is volatile because the configuration snapshot writes `profiles`
 * and `autoBackup` as whole sections, and entry-config rejects a write to a
 * path that is not volatile.
 */
export const Config: z<PluginSettings, PluginSettings, 'volatile-defined'> = z.object(PLUGIN_SETTINGS_FIELDS)
  .default({ ...PLUGIN_SETTINGS_DEFAULTS })
  .volatile()
