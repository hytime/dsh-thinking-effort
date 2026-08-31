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
  assert.ok(Object.hasOwn(workflow.on, 'pull_request'), 'workflow must declare pull_request trigger');
  assert.ok(Object.hasOwn(workflow.on, 'push'), 'workflow must declare push trigger');
  assert.ok(
    Object.hasOwn(workflow.on, 'workflow_dispatch'),
    'workflow must declare workflow_dispatch trigger',
  );
  assert.deepEqual(workflow.on.push.branches, ['main'], 'workflow must push only from main');

  const quality = workflow.jobs?.quality;
  assert.ok(quality && typeof quality === 'object', 'CI workflow must define jobs.quality');
  assert.deepEqual(
    quality.strategy?.matrix?.['node-version'],
    ['22.19.0', '24.x'],
    'quality job must use the supported Node matrix',
  );

  const setupNode = quality.steps.find((step) => step.uses === 'actions/setup-node@v4');
  assert.ok(
    quality.steps.some((step) => step.uses === 'actions/checkout@v4'),
    'quality job must check out the repository',
  );
  assert.ok(setupNode, 'quality job must use actions/setup-node@v4');
  assert.equal(
    setupNode.with?.['node-version'],
    '${{ matrix.node-version }}',
    'setup-node must use the matrix Node version',
  );
  assert.equal(setupNode.with?.cache, 'npm', 'setup-node must use npm cache');

  const runCommands = quality.steps.filter((step) => Object.hasOwn(step, 'run')).map((step) => step.run);
  assert.deepEqual(
    runCommands,
    requiredCommands,
    'quality job must run the required commands in order',
  );

  assert.equal(workflow.permissions?.contents, 'read', 'workflow contents permission must be read');
  assert.equal(
    quality.permissions?.contents ?? workflow.permissions?.contents,
    'read',
    'quality contents permission must be read',
  );
  assert.notEqual(
    workflow.permissions?.['id-token'],
    'write',
    'workflow must not grant id-token write',
  );
  assert.notEqual(
    quality.permissions?.['id-token'],
    'write',
    'quality must not grant id-token write',
  );

  assert.equal(
    workflow.concurrency?.group,
    'ci-${{ github.event.pull_request.number || github.ref }}',
    'workflow must group pull requests by number',
  );
  assert.equal(
    workflow.concurrency?.['cancel-in-progress'],
    "${{ github.event_name == 'pull_request' }}",
    'workflow must cancel only pull request runs',
  );
  assert.equal(
    scalarValues(workflow).some((value) => /\bnpm\s+publish\b/.test(value)),
    false,
    'workflow must not publish npm',
  );
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

const malformedWorkflowCases = [
  {
    name: 'pull_request trigger',
    mutate: (workflow) => delete workflow.on.pull_request,
    message: 'workflow must declare pull_request trigger',
  },
  {
    name: 'push branch trigger',
    mutate: (workflow) => {
      workflow.on.push.branches = ['develop'];
    },
    message: 'workflow must push only from main',
  },
  {
    name: 'workflow_dispatch trigger',
    mutate: (workflow) => delete workflow.on.workflow_dispatch,
    message: 'workflow must declare workflow_dispatch trigger',
  },
  {
    name: 'Node matrix',
    mutate: (workflow) => {
      workflow.jobs.quality.strategy.matrix['node-version'] = ['22.19.0'];
    },
    message: 'quality job must use the supported Node matrix',
  },
  {
    name: 'setup-node version',
    mutate: (workflow) => {
      workflow.jobs.quality.steps.find((step) => step.uses === 'actions/setup-node@v4').with[
        'node-version'
      ] = '22.19.0';
    },
    message: 'setup-node must use the matrix Node version',
  },
  {
    name: 'setup-node cache',
    mutate: (workflow) => {
      workflow.jobs.quality.steps.find((step) => step.uses === 'actions/setup-node@v4').with.cache = 'yarn';
    },
    message: 'setup-node must use npm cache',
  },
  {
    name: 'quality run steps',
    mutate: (workflow) => {
      workflow.jobs.quality.steps.find((step) => Object.hasOwn(step, 'run')).run = 'echo npm ci';
    },
    message: 'quality job must run the required commands in order',
  },
  {
    name: 'contents permission',
    mutate: (workflow) => {
      workflow.permissions.contents = 'write';
    },
    message: 'workflow contents permission must be read',
  },
  {
    name: 'id-token permission',
    mutate: (workflow) => {
      workflow.permissions['id-token'] = 'write';
    },
    message: 'workflow must not grant id-token write',
  },
  {
    name: 'concurrency group',
    mutate: (workflow) => {
      workflow.concurrency.group = 'ci-${{ github.ref }}';
    },
    message: 'workflow must group pull requests by number',
  },
  {
    name: 'concurrency cancellation',
    mutate: (workflow) => {
      workflow.concurrency['cancel-in-progress'] = false;
    },
    message: 'workflow must cancel only pull request runs',
  },
  {
    name: 'publish command',
    mutate: (workflow) => {
      workflow.jobs.quality.steps.find((step) => step.uses === 'actions/checkout@v4').name =
        'checkout (npm publish marker)';
    },
    message: 'workflow must not publish npm',
  },
];

test('each malformed workflow fixture fails at its broken structural constraint', async () => {
  const validWorkflow = await readWorkflow();

  for (const { name, mutate, message } of malformedWorkflowCases) {
    const fixture = structuredClone(validWorkflow);
    mutate(fixture);
    assert.throws(() => assertWorkflowStructure(fixture), new RegExp(message), name);
  }
});
