# Knowledge boundary for one Conquest decision

## 1. Explicitly supplied by the Game Runner (this prompt)

- Short instruction: play to win; use only observation; no tools; untrusted state; return `choiceId`
- Full public board: all 42 territories’ owners and armies
- Static map adjacency and continent membership + bonuses (+ UI color/label/SVG outline)
- Seat, phase, turn, reinforcements, mustTrade, occupation
- Players’ public card counts and eliminated flags
- Own hand ids (empty in this example)
- Enumerated legal actions with string ids
- JSON Schema constraining the answer to one of those ids

## 2. Automatically loaded by Codex (this host; may differ on Richard’s VPS)

- User `~/.codex/config.toml` → default `model = "gpt-5.3-codex"` when runner omits `--model`
- Auth material in `~/.codex/auth.json` (**existence only; not inspected/printed**)
- Codex built-in agent/system instructions (**text not captured**)
- Possibly user exec rules / enabled plugins (uncertain impact under shell_tool=false)

**Not** loaded from Saito project AGENTS.md for these calls (cwd is empty temp dir).

## 3. Likely available only via pretraining (not in prompt)

- That Conquest ≈ classic Risk world-conquest
- Reinforcement formula intuition (though `reinforcements` is already computed)
- Attack/dice/tie-to-defender conventions
- Fortify-once-per-turn convention
- Card set matching and escalating trade values
- Strategic heuristics (continent greed, choke points, stack building)
- Meaning of owner `0` as neutral in 2-player games (README documents this; prompt does not explain it)

## 4. Cannot access (by design / configuration)

- Opponent hand card identities
- Deck order / encryption keys / RNG seed
- Battle commitment secrets
- Game log / previous moves as a history channel
- `node/mods/conquest/README.md` and Hasbro PDFs
- Engine source during the call (intended)
- Prior Codex conversation from earlier turns (`--ephemeral`)
- Wallet / private keys / Saito credentials

## Assessment: would an authoritative rules document help?

**Yes, potentially for quality and for reducing wasted reasoning**, especially for:

- Explicit victory condition (2p: defeat human; neutral optional)
- Meaning of `owner: 0`
- Card set rules and trade-value schedule
- Fortify = single adjacent transfer ending the turn
- That offered `choices` are already the full legal menu (so the model should rank, not invent)

It would **not** replace board evaluation. Continent bonuses are already numeric in the observation. Legal moves are already enumerated. The largest missing *declarative* knowledge is rules/semantics, not raw board geometry.

This is an assessment of information gaps, not an implementation proposal.
