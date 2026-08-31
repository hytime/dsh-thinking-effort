import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tagPattern = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function localTarget(root, target) {
  if (typeof target !== 'string' || target.length === 0 || path.isAbsolute(target)) return undefined;
  const rootPath = path.resolve(root);
  const resolved = path.resolve(rootPath, target);
  const relative = path.relative(rootPath, resolved);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return undefined;
  }
  return resolved;
}

async function fileExists(root, target) {
  const rootPath = path.resolve(root);
  const resolved = localTarget(rootPath, target);
  if (!resolved) return false;
  try {
    const canonicalRoot = await realpath(rootPath);
    const canonicalTarget = await realpath(resolved);
    const relative = path.relative(canonicalRoot, canonicalTarget);
    if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return false;
    }
    return (await stat(canonicalTarget)).isFile();
  } catch {
    return false;
  }
}

function exportTargets(entry) {
  if (typeof entry === 'string') return [entry];
  if (!entry || typeof entry !== 'object') return [];
  return Object.values(entry).flatMap(exportTargets);
}

async function assertFile(root, target, label) {
  if (!(await fileExists(root, target))) {
    throw new Error(`${label} must point to an existing file: ${target ?? '<missing>'}`);
  }
}

async function assertExport(root, entry, label) {
  const targets = exportTargets(entry);
  if (targets.length === 0) {
    throw new Error(`${label} must point to an existing file: <missing>`);
  }
  for (const target of targets) {
    await assertFile(root, target, label);
  }
}

async function workflowFiles(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await workflowFiles(entryPath)));
      } else if (entry.isFile() && /\.(?:yaml|yml)$/.test(entry.name)) {
        files.push(entryPath);
      }
    }
    return files;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function assertWorkflowDoesNotUseNpmToken(root) {
  const files = await workflowFiles(path.join(root, '.github', 'workflows'));
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    if (/NPM_TOKEN/.test(content)) {
      throw new Error(`workflow must not use NPM_TOKEN: ${path.relative(root, file)}`);
    }
  }
}

export async function runGuard(root = scriptRoot, tag) {
  if (typeof tag !== 'string' || !tagPattern.test(tag)) {
    throw new Error(`tag version is invalid: ${tag ?? '<missing>'}`);
  }

  const manifestPath = path.join(root, 'package.json');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`unable to read package manifest: ${error.message}`, { cause: error });
  }

  if (tag.slice(1) !== manifest.version) {
    throw new Error(`tag version ${tag} does not match manifest version ${manifest.version}`);
  }
  if (manifest.private === true) {
    throw new Error('package is private');
  }
  if (manifest.publishConfig?.access !== 'public') {
    throw new Error('publishConfig.access must be public');
  }

  await assertFile(root, manifest.main, 'main');
  await assertExport(root, manifest.exports?.['.'], 'package export');
  await assertExport(root, manifest.exports?.['./client'], 'client export');

  if (!Array.isArray(manifest.files)) {
    throw new Error('files must include release entries');
  }
  for (const requiredFile of ['lib/index.js', 'lib/client.js', 'lib/types/**/*.d.ts']) {
    if (!manifest.files.includes(requiredFile)) {
      throw new Error(`files must include ${requiredFile}`);
    }
  }

  if (typeof manifest.dsh?.bundle?.patch !== 'string' || manifest.dsh.bundle.patch.length === 0) {
    throw new Error('dsh.bundle.patch must be present');
  }
  if (manifest.dsh?.client?.platform !== 'web') {
    throw new Error('dsh.client.platform must be web');
  }

  await assertWorkflowDoesNotUseNpmToken(root);
  return 0;
}

function parseArgs(args) {
  let tag;
  let root = scriptRoot;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--root') {
      root = args[++index];
      if (!root) throw new Error('--root requires a directory');
    } else if (argument.startsWith('--')) {
      throw new Error(`unknown option: ${argument}`);
    } else if (tag === undefined) {
      tag = argument;
    } else {
      throw new Error(`unexpected argument: ${argument}`);
    }
  }
  if (tag === undefined) throw new Error('usage: node scripts/verify-release.mjs <tag> [--root <directory>]');
  return { root: path.resolve(root), tag };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { root, tag } = parseArgs(process.argv.slice(2));
    await runGuard(root, tag);
    console.log(`release guard passed for ${tag}`);
  } catch (error) {
    console.error(`release guard failed: ${error.message}`);
    process.exitCode = 1;
  }
}
