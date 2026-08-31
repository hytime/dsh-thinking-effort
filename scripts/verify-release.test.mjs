import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runGuard } from './verify-release.mjs';

const validManifest = {
  name: '@fixture/release-package',
  version: '0.1.11',
  private: false,
  main: './lib/index.js',
  publishConfig: { access: 'public' },
  files: ['lib/index.js', 'lib/client.js', 'lib/types/**/*.d.ts'],
  exports: {
    '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
    './client': { types: './lib/types/client/index.d.ts', default: './lib/client.js' },
  },
  dsh: {
    bundle: { patch: './cordis.patch.yml' },
    client: { platform: 'web' },
  },
};

async function createFixture(overrides = {}, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-release-'));
  const manifest = {
    ...validManifest,
    ...overrides,
    publishConfig: { ...validManifest.publishConfig, ...overrides.publishConfig },
    exports: { ...validManifest.exports, ...overrides.exports },
    dsh: {
      ...validManifest.dsh,
      ...overrides.dsh,
      bundle: { ...validManifest.dsh.bundle, ...overrides.dsh?.bundle },
      client: { ...validManifest.dsh.client, ...overrides.dsh?.client },
    },
  };

  await mkdir(path.join(root, 'lib/types/client'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(root, 'lib/index.js'), 'export {}\n');
  if (!options.missingClient) {
    await writeFile(path.join(root, 'lib/client.js'), 'export {}\n');
  }
  await writeFile(path.join(root, 'lib/types/index.d.ts'), 'export {}\n');
  await writeFile(path.join(root, 'lib/types/client/index.d.ts'), 'export {}\n');
  await writeFile(path.join(root, 'cordis.patch.yml'), 'packages: {}\n');
  if (options.workflow) {
    await mkdir(path.join(root, '.github/workflows'), { recursive: true });
    await writeFile(path.join(root, '.github/workflows/release.yml'), options.workflow);
  }

  return root;
}

async function withFixture(overrides, options, callback) {
  const root = await createFixture(overrides, options);
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('accepts a matching public release fixture and safe workflow', async () => {
  await withFixture({}, { workflow: 'name: release\n' }, async (fixture) => {
    assert.equal(await runGuard(fixture, 'v0.1.11'), 0);
  });
});

test('accepts a valid prerelease tag', async () => {
  await withFixture({ version: '0.1.11-rc.1' }, {}, async (fixture) => {
    assert.equal(await runGuard(fixture, 'v0.1.11-rc.1'), 0);
  });
});

test('rejects an invalid tag version', async () => {
  await withFixture({}, {}, async (fixture) => {
    await assert.rejects(() => runGuard(fixture, 'v0.1.11-01'), /tag version/);
  });
});

test('rejects a tag whose version differs from the fixture manifest', async () => {
  await withFixture({}, {}, async (fixture) => {
    await assert.rejects(() => runGuard(fixture, 'v0.1.10'), /tag version/);
  });
});

test('rejects a private package fixture', async () => {
  await withFixture({ private: true }, {}, async (privateFixture) => {
    await assert.rejects(() => runGuard(privateFixture, 'v0.1.11'), /private/);
  });
});

test('rejects a package without public publish access', async () => {
  await withFixture({ publishConfig: { access: 'restricted' } }, {}, async (fixture) => {
    await assert.rejects(() => runGuard(fixture, 'v0.1.11'), /publishConfig.access/);
  });
});

test('rejects a directory used as the main entry', async () => {
  await withFixture({ main: './lib' }, {}, async (fixture) => {
    await assert.rejects(() => runGuard(fixture, 'v0.1.11'), /main/);
  });
});

test('rejects a missing client export target', async () => {
  await withFixture({}, { missingClient: true }, async (missingClientFixture) => {
    await assert.rejects(() => runGuard(missingClientFixture, 'v0.1.11'), /client export/);
  });
});

test('rejects a missing conditional package export target', async () => {
  await withFixture(
    { exports: { '.': { types: './lib/types/missing.d.ts', default: './lib/index.js' } } },
    {},
    async (fixture) => {
      await assert.rejects(() => runGuard(fixture, 'v0.1.11'), /package export/);
    },
  );
});

test('rejects release files missing a required entry', async () => {
  await withFixture({ files: ['lib/index.js'] }, {}, async (fixture) => {
    await assert.rejects(() => runGuard(fixture, 'v0.1.11'), /files must include lib\/client\.js/);
  });
});

test('rejects a missing dsh bundle patch', async () => {
  await withFixture({ dsh: { bundle: { patch: undefined } } }, {}, async (fixture) => {
    await assert.rejects(() => runGuard(fixture, 'v0.1.11'), /dsh\.bundle\.patch/);
  });
});

test('rejects a non-web dsh client platform', async () => {
  await withFixture({ dsh: { client: { platform: 'node' } } }, {}, async (fixture) => {
    await assert.rejects(() => runGuard(fixture, 'v0.1.11'), /dsh\.client\.platform/);
  });
});

test('rejects a workflow that uses NPM_TOKEN', async () => {
  await withFixture({}, { workflow: 'env:\n  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}\n' }, async (fixture) => {
    await assert.rejects(() => runGuard(fixture, 'v0.1.11'), /NPM_TOKEN/);
  });
});
