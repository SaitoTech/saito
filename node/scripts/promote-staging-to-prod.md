# Promoting staging to prod

Run from `node/` using the same supported Node/npm version as the project:

```sh
# Fetch origin and validate; prod stays unchanged.
npm run promote:prod

# Validate and advance local prod.
npm run promote:prod -- --promote

# Validate, advance local prod, and push it to origin.
npm run promote:prod -- --promote --push

# Validate committed local staging/prod tips without contacting origin.
npm run promote:prod -- --no-fetch
```

`--source`, `--target`, and `--remote` override `staging`, `prod`, and `origin`.
`--push` requires `--promote` and cannot be combined with `--no-fetch`.
The script does not deploy or restart a server.

## Before running

Commit the promotion tooling, configuration, and everything under `tests/` first.
Commit or stash tracked/staged changes. Unrelated untracked files are left alone;
untracked or ignored files under `tests/` are rejected except `tests/config/env/`.
Synchronize both local branches with the remote; the script fetches but never
silently resets a branch or chooses between divergent tips. For a local-only
validation, use `--no-fetch`.
This option only disables Git network operations; `npm ci` may still download
dependencies from the registry.

Promotion refuses to update a destination branch checked out in any worktree.
Keep the main checkout on `staging` or another branch. Configure a Git author
identity for candidate merge and formatting commits.

## Validation and promotion

1. Record source/destination commit IDs. Create a `promotion/...` branch and a
   separate temporary worktree based on the destination; merge the source there.
   Conflicts stop the run and retain the worktree for inspection.
2. Run `npm ci --include=dev` in the candidate's `node/` directory. Dependencies
   come from the committed lockfile; no local configuration or untracked source
   is copied from the developer checkout. npm lifecycle scripts run normally.
3. Run the installed Prettier on `lib/`, honoring `.prettierrc` and
   `.prettierignore` (including the existing QR code library exclusion). Commit
   formatting changes on the candidate branch and run Prettier's check mode.
   Candidate merge/format commits bypass Git hooks; the explicit checks below
   validate the result.
4. Audit references against the candidate's **committed tree**, including
   symlink targets. Staging a dependency or having it on disk is insufficient.
5. Inventory every test file recursively in `tests/`. Run Jest for `*.spec.js`
   and `*.spec.ts`, and Node's runner for `*.test.js`, `*.test.cjs`, and
   `*.test.mjs`. Compare Jest's discovery with the inventory so configuration
   cannot silently omit a suite. Unsupported test extensions, uncommitted test
   files, and an empty inventory fail validation. Helpers are not test suites.
   Both runners execute even if the first runner's tests fail.
6. Require all checks to pass and the candidate commit/content to stay unchanged.
   Recheck branch tips. With `--promote`, update local prod using a Git reference
   transaction that checks both original local branch tips. With `--push`, push
   that exact descendant commit using a lease on the original remote prod tip.
   A concurrent remote destination update is rejected. Remote staging is also
   rechecked immediately before promotion; it is not locked during the push.

Existing test skips remain visible in runner output. Five legacy specs contain
only comments and are listed in `config/promotion.json` as archives. They are
reported rather than executed; adding executable code to an archived file makes
validation fail until it is removed from that list and Jest's ignore list.

## Reference checker scope and exceptions

The checker scans committed JS/TS/JSX, CSS, and HTML files within `node/`,
including tests. It uses TypeScript's parser and module resolution rather than
searching source code for import strings. It checks:

- Literal imports/exports, `require()`, `require.resolve()`, and `import()`.
- Literal file reads/streams/`sendFile()`, including resolvable `__dirname`,
  `__filename`, `process.cwd()`, string concatenation, template expressions, and
  `path.join()`/`path.resolve()` calls.
- `new URL('file', import.meta.url)` references.
- Static HTML `src`, `href`, and `poster` attributes and CSS URLs/imports,
  including strings in JS templates. Root URLs map to `web/` or a module's
  `mods/<module>/web/` directory. Relative JS template assets use that module's
  web directory, or the application's `web/` directory. Literal HTML/CSS file
  references resolve relative to their file. Navigation links without a known
  asset extension are treated as routes.
- External package declarations and resolvability. Installed dependencies are
  supplied by the lockfile and do not need their contents committed.

This is a conservative static check, not a proof of every possible runtime file
access. It does not interpret shell/Rust code, arbitrary custom loader wrappers,
aliased filesystem APIs, or all template languages. Computed paths at recognized
file/module calls are blockers until reviewed. Generated assets, runtime data,
deliberate test fixtures, build fragments, and route aliases may also need an
exception. A clean checkout and the test suites supplement the static check.

The initial exception list is empty deliberately. Existing code may produce
findings; fix missing files or review the relevant runtime/build contract rather
than copying every finding into the exception list. No promotion can pass while
findings remain. Add an exception only for an understood non-repository input or
an intentional static-analysis limitation:

```json
{
  "source": "lib/example.js",
  "kind": "dynamic",
  "reference": "fs.readFileSync(runtimeFile)",
  "reason": "Runtime data created by the documented initialization step"
}
```

Each rule matches the exact project-relative source, kind, and reference from
the report; there are no wildcard exceptions. A reason is required. Unused
exceptions fail validation, so stale rules cannot accumulate. Exceptions are
read from the candidate commit, not an uncommitted developer configuration.

## Reports and cleanup

The script prints the candidate branch, worktree path, and `report.json` location.
Reports include original tips, the tested candidate, all reference findings and
reviewed exceptions, runner results, and promotion/push status. Runner output is
streamed to the terminal; capture it in your CI log when needed.

Worktrees and branches remain on both success and failure. Inspect the printed
paths, then remove them when finished:

```sh
git worktree remove --force /tmp/saito-promotion-XXXXXX/checkout
git branch -D promotion/PRINTED-CANDIDATE-BRANCH
```

Use the actual printed names. `--force` discards that disposable worktree's
installed dependencies and any unresolved merge state. The adjacent report is
retained until you remove its temporary directory.

If local promotion succeeds but pushing fails, local prod remains advanced and
the report records it. The script never automatically rewinds an updated branch.
Inspect the report and remote state before retrying or pushing the candidate.

## Script regression tests

```sh
npm run test:promotion
```

Tests use disposable Git repositories and a local bare remote, the installed
Prettier/Jest/Node runners, and a stub dependency installer to avoid network
access. They cover validation, formatting, promotion, pushing, missing files,
test failures, merge conflicts, dirty inputs, test discovery, and branch races.
They do not promote or push this repository.
