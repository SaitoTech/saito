# Codex invocation and additional context sources

## Exact invocation (from `CodexProvider.generate`)

Source: `node/apps/runner/lib/providers/codex.js` lines 30–62.

```text
spawn(<decisionProvider.executable || 'codex'>, [
  'exec',
  '--ephemeral',
  '--sandbox', 'read-only',
  '--skip-git-repo-check',
  '-c', 'approval_policy="never"',
  '-c', 'features.shell_tool=false',
  '--output-schema', '<tmpdir>/schema.json',
  '--output-last-message', '<tmpdir>/answer.json',
  // optional: '--model', <decisionProvider.model>
  '-'
], {
  cwd: '<os.tmpdir()>/saito-decision-<random>/',
  shell: false,
  stdio: ['pipe', 'pipe', 'pipe']
})
```

Then: write schema file → `stdin.end(<full prompt from 01-complete-stdin-prompt.txt>)`.

### Working directory

**Empty temp directory** created with `fs.mkdtemp(os.tmpdir() + '/saito-decision-')`.

Contents at spawn time:

- `schema.json` (output schema)
- (later) `answer.json` written by Codex

**Not** the Saito repository root. Simulated empty temp cwd contains **no** `AGENTS.md`.

## What the Game Runner explicitly supplies

1. Stdin prompt (instruction + `{ observation, choices }` JSON) — file `01-complete-stdin-prompt.txt`
2. Output schema file — file `04-output-schema.json`
3. CLI flags above (ephemeral, read-only sandbox, no shell tool, skip git check, never-approve)
4. Optional `--model` **only if** `decisionProvider.model` is set in runner config  
   Example configs omit `model` (`apps/runner/config/config.example.json`).

## What Codex may load automatically (investigated on this host)

### User config — YES, unless `--ignore-user-config` (runner does **not** pass that)

- Path: `~/.codex/config.toml` (exists; 2858 bytes on this host)
- Auth: `~/.codex/auth.json` (exists; credentials **not** printed)
- On this investigation host, config includes:
  - `model = "gpt-5.3-codex"`
  - project trust entries (including `/Users/trevelyan/Programming/saito`)
  - multiple plugins enabled (browser, computer-use, code-review, documents, etc.)
  - MCP `node_repl` server configuration
- **No** `model_reasoning_effort`, `model_verbosity`, or `model_instructions_file` keys were present in this host’s `config.toml`.

### Project `AGENTS.md` — effectively NO for runner decisions

Repo contains:

- `/Users/trevelyan/Programming/saito/AGENTS.md`
- `/Users/trevelyan/Programming/saito/node/AGENTS.md`
- `/Users/trevelyan/Programming/saito/README/AGENTS.md`
- `/Users/trevelyan/Programming/saito/.agents/AGENTS.md`

Because `cwd` is an empty OS temp directory outside the git repo, those files are **not** in the project root Codex is pointed at. Runner also uses `--skip-git-repo-check`.

**Inference:** project AGENTS.md content is not part of the decision context. Confirmed: no AGENTS.md in temp cwd or its parent temp path.

### Exec policy rules

- `~/.codex/rules/default.rules` exists (69 bytes on this host; a prefix_rule for an unrelated python app). Runner does **not** pass `--ignore-rules`, so user/project rules *could* load; with empty non-repo cwd, project rules are unlikely; user rules may still apply to tool policy.

### Environment variables

On this host during investigation: **no** `OPENAI_*` / `CODEX_*` / `CHATGPT_*` env vars were set in the shell. Auth appears file-based via `~/.codex/auth.json`.

### Built-in / system developer instructions

Codex CLI injects its own agent runtime instructions. Their **exact text is not in the Saito repository** and was **not** dumped by this investigation (would require a traced live `codex exec`).

**Fact:** Runner cannot disable those via any flag it currently passes, except indirectly via Codex’s own config (`model_instructions_file` can replace built-ins per Codex docs — **not set** here).

### Tools / internet / repo file access during a decision

Runner sets:

- `features.shell_tool=false`
- `--sandbox read-only`
- Prompt text: “Do not call tools, read files, or execute commands.”

**Fact:** Model is instructed and configured not to use shell.  
**Inference:** It should not read Saito source or Conquest README during the call.  
**Cannot fully prove** without a live trace that no plugin MCP tool still injects side context (this host has many plugins enabled in user config).

### Session memory

`--ephemeral` → no persisted session files for the decision. Prior game turns are **not** retained as Codex conversation history by the runner.

## CLI version on this host

```text
codex-cli 0.160.0
path: /Users/trevelyan/.nvm/versions/node/v20.19.6/bin/codex
```

## Diagnostics that would establish Richard’s runtime

On the machine that runs the bot:

```sh
codex --version
codex doctor
# Redact secrets before sharing:
grep -E '^(model|model_reasoning|model_verbosity|model_instructions)' ~/.codex/config.toml
# Confirm runner config:
jq .decisionProvider /path/to/config/conquest.json   # or daemon.json
```
