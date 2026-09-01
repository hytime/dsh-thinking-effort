import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repositoryRoot, '.github', 'workflows', 'ci.yml');
const publishWorkflowPath = path.join(repositoryRoot, '.github', 'workflows', 'publish.yml');
const publishFixtureRoot = path.join(repositoryRoot, 'scripts', 'fixtures');
const publishCleanupFixturePath = path.join(publishFixtureRoot, 'publish-invalid-cleanup.yml');
const publishNpmTokenFixturePath = path.join(publishFixtureRoot, 'publish-invalid-npm-token.yml');
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

function assertNoNpmTokenEnv(value, location = 'workflow') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNpmTokenEnv(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  if (
    value.env &&
    typeof value.env === 'object' &&
    !Array.isArray(value.env) &&
    Object.hasOwn(value.env, 'NPM_TOKEN')
  ) {
    assert.fail(`publish workflow must not define NPM_TOKEN in ${location}.env`);
  }

  for (const [key, child] of Object.entries(value)) {
    assertNoNpmTokenEnv(child, `${location}.${key}`);
  }
}

function assertNoNodeAuthTokenEnv(value, location = 'workflow') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNodeAuthTokenEnv(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  if (
    value.env &&
    typeof value.env === 'object' &&
    !Array.isArray(value.env) &&
    Object.hasOwn(value.env, 'NODE_AUTH_TOKEN')
  ) {
    assert.fail(`publish workflow must not define NODE_AUTH_TOKEN in ${location}.env`);
  }

  for (const [key, child] of Object.entries(value)) {
    assertNoNodeAuthTokenEnv(child, `${location}.${key}`);
  }
}

function assertNoNpmConfigUserconfig(value, location = 'workflow') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNpmConfigUserconfig(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;

  if (Object.hasOwn(value, 'NPM_CONFIG_USERCONFIG')) {
    assert.fail(`publish workflow must not define NPM_CONFIG_USERCONFIG in ${location}`);
  }

  for (const [key, child] of Object.entries(value)) {
    assertNoNpmConfigUserconfig(child, `${location}.${key}`);
  }
}

function assertNoPublishAuthTokens(workflow) {
  assertNoNpmTokenEnv(workflow);
  assertNoNodeAuthTokenEnv(workflow);
  assertNoNpmConfigUserconfig(workflow);

  const scalarValuesInWorkflow = scalarValues(workflow);
  assert.equal(
    scalarValuesInWorkflow.some((value) => /\bNPM_TOKEN\b/.test(value)),
    false,
    'publish workflow must not reference NPM_TOKEN',
  );
  assert.equal(
    scalarValuesInWorkflow.some((value) => /\bNODE_AUTH_TOKEN\b/.test(value)),
    false,
    'publish workflow must not reference NODE_AUTH_TOKEN',
  );
}

const expectedCompatibilityCleanup =
  'rm -rf "${RUN_ROOT:-$RUNNER_TEMP/dsh-thinking-effort-compat-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}}"';

function assertCompatibilityCleanupStructure(compatibility) {
  assert.ok(Array.isArray(compatibility?.steps), 'compatibility job must define steps');
  const cleanup = compatibility.steps.find(
    (step) => step.name === 'Cleanup temporary compatibility resources',
  );
  assert.ok(cleanup, 'compatibility job must define the temporary resources cleanup step');
  assert.equal(cleanup.if, '${{ always() }}', 'compatibility cleanup must run with always()');
  assert.equal(
    cleanup.run?.trim(),
    expectedCompatibilityCleanup,
    'compatibility cleanup must use a syntactically valid RUN_ROOT fallback expression',
  );
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

const publishAuthCleanupCommand = 'npm config delete //registry.npmjs.org/:_authToken';
const publishNpmVersionCommand = `set -Eeuo pipefail
npm_version="$(npm --version)"
printf 'npm %s\\n' "$npm_version"
node -e 'const [major, minor, patch] = process.argv[1].split(".").map(Number); if (major < 11 || (major === 11 && (minor < 5 || (minor === 5 && patch < 1)))) throw new Error("npm >= 11.5.1 is required")' "$npm_version"
`;

const publishQualityCommands = [
  'npm ci',
  'npm run build',
  'node scripts/verify-release.mjs "$GITHUB_REF_NAME"',
  `set -Eeuo pipefail
PACKAGE_VERSION="$(node -p "require('./package.json').version")"
query_output="$RUNNER_TEMP/dsh-thinking-effort-npm-view.txt"
set +e
npm view @hytime/dsh-thinking-effort@\${PACKAGE_VERSION} version --json > "$query_output" 2>&1
query_status=$?
set -e
if [ "$query_status" -eq 0 ]; then
  echo "npm version \${PACKAGE_VERSION} already exists" >&2
  exit 1
fi
if ! grep -Eiq 'E404|HTTP[[:space:]]+404' "$query_output"; then
  cat "$query_output" >&2
  exit "$query_status"
fi
`,
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
  assert.equal(
    quality.steps.find((step) => step.uses === 'actions/checkout@v4')?.with?.['fetch-depth'],
    0,
    'quality job must check out full history',
  );
  assert.equal(
    quality.steps.find((step) => step.uses === 'actions/setup-node@v4')?.with?.['node-version'],
    '22.19.0',
    'quality job must use Node 22.19.0',
  );
  const duplicateCheck = publishRunCommands(quality).find((command) =>
    command.includes('npm view @hytime/dsh-thinking-effort@${PACKAGE_VERSION} version --json'),
  );
  assert.ok(duplicateCheck, 'quality job must check whether the package version already exists');
  assert.match(duplicateCheck, /PACKAGE_VERSION="\$\(node -p/);
  assert.match(duplicateCheck, /grep -Eiq 'E404\|HTTP\[\[:space:\]\]\+404'/);
  assert.doesNotMatch(duplicateCheck, /not found/i);
  const publishTagGuard = publish.steps.find((step) => step.name === 'Verify tag points to main');
  assert.equal(
    publishTagGuard?.run,
    `set -Eeuo pipefail
git fetch --no-tags origin main
git merge-base --is-ancestor "$GITHUB_SHA" origin/main
`,
    'publish job must verify that the tag points to main',
  );
  const publishAuthCleanup = publish.steps.find((step) => step.name === 'Remove setup-node npm auth');
  assert.equal(
    publishAuthCleanup?.run,
    publishAuthCleanupCommand,
    'publish job must remove setup-node auth without changing registry configuration',
  );
  const publishNpmVersion = publish.steps.find((step) => step.name === 'Verify npm version for Trusted Publishing');
  assert.equal(
    publishNpmVersion?.run,
    publishNpmVersionCommand,
    'publish job must assert the npm Trusted Publishing minimum version',
  );
  const publishInstall = publish.steps.find((step) => step.name === 'Install dependencies');
  assert.equal(publishInstall?.run, 'npm ci');
  const publishBuild = publish.steps.find((step) => step.name === 'Build');
  assert.equal(publishBuild?.run, 'npm run build');
  const publishPackage = publish.steps.find((step) => step.name === 'Publish package with provenance');
  assert.equal(publishPackage?.run, 'npm publish --provenance --access public');
  assert.deepEqual(
    publishRunCommands(publish),
    [publishTagGuard?.run, publishAuthCleanup?.run, publishNpmVersion?.run, publishInstall?.run, publishBuild?.run, publishPackage?.run],
    'publish job must verify, isolate auth, check npm, install, build, and publish in order',
  );
  assert.equal(
    publish.steps.find((step) => step.uses === 'actions/setup-node@v4')?.with?.['node-version'],
    '24.x',
    'publish job must use Node 24.x',
  );
  assert.equal(
    publish.steps.find((step) => step.uses === 'actions/setup-node@v4')?.with?.['registry-url'],
    'https://registry.npmjs.org',
    'publish job must configure the npm registry',
  );
  assertNoPublishAuthTokens(workflow);
  assert.equal(publishRunCommands(publish).some((command) => command.includes('npm view ')), false);
  assert.ok(publishRunCommands(publish).includes('npm ci'), 'publish job must run npm ci');
  assert.ok(publishRunCommands(publish).includes('npm run build'), 'publish job must run npm run build');
  assert.ok(Array.isArray(compatibility.steps), 'compatibility job must define steps');
  assertCompatibilityCleanupStructure(compatibility);
  assert.deepEqual(compatibility.needs, 'quality', 'compatibility must need quality');
  assert.deepEqual(publish.needs, ['quality', 'compatibility'], 'publish must need quality and compatibility');
  assert.equal(publish.permissions?.contents, 'read', 'publish contents permission must be read');
  assert.equal(publish.permissions?.['id-token'], 'write', 'publish must have OIDC id-token write permission');
  assert.equal(publish.concurrency?.group, 'npm-publish-${{ github.ref_name }}');
  assert.equal(publish.concurrency?.['cancel-in-progress'], false);

  const compatibilityBuild = compatibility.steps.find(
    (step) => step.name === 'Build three official DSH capability representatives and run integration tests',
  );
  assert.ok(compatibilityBuild, 'compatibility job must define its build and integration step');
  assert.equal(typeof compatibilityBuild.run, 'string', 'compatibility build step must have a run script');
  for (const required of [
    'dsh-v0.1.0-rc.7',
    'dsh-v0.1.1-rc.2',
    'dsh-v0.1.2-alpha.3',
    'DSH_CLI_ROOTS="$RC7_ROOT,$RC2_ROOT,$ALPHA_ROOT"',
    'corepack enable',
    'pnpm install --frozen-lockfile --ignore-scripts',
    'pnpm run build',
    'CHROME_PATH',
    'dsh plugin',
    'DSH_LOADER_INTEGRATION=1',
    'DSH_REQUIRE_THINKING_EFFORT_DOM=1',
    'npm test -- tests/loader-composition.test.ts',
    'trap',
    'DSH_TEST_PID=$!',
    'kill "$DSH_TEST_PID"',
    'wait "$DSH_TEST_PID"',
    'rm -rf "$RUN_ROOT"',
  ]) {
    assert.ok(compatibilityBuild.run.includes(required), `compatibility build step must include ${required}`);
  }
  assert.match(compatibilityBuild.run, /RC7_ROOT=.*dsh-v0\.1\.0-rc\.7/);
  assert.match(compatibilityBuild.run, /RC2_ROOT=.*dsh-v0\.1\.1-rc\.2/);
  assert.match(compatibilityBuild.run, /ALPHA_ROOT=.*dsh-v0\.1\.2-alpha\.3/);
  assert.equal((compatibilityBuild.run.match(/git clone --depth 1 --branch/g) ?? []).length, 3);
  assert.doesNotMatch(compatibilityBuild.run, /dsh-v0\.1\.2-alpha\.[12]/);
  assert.match(compatibilityBuild.run, /npm test -- tests\/loader-composition\.test\.ts\s*&/);

  assert.match(publishTagGuard.run, /git fetch --no-tags origin main/);
  assert.match(publishTagGuard.run, /git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main/);
  assert.doesNotMatch(publishRunCommands(publish).join('\n'), /npm view @hytime\/dsh-thinking-effort@\$\{PACKAGE_VERSION\} version --json/);
  assert.equal(publishPackage.run, 'npm publish --provenance --access public');

}

test('publish workflow does not use runner context in job-level env', async () => {
  const workflow = await readPublishWorkflow();
  const compatibilityEnv = workflow.jobs.compatibility?.env ?? {};

  for (const value of Object.values(compatibilityEnv)) {
    assert.doesNotMatch(String(value), /\$\{\{\s*runner\./);
  }
});

test('publish workflow declares tag guards, dependencies, OIDC, and compatibility matrix', async () => {
  assertPublishWorkflowStructure(await readPublishWorkflow());
});

test('publish workflow rejects a malformed compatibility cleanup fixture', async () => {
  const fixture = parse(await readFile(publishCleanupFixturePath, 'utf8'));

  assert.throws(
    () => assertCompatibilityCleanupStructure(fixture.jobs.compatibility),
    /compatibility cleanup must use a syntactically valid RUN_ROOT fallback expression/,
  );
});

test('publish workflow rejects NPM_TOKEN keys in nested env fixtures', async () => {
  const fixture = parse(await readFile(publishNpmTokenFixturePath, 'utf8'));

  assert.throws(
    () => assertNoNpmTokenEnv(fixture),
    /NPM_TOKEN.*workflow\.jobs\.publish\.steps\[0\]\.with\.options\.env/,
  );
});
