# Conquest AI — Complete Input and Knowledge Evidence Package

**Branch:** `origin/2610/game-runner`  
**Scope:** Conquest only  
**Nature:** Read-only investigation artifacts  
**Capture type:** **Illustrative reproduction** (not a live runner capture)

## How this payload was produced

Built with:

1. `Engine.createGame({ players: 2, setup: 'quick', seed: 42, externalCards: true })`
2. Observation and choice construction matching `node/apps/runner/lib/games/conquest.js` `ConquestRunner.current()`
3. Prompt construction matching `node/apps/runner/lib/providers/codex.js` `CodexProvider.choose()`

Situation: seat 1, phase `reinforce`, turn 1, 4 reinforcements, 28 legal `place` choices.

## Files

| File | Contents |
| --- | --- |
| `01-complete-stdin-prompt.txt` | **Exact stdin** written to Codex (`instruction + JSON`). 11600 bytes. |
| `02-observation.json` | Pretty-printed full observation (all 42 territories, 6 continents). |
| `03-choices.json` | Pretty-printed full choices array (28 entries). |
| `04-output-schema.json` | Exact JSON Schema written to `--output-schema`. |
| `05-decision-metadata.json` | Decision id hash, sizes, invocation template. |
| `06-codex-invocation-and-context.md` | CLI args, cwd, config sources, what Codex may auto-load. |
| `07-conquest-rules-inventory.md` | Where rules live; whether Codex receives them. |
| `08-knowledge-boundary.md` | Prompt vs pretraining vs inaccessible. |

## Sizes (UTF-8)

| Item | Bytes |
| --- | --- |
| Complete stdin prompt | 11600 |
| Observation JSON (compact, inside stdin) | 9225 |
| Choices JSON (compact, inside stdin) | 2057 |
| Instruction text alone | 291 |
| Output schema (compact) | 253 |
| Approx tokens (chars÷4) | ~2900 |

Accurate tokenizer count was **not** available in this environment (`tiktoken` not installed). Do not treat chars÷4 as authoritative for billing.

## Important caveat about “effective model”

Model/reasoning settings below were read from **this investigation machine’s** `~/.codex/config.toml` and Codex CLI 0.160.0. Richard’s runner VPS may differ. Establishing his runtime requires inspecting that host’s `config.toml` / `codex doctor` / runner `decisionProvider.model`.
