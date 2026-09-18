#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { committedFiles, git, readPolicy, run, slash, walk } from './promotion/common.mjs';
import { checkReferences } from './promotion/references.mjs';
import { runTests } from './promotion/tests.mjs';

const help = `Usage: node scripts/promote-staging-to-prod.mjs [options]

Default: fetch origin, validate a staging-to-prod candidate, leave prod unchanged.
  --promote          Advance local prod to the validated candidate
  --push             Also push prod; requires --promote and fetching
  --source NAME      Source branch (default: staging)
  --target NAME      Destination branch (default: prod)
  --remote NAME      Remote (default: origin)
  --no-fetch         Use local branch tips without fetching; incompatible with --push
  --help             Show this help

Requires committed changes, committed tests and an up-to-date local source/target.
Runs npm ci, Prettier on lib/, committed-reference checks, Jest and Node tests.
Candidate branch, worktree and report.json are retained for inspection on all outcomes.
No deployment commands are run. See scripts/promote-staging-to-prod.md.
`;

export function parseArgs(args) {
  const options = {
    source: 'staging',
    target: 'prod',
    remote: 'origin',
    fetch: true,
    promote: false,
    push: false
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--help') options.help = true;
    else if (arg === '--promote') options.promote = true;
    else if (arg === '--push') options.push = true;
    else if (arg === '--no-fetch') options.fetch = false;
    else if (['--source', '--target', '--remote'].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith('-')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = value;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.source === options.target) throw new Error('Source and target must differ');
  if (options.push && (!options.promote || !options.fetch))
    throw new Error('--push requires --promote and fetching');
  return options;
}

function assertClean(root) {
  if (git(root, ['status', '--porcelain', '--untracked-files=no'])) {
    throw new Error(
      'Commit or stash tracked/staged changes before promotion; the script never stages your working files'
    );
  }
  for (const operation of [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'rebase-merge',
    'rebase-apply'
  ]) {
    const location = git(root, ['rev-parse', '--git-path', operation]);
    if (fs.existsSync(path.resolve(root, location)))
      throw new Error(`Git operation in progress: ${operation}`);
  }
}

export function assertTargetNotCheckedOut(root, target) {
  const worktrees = run('git', ['worktree', 'list', '--porcelain', '-z'], root, {
    capture: true
  }).stdout;
  if (worktrees.split('\0').includes(`branch refs/heads/${target}`)) {
    throw new Error(
      `${target} is checked out in a worktree; switch that worktree to another branch first`
    );
  }
}

export function advanceLocal(root, options, source, target, candidate) {
  assertTargetNotCheckedOut(root, options.target);
  git(root, ['merge-base', '--is-ancestor', target, candidate]);
  // Verify the source and update the destination under the same ref transaction.
  const input = `start\nverify refs/heads/${options.source} ${source}\nupdate refs/heads/${options.target} ${candidate} ${target}\nprepare\ncommit\n`;
  const result = spawnSync('git', ['update-ref', '-m', 'validated staging promotion', '--stdin'], {
    cwd: root,
    input,
    encoding: 'utf8'
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
}

export function promote(
  options,
  project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
) {
  const root = git(project, ['rev-parse', '--show-toplevel']);
  const projectPath = path.relative(root, project);
  for (const branch of [options.source, options.target])
    git(root, ['check-ref-format', `refs/heads/${branch}`]);
  if (!/^[\w.-]+$/.test(options.remote) || options.remote.startsWith('-'))
    throw new Error('Invalid remote name');
  assertClean(root);
  if (options.promote) assertTargetNotCheckedOut(root, options.target);
  const committed = committedFiles(root);
  for (const file of walk(path.join(project, 'tests'))) {
    if (slash(path.relative(project, file)).startsWith('tests/config/env/')) continue;
    if (!committed.has(slash(path.relative(root, file))))
      throw new Error(`Commit test file before promotion: ${file}`);
  }
  for (const name of [
    'scripts/promote-staging-to-prod.mjs',
    'scripts/promotion/common.mjs',
    'scripts/promotion/references.mjs',
    'scripts/promotion/tests.mjs',
    'config/promotion.json'
  ]) {
    if (!committed.has(slash(path.join(projectPath, name))))
      throw new Error(`Commit promotion tooling first: ${name}`);
  }
  if (options.fetch) {
    run(
      'git',
      [
        'fetch',
        '--no-tags',
        options.remote,
        ...[options.source, options.target].map(
          (branch) => `+refs/heads/${branch}:refs/remotes/${options.remote}/${branch}`
        )
      ],
      root
    );
  }
  const source = git(root, ['rev-parse', '--verify', `refs/heads/${options.source}^{commit}`]);
  const target = git(root, ['rev-parse', '--verify', `refs/heads/${options.target}^{commit}`]);
  if (options.fetch) {
    for (const [branch, sha] of [
      [options.source, source],
      [options.target, target]
    ]) {
      const remoteSha = git(root, [
        'rev-parse',
        '--verify',
        `refs/remotes/${options.remote}/${branch}^{commit}`
      ]);
      if (remoteSha !== sha)
        throw new Error(
          `${branch} differs from ${options.remote}/${branch}; synchronize it before promotion`
        );
    }
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'saito-promotion-'));
  const checkout = path.join(directory, 'checkout');
  const branch = `promotion/${Date.now()}-${path.basename(directory)}`;
  const reportPath = path.join(directory, 'report.json');
  const report = { source, target, branch, checkout, options, status: 'running' };
  const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  save();
  console.log(`Candidate: ${branch}\nWorktree: ${checkout}\nReport: ${reportPath}`);
  try {
    run('git', ['worktree', 'add', '-b', branch, checkout, target], root);
    run(
      'git',
      ['-c', 'core.hooksPath=/dev/null', 'merge', '--no-ff', '--no-edit', source],
      checkout
    );
    const candidateProject = path.join(checkout, projectPath);
    run('npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], candidateProject);
    assertClean(checkout);
    const require = createRequire(path.join(candidateProject, 'package.json'));
    const prettier = require.resolve('prettier/bin/prettier.cjs');
    run(process.execPath, [prettier, '--write', 'lib'], candidateProject);
    run('git', ['add', '--update', '--', slash(path.join(projectPath, 'lib'))], checkout);
    if (git(checkout, ['diff', '--cached', '--name-only'])) {
      run(
        'git',
        [
          '-c',
          'core.hooksPath=/dev/null',
          'commit',
          '-m',
          'style: format lib before production promotion'
        ],
        checkout
      );
    }
    run(process.execPath, [prettier, '--check', 'lib'], candidateProject);
    assertClean(checkout);
    report.candidate = git(checkout, ['rev-parse', 'HEAD']);
    const policy = readPolicy(candidateProject);
    report.references = checkReferences(candidateProject, policy);
    console.log(
      `References: ${report.references.scanned} files scanned; ${report.references.errors.length} errors; ${report.references.exceptions.length} reviewed exceptions`
    );
    for (const item of report.references.errors.slice(0, 30)) {
      console.error(`${item.source}:${item.line}: ${item.message} (${item.reference})`);
    }
    save();
    try {
      report.tests = runTests(candidateProject, policy);
    } catch (error) {
      report.tests = { passed: false, error: error.message };
    }
    save();
    assertClean(checkout);
    if (git(checkout, ['rev-parse', 'HEAD']) !== report.candidate)
      throw new Error('Candidate HEAD changed during validation');
    if (report.references.errors.length || !report.tests.passed) {
      throw new Error(
        `Validation failed; see ${reportPath}${report.tests.error ? `\n${report.tests.error}` : ''}`
      );
    }
    if (
      git(root, ['rev-parse', `refs/heads/${options.source}`]) !== source ||
      git(root, ['rev-parse', `refs/heads/${options.target}`]) !== target
    ) {
      throw new Error('Source or target moved during validation; rerun against the new tips');
    }
    if (options.fetch) {
      const tips = git(root, [
        'ls-remote',
        '--heads',
        options.remote,
        `refs/heads/${options.source}`,
        `refs/heads/${options.target}`
      ]);
      const expected = new Map(
        tips
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [sha, ref] = line.split(/\s+/);
            return [ref, sha];
          })
      );
      if (
        expected.get(`refs/heads/${options.source}`) !== source ||
        expected.get(`refs/heads/${options.target}`) !== target
      ) {
        throw new Error(
          'Remote source or target moved during validation; rerun against the new tips'
        );
      }
    }
    if (options.promote) {
      assertClean(root);
      advanceLocal(root, options, source, target, report.candidate);
      report.localPromoted = true;
      save();
      if (options.push) {
        // Candidate ancestry was checked above; the lease makes a concurrent destination update fail.
        run(
          'git',
          [
            'push',
            `--force-with-lease=refs/heads/${options.target}:${target}`,
            options.remote,
            `${report.candidate}:refs/heads/${options.target}`
          ],
          root
        );
        report.pushed = true;
      }
    }
    report.status = options.promote ? 'promoted' : 'validated';
    save();
    console.log(`${report.status}: ${report.candidate}\nReport: ${reportPath}`);
    return report;
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
    save();
    if (report.localPromoted && !report.pushed)
      console.error(
        'Local target was advanced; the remote push did not complete. See report.json.'
      );
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(help);
    else promote(options);
  } catch (error) {
    console.error(`Promotion stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
