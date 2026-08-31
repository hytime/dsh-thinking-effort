import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'ci.yml');
const requiredCommands = [
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

async function readWorkflow() {
  return parse(await readFile(workflowPath, 'utf8'));
}

function scalarValues(value) {
  if (Array.isArray(value)) return value.flatMap(scalarValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(scalarValues);
  return typeof value === 'string' ? [value] : [];
}

function assertWorkflowStructure(workflow) {
  assert.ok(workflow && typeof workflow === 'object', 'CI workflow must parse to an object');
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.push.branches, ['main']);

  const quality = workflow.jobs?.quality;
  assert.ok(quality && typeof quality === 'object', 'CI workflow must define jobs.quality');
  assert.deepEqual(quality.strategy?.matrix?.['node-version'], ['22.19.0', '24.x']);

  const setupNode = quality.steps.find((step) => step.uses === 'actions/setup-node@v4');
  assert.ok(quality.steps.some((step) => step.uses === 'actions/checkout@v4'), 'quality job must check out the repository');
  assert.ok(setupNode, 'quality job must use actions/setup-node@v4');
  assert.equal(setupNode.with?.['node-version'], '${{ matrix.node-version }}');
  assert.equal(setupNode.with?.cache, 'npm');

  const runCommands = quality.steps.filter((step) => Object.hasOwn(step, 'run')).map((step) => step.run);
  assert.deepEqual(runCommands, requiredCommands);

  assert.equal(workflow.permissions?.contents, 'read');
  assert.equal(quality.permissions?.contents ?? workflow.permissions?.contents, 'read');
  assert.notEqual(workflow.permissions?.['id-token'], 'write');
  assert.notEqual(quality.permissions?.['id-token'], 'write');

  assert.equal(workflow.concurrency?.group, 'ci-${{ github.event.pull_request.number || github.ref }}');
  assert.equal(
    workflow.concurrency?.['cancel-in-progress'],
    "${{ github.event_name == 'pull_request' }}",
  );
  assert.equal(scalarValues(workflow).some((value) => /\bnpm\s+publish\b/.test(value)), false);
}

test('CI workflow declares the required triggers and Node matrix', async () => {
  const workflow = await readWorkflow();

  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(workflow.jobs.quality.strategy.matrix['node-version'], ['22.19.0', '24.x']);
});

test('CI workflow runs every required quality command in order', async () => {
  const workflow = await readWorkflow();
  const runCommands = workflow.jobs.quality.steps
    .filter((step) => Object.hasOwn(step, 'run'))
    .map((step) => step.run);

  assert.deepEqual(runCommands, requiredCommands);
});

test('CI workflow configures setup-node, permissions, and PR concurrency structurally', async () => {
  const workflow = await readWorkflow();
  const quality = workflow.jobs.quality;
  const setupNode = quality.steps.find((step) => step.uses === 'actions/setup-node@v4');

  assert.equal(setupNode.with['node-version'], '${{ matrix.node-version }}');
  assert.equal(setupNode.with.cache, 'npm');
  assert.equal(workflow.permissions.contents, 'read');
  assert.equal(quality.permissions?.contents ?? workflow.permissions.contents, 'read');
  assert.notEqual(workflow.permissions['id-token'], 'write');
  assert.notEqual(quality.permissions?.['id-token'], 'write');
  assert.equal(workflow.concurrency.group, 'ci-${{ github.event.pull_request.number || github.ref }}');
  assert.equal(
    workflow.concurrency['cancel-in-progress'],
    "${{ github.event_name == 'pull_request' }}",
  );
  assert.equal(scalarValues(workflow).some((value) => /\bnpm\s+publish\b/.test(value)), false);
});

test('CI workflow has the complete expected structure', async () => {
  assertWorkflowStructure(await readWorkflow());
});

test('keywords in comments and unrelated fields do not satisfy workflow validation', () => {
  const fixture = parse(`
# pull_request:
# node-version: [22.19.0, 24.x]
# npm ci
name: malformed
on:
  push:
    branches: [main]
permissions:
  contents: write
  note: "contents: read; id-token: write"
concurrency:
  note: "github.event.pull_request.number || github.ref"
jobs:
  quality:
    strategy:
      matrix:
        runtime: [22.19.0, 24.x]
    note: "actions/setup-node@v4 cache: npm npm ci npm run build"
    steps:
      - name: misleading step
        run: echo "npm ci npm run build npm test"
`);

  assert.throws(() => assertWorkflowStructure(fixture), /pull_request/);
});
