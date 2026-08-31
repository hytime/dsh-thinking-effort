import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'ci.yml');

async function readWorkflow() {
  return readFile(workflowPath, 'utf8');
}

test('CI workflow declares the required triggers and Node matrix', async () => {
  const workflow = await readWorkflow();

  assert.match(workflow, /\bpull_request:\s*$/m);
  assert.match(workflow, /\bpush:\s*\n\s+branches:\s*\[main\]/);
  assert.match(workflow, /\bworkflow_dispatch:\s*$/m);
  assert.match(workflow, /node-version:\s*\[22\.19\.0,\s*24\.x\]/);
});

test('CI workflow runs every required quality command in order', async () => {
  const workflow = await readWorkflow();
  const commands = [
    'npm ci',
    'npm run build',
    'npm run typecheck',
    'npm run typecheck:test',
    'npm test',
    'node --check lib/index.js',
    'node --check lib/client.js',
    'npm pack --dry-run',
    'npm audit --audit-level=high',
    'git diff --check',
  ];

  let previousIndex = -1;
  for (const command of commands) {
    const index = workflow.indexOf(command);
    assert.notEqual(index, -1, `CI workflow must run ${command}`);
    assert.ok(index > previousIndex, `${command} must run after the previous quality command`);
    previousIndex = index;
  }
});

test('CI workflow uses read-only actions and PR-only cancellation', async () => {
  const workflow = await readWorkflow();

  assert.match(workflow, /uses:\s*actions\/checkout@v4/);
  assert.match(workflow, /uses:\s*actions\/setup-node@v4/);
  assert.match(workflow, /cache:\s*npm/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/);
  assert.match(workflow, /github\.event\.pull_request\.number\s*\|\|\s*github\.ref/);
  assert.match(workflow, /cancel-in-progress:\s*\$\{\{\s*github\.event_name\s*==\s*'pull_request'\s*\}\}/);
  assert.doesNotMatch(workflow, /id-token:\s*write/);
  assert.doesNotMatch(workflow, /npm publish/);
});
