#!/usr/bin/env node
/**
 * PR policy for this repository: reports the contribution rules that are easy
 * to break without a merge conflict, so they surface on the pull request
 * instead of being discovered later.
 *
 * The repository rule these checks came from: a pull request based on a stale
 * base can merge cleanly while already being semantically wrong. A changelog
 * entry appended to a published version's section merges without conflict and
 * then claims that published release carries a fix it never shipped.
 *
 * The job warns without blocking: findings are printed as workflow annotations
 * and to the step summary, and the process exits 0. `--strict` exits 1 instead,
 * so the same engine can block once branch protection is in place.
 *
 * @module scripts/pr-policy
 */
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** Changelog files whose entries must stay under `[Unreleased]`. */
const CHANGELOG_PATTERN = /^docs\/CHANGELOG(\.[a-z]{2})?\.md$/
/** Build output that `pnpm run build` regenerates and `.gitignore` excludes. */
const GENERATED_PATTERN = /^lib\//
/** The integration branch external pull requests must target. */
const DEFAULT_EXPECTED_BASE = 'dev'

/**
 * Parse a unified diff into the files it touches and the new-file line numbers
 * each hunk adds. Only additions matter here: every check asks where new
 * content landed, not what it replaced.
 * @param {string} diff Unified diff text.
 * @returns {Map<string, { added: number[], isNew: boolean, isDeleted: boolean }>}
 */
export function parseUnifiedDiff(diff) {
  const files = new Map()
  let current = null
  let newLine = 0

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = null
      continue
    }
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim()
      if (path === '/dev/null') {
        // A deleted file carries no additions to police.
        current = null
        continue
      }
      current = path.replace(/^b\//, '')
      if (!files.has(current)) files.set(current, { added: [], isNew: false, isDeleted: false })
      continue
    }
    if (line.startsWith('--- ')) {
      if (current !== null && line.slice(4).trim() === '/dev/null') {
        files.get(current).isNew = true
      }
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk) {
      newLine = Number(hunk[1])
      continue
    }
    if (current === null) continue
    if (line.startsWith('+')) {
      files.get(current).added.push(newLine)
      newLine += 1
      continue
    }
    if (line.startsWith('-')) continue
    if (line.startsWith('\\')) continue
    newLine += 1
  }

  return files
}

/**
 * Locate the `## [version]` sections of a changelog, as 1-based inclusive line
 * ranges, so an added line number can be attributed to a version.
 * @param {string} text Changelog contents.
 * @returns {{ heading: string, start: number, end: number }[]}
 */
export function sectionRanges(text) {
  const lines = text.split('\n')
  const ranges = []
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^## \[(.+?)\]/.exec(lines[index])
    if (match) ranges.push({ heading: match[1], start: index + 1, end: lines.length })
  }
  for (let index = 0; index < ranges.length - 1; index += 1) {
    ranges[index].end = ranges[index + 1].start - 1
  }
  return ranges
}

/**
 * Resolve the section a 1-based line number falls in, or null above the first
 * heading (the file preamble, which carries no release claim).
 * @param {{ heading: string, start: number, end: number }[]} ranges Section ranges.
 * @param {number} line 1-based line number.
 * @returns {{ heading: string, start: number, end: number } | null}
 */
export function sectionFor(ranges, line) {
  let found = null
  for (const range of ranges) {
    if (line >= range.start && line <= range.end) found = range
  }
  return found
}

/**
 * Remove HTML comments so template placeholders do not read as answers.
 * @param {string} text Text that may contain HTML comments.
 * @returns {string}
 */
export function stripComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * Read one `## <heading>` section from a Markdown document.
 * @param {string} text Markdown document.
 * @param {string} heading Heading text without the leading `## `.
 * @returns {string}
 */
export function extractSection(text, heading) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`)
  if (start === -1) return ''
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => /^## /.test(line))
  return (end === -1 ? rest : rest.slice(0, end)).join('\n')
}

/**
 * Evaluate the policy against a pull request's diff, body, and file contents.
 * Every finding is advisory; the caller decides whether to block.
 * @param {object} input Policy inputs.
 * @param {string} input.base The pull request's base branch name.
 * @param {string} [input.expectedBase] The base the repository expects.
 * @param {string} [input.diff] Unified diff of the pull request.
 * @param {Record<string, string>} [input.contents] Paths to post-change file contents.
 * @param {string} [input.body] The pull request description.
 * @returns {{ code: string, message: string }[]}
 */
export function evaluatePolicy({
  base,
  expectedBase = DEFAULT_EXPECTED_BASE,
  diff = '',
  contents = {},
  body = '',
}) {
  const findings = []
  const files = parseUnifiedDiff(diff)

  if (base !== expectedBase) {
    findings.push({
      code: 'base',
      message: `PR base 是 "${base}"，应为 "${expectedBase}"：外部 PR 一律以集成分支为 base，测试通过后由维护者合入 main。`,
    })
  }

  for (const [path, change] of files) {
    if (path === 'package.json') {
      for (const line of addedLinesOf(diff, path)) {
        if (/^\s*"version"\s*:/.test(line)) {
          findings.push({
            code: 'version-bump',
            message: `package.json 的 version 被改动（第 ${line} 行附近）：发版是维护者动作，PR 不应改版本号。`,
          })
          break
        }
      }
    }
    if (GENERATED_PATTERN.test(path)) {
      findings.push({
        code: 'generated-artifact',
        message: `PR 包含构建产物 ${path}：lib/ 由 pnpm run build 生成且被 gitignore，不应提交。`,
      })
    }
    if (CHANGELOG_PATTERN.test(path)) {
      for (const line of change.added) {
        const range = sectionFor(sectionRanges(contents[path] ?? ''), line)
        if (!range) continue
        if (range.heading !== 'Unreleased') {
          findings.push({
            code: 'changelog-placement',
            message: `${path} 第 ${line} 行的新条目落在 [${range.heading}] 段内：新条目只能加在 [Unreleased]，不得改动已发布版本的段落。`,
          })
        }
      }
    }
  }

  if (!stripComments(extractSection(body, 'Summary')).trim()) {
    findings.push({ code: 'summary', message: 'PR 描述的 Summary 段为空：请说明改了什么、为什么。' })
  }

  const verification = stripComments(extractSection(body, 'Verification'))
  const fenced = /```[a-z]*\n([\s\S]*?)```/.exec(verification)
  const hasEvidence = /-\s*\[[xX]\]/.test(verification) || Boolean(fenced?.[1].trim())
  if (!hasEvidence) {
    findings.push({
      code: 'verification',
      message: 'PR 描述没有验证证据：勾选实际跑过的命令，或在代码块里贴出命令与输出。',
    })
  }

  return findings
}

/**
 * Re-read the added lines of one file from the diff, for content-based checks.
 * @param {string} diff Unified diff text.
 * @param {string} path Repository-relative path to select.
 * @returns {string[]} Added lines for that path, without the leading `+`.
 */
function addedLinesOf(diff, path) {
  const lines = []
  let current = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const target = line.slice(4).trim().replace(/^b\//, '')
      current = target === '/dev/null' ? null : target
      continue
    }
    if (line.startsWith('diff --git ') || line.startsWith('--- ')) continue
    if (current === path && line.startsWith('+') && !line.startsWith('+++')) {
      lines.push(line.slice(1))
    }
  }
  return lines
}

/**
 * Render findings for the console and, when requested, as workflow annotations.
 * @param {{ code: string, message: string }[]} findings Policy findings.
 * @param {object} [options] Rendering options.
 * @param {boolean} [options.annotate] Emit `::warning::` workflow commands.
 * @returns {string} Human-readable report.
 */
export function renderFindings(findings, { annotate = false } = {}) {
  if (findings.length === 0) {
    const ok = 'pr-policy: 未发现问题。'
    console.log(ok)
    return ok
  }

  for (const finding of findings) {
    if (annotate) console.log(`::warning title=pr-policy (${finding.code})::${finding.message}`)
  }
  const report = [
    `pr-policy: 发现 ${findings.length} 处提示（不阻止合并）。`,
    ...findings.map((finding) => `- [${finding.code}] ${finding.message}`),
  ].join('\n')
  console.log(report)
  return report
}

/**
 * Command-line entry: read the diff and body, evaluate, report, and exit.
 * @returns {number} Process exit code.
 */
function main() {
  const args = process.argv.slice(2)
  const option = (name, fallback = '') => {
    const index = args.indexOf(name)
    return index === -1 ? fallback : (args[index + 1] ?? fallback)
  }
  const strict = args.includes('--strict')
  const base = option('--base', '')
  const expectedBase = option('--expected-base', DEFAULT_EXPECTED_BASE)
  const diffFile = option('--diff-file', '')
  const bodyFile = option('--body-file', '')
  const root = option('--root', process.cwd())

  const diff = diffFile ? readFileSync(diffFile, 'utf8') : ''
  const body = bodyFile ? readFileSync(bodyFile, 'utf8') : ''
  const contents = {}
  for (const match of diff.matchAll(/^\+\+\+ b\/(.+)$/gm)) {
    const path = match[1].trim()
    if (!CHANGELOG_PATTERN.test(path) || path in contents) continue
    try {
      contents[path] = readFileSync(`${root}/${path}`, 'utf8')
    } catch {
      // A path absent from the checkout cannot be attributed; skip it.
    }
  }

  const findings = evaluatePolicy({ base, expectedBase, diff, contents, body })
  renderFindings(findings, { annotate: true })
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### pr-policy\n\n` +
        (findings.length === 0
          ? '未发现问题。\n'
          : `发现 ${findings.length} 处提示（不阻止合并）：\n\n` +
            findings.map((finding) => `- \`${finding.code}\` — ${finding.message}`).join('\n') +
            '\n'),
    )
  }
  return strict && findings.length > 0 ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main()
}
