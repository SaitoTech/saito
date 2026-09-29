import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export function run(command, args, cwd, { capture = false, allowFailure = false } = {}) {
  const env = { ...process.env, CI: 'true', GIT_TERMINAL_PROMPT: '0' };
  // Nested Node test runners otherwise silently skip their child suites.
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_PATH;
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    maxBuffer: 64 * 1024 * 1024,
    env
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status ?? result.signal})${
        capture ? `\n${result.stderr || result.stdout}` : ''
      }`
    );
  }
  return result;
}

export const git = (cwd, args) => run('git', args, cwd, { capture: true }).stdout.trim();
export const slash = (value) => value.split(path.sep).join('/');

export function committedFiles(root, revision = 'HEAD') {
  return new Set(
    run('git', ['ls-tree', '-r', '-z', '--full-tree', '--name-only', revision], root, {
      capture: true
    })
      .stdout.split('\0')
      .filter(Boolean)
  );
}

export function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const name = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are not supported in tests: ${name}`);
      return entry.isDirectory() ? walk(name) : [name];
    })
    .sort();
}

export function readPolicy(project) {
  const policy = JSON.parse(fs.readFileSync(path.join(project, 'config/promotion.json'), 'utf8'));
  if (!Array.isArray(policy.archivedTests) || !Array.isArray(policy.referenceExceptions)) {
    throw new Error('promotion.json must define archivedTests and referenceExceptions arrays');
  }
  for (const rule of policy.referenceExceptions) {
    if (
      !['module', 'file', 'asset', 'dynamic'].includes(rule.kind) ||
      !rule.source ||
      !rule.reference ||
      !rule.reason?.trim()
    ) {
      throw new Error(
        'Each reference exception needs kind, exact source, exact reference, and reason'
      );
    }
  }
  return policy;
}
