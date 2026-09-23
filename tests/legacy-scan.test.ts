import { describe, expect, it } from 'vitest'
import { LEGACY_MIGRATION_SOURCES, scanLegacyData, signatureOf } from '../src/host/legacy-scan.ts'

/** The real `settings.yaml.imported` shapes, reduced to their plugin-owned parts. */
const IMPORTED_DOCUMENT = `
llm-pi-ai:
  providers:
    sub2api:
      apiKeyEnv: SUB2API_API_KEY
  subagentEffort: off
dsh-thinking-effort:
  opencodeSession:
    providers:
      sub2api:
        models:
          deepseek-v4-flash: true
          deepseek-flash: true
      opencode-go:
        models:
          deepseek-v4-pro: true
`

/**
 * Only the files a test asks for exist; everything else answers ENOENT. A path
 * listed in `unreadable` answers EACCES instead — a rejection that is neither
 * "missing" nor "malformed", so the scanner's uniform handling of a rejected
 * read is exercised rather than assumed.
 */
function reader(files: Record<string, string>, unreadable: readonly string[] = []) {
  return {
    read: async (path: string): Promise<string> => {
      if (unreadable.includes(path)) {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
      }
      const content = files[path]
      if (content === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return content
    },
  }
}

const HOME = '/home/u/.dsh'
const IMPORTED = `${HOME}/settings.yaml.imported`
const DOCUMENT = `${HOME}/settings.yaml`

const options = (files: Record<string, string>, extra: Record<string, unknown> = {}) => {
  const filesystem = reader(files)
  return {
    filesystem,
    run: () =>
      scanLegacyData({
        home: HOME,
        read: filesystem.read,
        ownUser: {},
        llmPiAiUser: {},
        ...extra,
      }),
  }
}

describe('scanLegacyData', () => {
  it('reads the imported document the 0.1.7 rename left behind', async () => {
    const { run } = options({ [IMPORTED]: IMPORTED_DOCUMENT })
    const scan = await run()
    // `scanLegacyData` sorts by dotted path, so this expectation is in that
    // order too — the same order `signatureOf` hashes and the prompt renders.
    expect(scan.candidates).toEqual([
      { path: ['opencodeSession', 'providers', 'opencode-go', 'models', 'deepseek-v4-pro'], value: true, source: LEGACY_MIGRATION_SOURCES.imported },
      { path: ['opencodeSession', 'providers', 'sub2api', 'models', 'deepseek-flash'], value: true, source: LEGACY_MIGRATION_SOURCES.imported },
      { path: ['opencodeSession', 'providers', 'sub2api', 'models', 'deepseek-v4-flash'], value: true, source: LEGACY_MIGRATION_SOURCES.imported },
      { path: ['subagentEffort'], value: 'off', source: LEGACY_MIGRATION_SOURCES.imported },
    ])
    expect(scan.signature).toMatch(/^[0-9a-f]{64}$/)
  })

  it('keeps "off" a string rather than a boolean', async () => {
    const { run } = options({ [IMPORTED]: IMPORTED_DOCUMENT })
    const { candidates } = await run()
    expect(candidates.find((c) => c.path.join('.') === 'subagentEffort')?.value).toBe('off')
  })

  it('prefers settings.yaml over settings.yaml.imported for the same path', async () => {
    const current = 'dsh-thinking-effort:\n  subagentEffort: high\n'
    const { run } = options({ [DOCUMENT]: current, [IMPORTED]: IMPORTED_DOCUMENT })
    const { candidates } = await run()
    expect(candidates.find((c) => c.path.join('.') === 'subagentEffort')).toEqual({
      path: ['subagentEffort'], value: 'high', source: LEGACY_MIGRATION_SOURCES.document,
    })
  })

  it('does not overwrite a value the plugin section already declares', async () => {
    const { run } = options(
      { [IMPORTED]: IMPORTED_DOCUMENT },
      { ownUser: { subagentEffort: 'max', opencodeSession: { providers: { sub2api: { models: { 'deepseek-flash': false } } } } } },
    )
    const { candidates } = await run()
    const paths = candidates.map((c) => c.path.join('.'))
    expect(paths).not.toContain('subagentEffort')
    expect(paths).not.toContain('opencodeSession.providers.sub2api.models.deepseek-flash')
    // The sibling the user never touched still migrates.
    expect(paths).toContain('opencodeSession.providers.sub2api.models.deepseek-v4-flash')
  })

  it('takes the live llm-pi-ai layer first', async () => {
    const { run } = options({ [IMPORTED]: IMPORTED_DOCUMENT }, { llmPiAiUser: { subagentEffort: 'low' } })
    const { candidates } = await run()
    expect(candidates.find((c) => c.path.join('.') === 'subagentEffort')).toEqual({
      path: ['subagentEffort'], value: 'low', source: LEGACY_MIGRATION_SOURCES.live,
    })
  })

  it('survives a missing file, an unreadable file and malformed YAML', async () => {
    const broken = reader({ [IMPORTED]: 'dsh-thinking-effort: [unclosed' })
    const scan = await scanLegacyData({
      home: HOME, read: broken.read, ownUser: {}, llmPiAiUser: {},
    })
    expect(scan.candidates).toEqual([])
    expect(scan.signature).toMatch(/^[0-9a-f]{64}$/)
  })

  it('ignores a document section that is not an object', async () => {
    const { run } = options({ [IMPORTED]: 'dsh-thinking-effort: just a string\n' })
    expect((await run()).candidates).toEqual([])
  })

  it('is order-independent: the signature covers the same set in any order', async () => {
    const { run } = options({ [IMPORTED]: IMPORTED_DOCUMENT })
    const scan = await run()
    // Reversing the input must not move the signature. Asserting on
    // `scan.candidates` alone would pass whether or not `signatureOf` sorts,
    // because the scanner hands them back already sorted — the property has to
    // be exercised through an order the scanner did not choose.
    expect(signatureOf([...scan.candidates].reverse())).toBe(scan.signature)
    expect(signatureOf(scan.candidates)).toBe(scan.signature)
  })

  it('moves the signature when a state value changes, and not only when the set does', async () => {
    const { run } = options({ [IMPORTED]: IMPORTED_DOCUMENT })
    const scan = await run()
    expect(scan.candidates.length).toBeGreaterThan(0)
    const tampered = scan.candidates.map((candidate, index) => (
      index === 0 ? { ...candidate, value: !candidate.value } : candidate
    ))
    expect(signatureOf(tampered)).not.toBe(scan.signature)
  })

  it('changes the signature when the document states something different', async () => {
    const a = 'dsh-thinking-effort:\n  subagentEffort: high\n'
    const b = 'dsh-thinking-effort:\n  opencodeSession:\n    format:\n      mode: template\n  subagentEffort: high\n'
    const first = await options({ [IMPORTED]: a }).run()
    const second = await options({ [IMPORTED]: b }).run()
    expect(second.signature).not.toBe(first.signature)
    expect(second.candidates.length).toBeGreaterThan(first.candidates.length)
  })

  it('treats an unreadable document as a source that contributes nothing', async () => {
    const filesystem = reader({ [DOCUMENT]: 'dsh-thinking-effort:\n  subagentEffort: high\n' }, [IMPORTED])
    const scan = await scanLegacyData({
      home: HOME, read: filesystem.read, ownUser: {}, llmPiAiUser: {},
    })
    expect(scan.candidates).toEqual([
      { path: ['subagentEffort'], value: 'high', source: LEGACY_MIGRATION_SOURCES.document },
    ])
  })

  it('names the sources it reports as provenance', async () => {
    const { run } = options({ [IMPORTED]: IMPORTED_DOCUMENT })
    const { candidates } = await run()
    expect(new Set(candidates.map((candidate) => candidate.source)))
      .toEqual(new Set([LEGACY_MIGRATION_SOURCES.imported]))
  })
})
