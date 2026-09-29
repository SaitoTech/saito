import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { committedFiles, git, run, slash, walk } from './common.mjs';

export function inventoryTests(project, policy) {
  const root = git(project, ['rev-parse', '--show-toplevel']);
  const committed = committedFiles(root);
  const require = createRequire(path.join(project, 'package.json'));
  const ts = require('typescript');
  const inventory = { jest: [], node: [], archived: [], errors: [] };
  for (const file of walk(path.join(project, 'tests'))) {
    const name = slash(path.relative(project, file));
    if (name.startsWith('tests/config/env/')) continue;
    if (!committed.has(slash(path.relative(root, file)))) {
      inventory.errors.push(`${name}: not committed in HEAD`);
    }
    if (!/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/.test(file) || /(?:^|\/)jest\.config\.[cm]?js$/.test(name))
      continue;
    if (!/\.(?:spec|test)\./.test(name)) continue; // Helpers and fixtures are not suites.
    if (policy.archivedTests.includes(name)) {
      const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
      if (tree.statements.length)
        inventory.errors.push(`${name}: archived test now contains executable code`);
      inventory.archived.push(name);
    } else if (/\.spec\.(?:ts|js)$/.test(name)) {
      inventory.jest.push(file);
    } else if (/\.test\.[cm]?js$/.test(name)) {
      inventory.node.push(file);
    } else {
      inventory.errors.push(`${name}: no runner assigned`);
    }
  }
  for (const name of policy.archivedTests) {
    if (!inventory.archived.includes(name)) inventory.errors.push(`${name}: stale archive entry`);
  }
  if (!inventory.jest.length && !inventory.node.length)
    inventory.errors.push('No runnable tests found');
  return inventory;
}

export function runTests(project, policy) {
  const inventory = inventoryTests(project, policy);
  if (inventory.errors.length) throw new Error(inventory.errors.join('\n'));
  for (const name of inventory.archived) console.log(`Archived (comments only): ${name}`);
  const require = createRequire(path.join(project, 'package.json'));
  const results = [];
  if (inventory.jest.length) {
    try {
      const jest = require.resolve('jest/bin/jest');
      const args = [jest, '--config', 'jest.config.cjs', '--runInBand'];
      const discovered = JSON.parse(
        run(process.execPath, [...args, '--listTests', '--json'], project, {
          capture: true
        }).stdout
      );
      const actual = new Set(discovered.map((file) => path.resolve(file)));
      const expected = new Set(inventory.jest);
      const mismatch = [...expected]
        .filter((file) => !actual.has(file))
        .concat([...actual].filter((file) => !expected.has(file)));
      if (mismatch.length)
        throw new Error(`Jest discovery does not match test inventory:\n${mismatch.join('\n')}`);
      results.push({
        runner: 'Jest',
        count: expected.size,
        status: run(process.execPath, args, project, { allowFailure: true }).status
      });
    } catch (error) {
      results.push({
        runner: 'Jest',
        count: inventory.jest.length,
        status: null,
        error: error.message
      });
    }
  }
  if (inventory.node.length) {
    results.push({
      runner: 'Node',
      count: inventory.node.length,
      status: run(process.execPath, ['--test', ...inventory.node], project, { allowFailure: true })
        .status
    });
  }
  for (const result of results)
    console.log(
      `${result.runner}: ${result.count} files, exit ${result.status}${result.error ? `\n${result.error}` : ''}`
    );
  return {
    passed: results.every((result) => result.status === 0),
    results,
    archived: inventory.archived
  };
}
