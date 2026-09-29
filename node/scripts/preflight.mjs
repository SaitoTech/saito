#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { git, run } from './promotion/common.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(project, 'package.json'));

function projectFiles(directory) {
  return [
    ...new Set(
      run(
        'git',
        ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'],
        directory,
        { capture: true }
      )
        .stdout.split('\0')
        .filter(Boolean)
    )
  ].filter(
    (file) =>
      fs.existsSync(path.join(directory, file)) && fs.statSync(path.join(directory, file)).isFile()
  );
}

export function inventoryTests(directory, files = projectFiles(directory)) {
  const ts = require('typescript');
  const inventory = { jest: [], node: [], archived: [] };
  for (const name of files) {
    if (!name.startsWith('tests/') && !name.startsWith('scripts/tests/')) continue;
    if (name.startsWith('tests/config/env/') || !/\.(spec|test)\./.test(name)) continue;
    const file = path.join(directory, name);
    if (fs.lstatSync(file).isSymbolicLink()) throw new Error(`Test suite is a symlink: ${name}`);
    if (/\.spec\.[jt]s$/.test(name)) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest
      );
      inventory[source.statements.length ? 'jest' : 'archived'].push(file);
    } else if (/\.test\.[cm]?js$/.test(name)) {
      inventory.node.push(file);
    } else {
      throw new Error(`No test runner assigned to ${name}`);
    }
  }
  if (!inventory.jest.length && !inventory.node.length) throw new Error('No runnable tests found');
  return inventory;
}

export async function runChecks(checks) {
  const results = [];
  for (const [name, check] of checks) {
    console.log(`\n=== ${name} ===`);
    try {
      await check();
      results.push({ name, passed: true });
    } catch (error) {
      console.error(error.message);
      results.push({ name, passed: false });
    }
  }
  console.log('\nPreflight summary:');
  for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${result.name}`);
  return results.every((result) => result.passed);
}

function nodeTool(module, args) {
  run(process.execPath, [require.resolve(module), ...args], project);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(`Usage: npm run preflight

Checks the current Node application checkout on any named branch:
Git whitespace, TypeScript, production browser build, Jest, Node tests,
Prettier, and ESLint. Prints all results and exits nonzero on any failure.

Install dependencies first. Checks include local edits and untracked files.
The build updates generated CSS, dist/, and web/saito/ using the local module
configuration. No formatting fixes, branch switches, commits, or deployment.
See scripts/preflight.md for scope and prerequisites.`);
    return;
  }
  if (args.length) throw new Error(`Unknown arguments: ${args.join(' ')} (use --help)`);
  process.chdir(project);
  const branch = git(project, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const head = git(project, ['rev-parse', 'HEAD']);
  console.log(`Preflight: ${branch} at ${head}\nProject: ${project}`);
  const status = git(project, ['status', '--short', '--', '.']);
  if (status)
    console.log('Local changes present: checking the working tree, including untracked files.');

  const files = projectFiles(project);
  let inventory;
  const jestArgs = ['--config', 'jest.config.cjs', '--runInBand', '--ci'];
  const passed = await runChecks([
    ['Git whitespace', () => run('git', ['diff', '--check', 'HEAD', '--', '.'], project)],
    [
      'TypeScript',
      () => nodeTool('typescript/bin/tsc', ['--project', 'config/build/tsconfig.json', '--noEmit'])
    ],
    ['Production browser build', () => run('npm', ['run', 'compile'], project)],
    [
      'Test inventory',
      () => {
        inventory = inventoryTests(project, files);
        for (const file of inventory.archived)
          console.log(`Archived (comments only): ${path.relative(project, file)}`);
        console.log(`${inventory.jest.length} Jest suites; ${inventory.node.length} Node suites`);
      }
    ],
    [
      'Jest',
      () => {
        if (!inventory) throw new Error('Test inventory failed');
        if (!inventory.jest.length) return;
        const discovered = JSON.parse(
          run(
            process.execPath,
            [require.resolve('jest/bin/jest'), ...jestArgs, '--listTests', '--json'],
            project,
            { capture: true }
          ).stdout
        );
        const expected = new Set(inventory.jest);
        const actual = new Set(discovered.map((file) => path.resolve(file)));
        const missing = [...expected].filter((file) => !actual.has(file));
        const extra = [...actual].filter((file) => !expected.has(file));
        // Still execute discovered suites so discovery problems do not hide test failures.
        nodeTool('jest/bin/jest', jestArgs);
        if (missing.length || extra.length)
          throw new Error(`Jest discovery mismatch:\n${[...missing, ...extra].join('\n')}`);
      }
    ],
    [
      'Node tests',
      () => {
        if (!inventory) throw new Error('Test inventory failed');
        if (inventory.node.length) run(process.execPath, ['--test', ...inventory.node], project);
      }
    ],
    [
      'Prettier',
      async () => {
        const prettier = require('prettier');
        const selected = [];
        for (const file of files) {
          const info = await prettier.getFileInfo(file, { ignorePath: '.prettierignore' });
          if (!info.ignored && info.inferredParser) selected.push(file);
        }
        if (!selected.length) throw new Error('No files found for Prettier');
        let failed = false;
        // Bound argv size without stopping at the first batch of formatting failures.
        for (let i = 0; i < selected.length; i += 100) {
          const result = run(
            process.execPath,
            [
              require.resolve('prettier/bin/prettier.cjs'),
              '--check',
              ...selected.slice(i, i + 100).map((file) => `./${file}`)
            ],
            project,
            { allowFailure: true }
          );
          if (result.status !== 0) failed = true;
        }
        if (failed) throw new Error('Prettier check failed; see files above');
      }
    ],
    [
      'ESLint',
      async () => {
        const { ESLint } = require('eslint');
        const eslint = new ESLint({ cwd: project, fix: false });
        const selected = [];
        for (const file of files) {
          if (/\.[cm]?[jt]sx?$/.test(file) && !(await eslint.isPathIgnored(file)))
            selected.push(file);
        }
        if (!selected.length) throw new Error('No files found for ESLint');
        const results = await eslint.lintFiles(selected);
        const formatter = await eslint.loadFormatter('stylish');
        console.log(formatter.format(results));
        if (results.some((result) => result.errorCount || result.warningCount))
          throw new Error('ESLint reported errors or warnings');
      }
    ],
    [
      'Branch and commit unchanged',
      () => {
        if (
          git(project, ['symbolic-ref', '--quiet', '--short', 'HEAD']) !== branch ||
          git(project, ['rev-parse', 'HEAD']) !== head
        )
          throw new Error('Branch or HEAD changed during preflight; rerun the checks');
      }
    ]
  ]);
  console.log(`\n${passed ? 'PASS' : 'FAIL'}: ${branch} at ${head.slice(0, 12)} (working tree)`);
  if (!passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Preflight failed: ${error.message}`);
    process.exitCode = 1;
  });
}
