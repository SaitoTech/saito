# Current-branch preflight

From the Node application directory, run:

```sh
npm run preflight
```

Or run `node /path/to/node/scripts/preflight.mjs` from any directory.
Use Node.js 18 or later with the application's dependencies installed (including
dev dependencies). The command uses installed tools; it does not install packages.

The script reports the current branch and commit, checks the working tree including
local edits and untracked files, and rejects detached HEAD. It accepts any named
branch and checks that the branch and commit remain unchanged during the run.
Avoid editing files while it runs. To validate a committed release, run from a
clean checkout with the intended deployment dependencies and module configuration.

Checks run sequentially and failures are collected in a final summary:

- Git whitespace in staged and unstaged changes relative to HEAD.
- TypeScript using `config/build/tsconfig.json`, with `--noEmit`.
- Production browser compilation using `npm run compile` and the local
  `config/modules.config.js` (the existing build supplies the template if absent).
- Every Jest `*.spec.js` / `*.spec.ts` and Node `*.test.js` / `*.test.cjs` /
  `*.test.mjs` suite recursively under `tests/` and `scripts/tests/`.
  Comment-only Jest specs are reported as archived. Unsupported suite extensions,
  an empty inventory, or a mismatch with Jest discovery fail the check.
  Discovery uses tracked and non-ignored untracked files, excluding installed
  tooling and other ignored artifacts. `tests/config/env/` is local environment
  state and excluded.
- Prettier on supported tracked and non-ignored untracked files in this application,
  respecting `.prettierignore` and `.prettierrc`.
- ESLint on JavaScript and TypeScript files from the same inventory, respecting
  `.eslintignore` and `.eslintrc.js`. Errors and warnings fail.

Exit status is **0 only when every check passes**, otherwise **1**. Existing
formatting debt or failing tests will fail the command; nothing is automatically
fixed or suppressed. Test skips remain visible in runner output.

The build writes normal generated CSS and browser artifacts under module web
directories, `dist/`, and `web/saito/`. Tests may also create their normal fixtures.
The command does not reset node data, switch branches, stage, commit, merge, push,
or deploy. It checks the Node application; Rust workspace tests and the manual
multi-node `nettest` harness and manual browser smoke scripts are separate.
It does not certify a merge with prod,
remote freshness, reproducible dependency installation, or absence of untracked
runtime dependencies.
