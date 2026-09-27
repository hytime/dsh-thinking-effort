/**
 * Contract tests for the pull-request policy engine.
 *
 * The changelog-placement case is the regression this engine exists for: a
 * pull request based on a stale base merged without conflict and filed its
 * entry under an already published version's section.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  evaluatePolicy,
  extractSection,
  parseUnifiedDiff,
  sectionFor,
  sectionRanges,
  stripComments,
} from './pr-policy.mjs'

/** Build a changelog whose `[Unreleased]` and `[0.3.4]` sections are known. */
const changelog = [
  '# 更新日志',
  '',
  '## [Unreleased]',
  '',
  '## [0.3.4] - 2026-09-26',
  '',
  '- 已发布条目',
  '',
  '## [0.3.3] - 2026-09-23',
  '',
].join('\n')

/** Wrap one added line as a single-hunk diff for `docs/CHANGELOG.md`. */
function changelogDiff(addedLine, newStart) {
  return [
    'diff --git a/docs/CHANGELOG.md b/docs/CHANGELOG.md',
    '--- a/docs/CHANGELOG.md',
    '+++ b/docs/CHANGELOG.md',
    `@@ -4,3 +${newStart},4 @@`,
    ' ',
    `+${addedLine}`,
    ' ',
    ' ## [0.3.3] - 2026-09-23',
  ].join('\n')
}

/** A pull-request body that satisfies the summary and verification checks. */
const completeBody = [
  '## Summary',
  '',
  '修复推理等级滑块。',
  '',
  '## Verification',
  '',
  '- [x] `npm test`',
  '',
  '```text',
  '743 passed',
  '```',
].join('\n')

test('parseUnifiedDiff records added line numbers per file', () => {
  const files = parseUnifiedDiff(
    [
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,2 +1,3 @@',
      ' keep',
      '+added one',
      '+added two',
      ' keep',
    ].join('\n'),
  )

  assert.deepEqual(files.get('a.txt').added, [2, 3])
})

test('parseUnifiedDiff ignores deleted files and removals', () => {
  const files = parseUnifiedDiff(
    [
      'diff --git a/gone.txt b/gone.txt',
      '--- a/gone.txt',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-removed',
    ].join('\n'),
  )

  assert.equal(files.size, 0)
})

test('sectionRanges attributes each line to its version heading', () => {
  const ranges = sectionRanges(changelog)

  assert.deepEqual(
    ranges.map(({ heading }) => heading),
    ['Unreleased', '0.3.4', '0.3.3'],
  )
  assert.equal(sectionFor(ranges, 3).heading, 'Unreleased')
  assert.equal(sectionFor(ranges, 5).heading, '0.3.4')
  assert.equal(sectionFor(ranges, 7).heading, '0.3.4')
  assert.equal(sectionFor(ranges, 9).heading, '0.3.3')
})

test('sectionFor returns null above the first heading', () => {
  assert.equal(sectionFor(sectionRanges(changelog), 1), null)
})

test('stripComments removes template placeholders', () => {
  assert.equal(stripComments('<!-- 说明 -->\n正文').trim(), '正文')
})

test('extractSection reads one heading without bleeding into the next', () => {
  assert.equal(extractSection(completeBody, 'Summary').trim(), '修复推理等级滑块。')
  assert.match(extractSection(completeBody, 'Verification'), /743 passed/)
})

test('a changelog entry under Unreleased is accepted', () => {
  const findings = evaluatePolicy({
    base: 'dev',
    diff: changelogDiff('- 新条目', 3),
    contents: { 'docs/CHANGELOG.md': changelog },
    body: completeBody,
  })

  assert.deepEqual(findings, [])
})

test('a changelog entry inside a published section is reported', () => {
  // The regression: the entry lands at line 6, inside [0.3.4].
  const findings = evaluatePolicy({
    base: 'dev',
    diff: changelogDiff('- 新条目', 6),
    contents: { 'docs/CHANGELOG.md': changelog },
    body: completeBody,
  })

  assert.equal(findings.length, 1)
  assert.equal(findings[0].code, 'changelog-placement')
  assert.match(findings[0].message, /0\.3\.4/)
})

test('a non-dev base is reported', () => {
  const findings = evaluatePolicy({ base: 'main', body: completeBody })

  assert.deepEqual(
    findings.map(({ code }) => code),
    ['base'],
  )
})

test('a package.json version bump is reported', () => {
  const diff = [
    'diff --git a/package.json b/package.json',
    '--- a/package.json',
    '+++ b/package.json',
    '@@ -1,3 +1,3 @@',
    ' {',
    '-  "version": "0.3.4",',
    '+  "version": "0.3.5",',
    ' }',
  ].join('\n')
  const findings = evaluatePolicy({ base: 'dev', diff, body: completeBody })

  assert.deepEqual(
    findings.map(({ code }) => code),
    ['version-bump'],
  )
})

test('a committed lib/ artifact is reported', () => {
  const diff = [
    'diff --git a/lib/index.js b/lib/index.js',
    '--- a/lib/index.js',
    '+++ b/lib/index.js',
    '@@ -1 +1,2 @@',
    ' existing',
    '+rebuilt',
  ].join('\n')
  const findings = evaluatePolicy({ base: 'dev', diff, body: completeBody })

  assert.deepEqual(
    findings.map(({ code }) => code),
    ['generated-artifact'],
  )
})

test('an empty template body reports both description gaps', () => {
  const findings = evaluatePolicy({ base: 'dev', body: '## Summary\n\n<!-- 说明 -->\n' })

  assert.deepEqual(
    findings.map(({ code }) => code),
    ['summary', 'verification'],
  )
})

test('a ticked box alone counts as verification evidence', () => {
  const findings = evaluatePolicy({
    base: 'dev',
    body: '## Summary\n\n改了行为。\n\n## Verification\n\n- [x] `npm test`\n',
  })

  assert.deepEqual(findings, [])
})

test('every finding carries a non-empty code and message', () => {
  const findings = evaluatePolicy({ base: 'main', body: '' })

  assert.ok(findings.length > 0)
  for (const finding of findings) {
    assert.equal(typeof finding.code, 'string')
    assert.ok(finding.code.length > 0)
    assert.ok(finding.message.length > 0)
  }
})
