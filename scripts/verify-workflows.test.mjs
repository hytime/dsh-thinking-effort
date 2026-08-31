import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'ci.yml');
const publishWorkflowPath = path.join(repositoryRoot, '.github', 'workflows', 'publish.yml');
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
  assert.ok(workflow.on && typeof workflow.on === 'object', 'workflow must define triggers');
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
  assert.ok(Array.isArray(quality.steps), 'quality job must define steps');

  const setupNode = quality.steps.find((step) => step.uses === 'actions/setup-node@v4');
  assert.ok(
    quality.steps.some((step) => step.uses === 'actions/checkout@v4'),
    'quality job must use actions/checkout@v4',
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
    name: 'push trigger',
    mutate: (workflow) => delete workflow.on.push,
    message: 'workflow must declare push trigger',
  },
  {
    name: 'workflow_dispatch trigger',
    mutate: (workflow) => delete workflow.on.workflow_dispatch,
    message: 'workflow must declare workflow_dispatch trigger',
  },
  {
    name: 'quality job',
    mutate: (workflow) => delete workflow.jobs.quality,
    message: 'CI workflow must define jobs.quality',
  },
  {
    name: 'quality steps',
    mutate: (workflow) => delete workflow.jobs.quality.steps,
    message: 'quality job must define steps',
  },
  {
    name: 'checkout action',
    mutate: (workflow) => {
      workflow.jobs.quality.steps = workflow.jobs.quality.steps.filter(
        (step) => step.uses !== 'actions/checkout@v4',
      );
    },
    message: 'quality job must use actions/checkout@v4',
  },
  {
    name: 'setup-node action',
    mutate: (workflow) => {
      workflow.jobs.quality.steps = workflow.jobs.quality.steps.filter(
        (step) => step.uses !== 'actions/setup-node@v4',
      );
    },
    message: 'quality job must use actions/setup-node@v4',
  },
  {
    name: 'job contents permission',
    mutate: (workflow) => {
      workflow.jobs.quality.permissions = { contents: 'write' };
    },
    message: 'quality contents permission must be read',
  },
  {
    name: 'job id-token permission',
    mutate: (workflow) => {
      workflow.jobs.quality.permissions = { 'id-token': 'write' };
    },
    message: 'quality must not grant id-token write',
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

async function readPublishWorkflow() {
  return parse(await readFile(publishWorkflowPath, 'utf8'));
}

const publishQualityCommands = [
  'node scripts/verify-release.mjs "$GITHUB_REF_NAME"',
  'npm ci',
  'npm run build',
  'npm run typecheck',
  'npm run typecheck:test',
  'npm run test:release',
  'npm test',
  'node --check lib/index.js',
  'node --check lib/client.js',
  'npm pack --dry-run',
  'npm audit --audit-level=high',
  'git diff --check',
];

function publishRunCommands(job) {
  return job.steps.filter((step) => Object.hasOwn(step, 'run')).map((step) => step.run);
}

function assertPublishWorkflowStructure(workflow) {
  assert.ok(workflow && typeof workflow === 'object', 'publish workflow must parse to an object');
  assert.deepEqual(Object.keys(workflow.on ?? {}), ['push'], 'publish workflow must only define push trigger');
  assert.deepEqual(workflow.on.push?.tags, ['v*.*.*'], 'publish workflow must trigger v*.*.* tags');
  assert.equal(workflow.permissions?.contents, 'read', 'publish workflow contents permission must be read');

  const quality = workflow.jobs?.quality;
  const compatibility = workflow.jobs?.compatibility;
  const publish = workflow.jobs?.publish;
  assert.ok(quality && typeof quality === 'object', 'publish workflow must define jobs.quality');
  assert.ok(compatibility && typeof compatibility === 'object', 'publish workflow must define jobs.compatibility');
  assert.ok(publish && typeof publish === 'object', 'publish workflow must define jobs.publish');
  assert.deepEqual(publishRunCommands(quality), publishQualityCommands, 'publish quality commands must run in order');
  assert.equal(quality.steps.find((step) => step.uses === 'actions/checkout@v4')?.with?.['fetch-depth'], 0);
  assert.equal(quality.steps.find((step) => step.uses === 'actions/setup-node@v4')?.with?.['node-version'], '22.19.0');
  assert.deepEqual(compatibility.needs, 'quality', 'compatibility must need quality');
  assert.deepEqual(publish.needs, ['quality', 'compatibility'], 'publish must need quality and compatibility');
  assert.equal(publish.permissions?.contents, 'read', 'publish contents permission must be read');
  assert.equal(publish.permissions?.['id-token'], 'write', 'publish must have OIDC id-token write permission');
  assert.equal(publish.concurrency?.group, 'npm-publish-${{ github.ref_name }}');
  assert.equal(publish.concurrency?.['cancel-in-progress'], false);

  const allCommands = scalarValues(workflow).filter((value) => value.includes('\n') || value.includes(' '));
  const compatibilityText = allCommands.join('\n');
  for (const required of [
    'dsh-v0.1.2-alpha.1',
    'dsh-v0.1.1-rc.2',
    'dsh-v0.1.0-rc.7',
    'DSH_CLI_ROOTS="$ALPHA_ROOT,$RC2_ROOT,$RC7_ROOT"',
    'corepack enable',
    'pnpm install --frozen-lockfile --ignore-scripts',
    'pnpm run build',
    'CHROME_PATH',
    'dsh plugin',
    'DSH_LOADER_INTEGRATION=1',
    'DSH_REQUIRE_THINKING_EFFORT_DOM=1',
    'npm test -- tests/loader-composition.test.ts',
    'trap',
  ]) {
    assert.ok(compatibilityText.includes(required), `publish workflow must include ${required}`);
  }
  assert.match(compatibilityText, /ALPHA_ROOT=.*dsh-v0\.1\.2-alpha\.1/);
  assert.match(compatibilityText, /RC2_ROOT=.*dsh-v0\.1\.1-rc\.2/);
  assert.match(compatibilityText, /RC7_ROOT=.*dsh-v0\.1\.0-rc\.7/);

  const publishCommands = publishRunCommands(publish).join('\n');
  assert.match(publishCommands, /git fetch --no-tags origin main/);
  assert.match(publishCommands, /git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/);
  assert.match(publishCommands, /npm view @hytime\/dsh-thinking-effort@\$\{PACKAGE_VERSION\} version --json/);
  assert.match(publishCommands, /npm publish --provenance --access public/);
  assert.equal(scalarValues(workflow).some((value) => value.includes('NPM_TOKEN')), false, 'publish workflow must not use NPM_TOKEN');
}

test('publish workflow declares tag guards, dependencies, OIDC, and compatibility matrix', async () => {
  assertPublishWorkflowStructure(await readPublishWorkflow());
});
