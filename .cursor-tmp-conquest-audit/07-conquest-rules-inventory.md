# Conquest rules inventory — implementation vs availability to Codex

## Authoritative implementation (code)

| Rule area | Primary location | Key functions / notes |
| --- | --- | --- |
| Map, adjacency, continents, bonuses | `node/mods/conquest/lib/map.js` | 42 territories; continent `bonus`; neighbor graph |
| Reinforcements | `node/mods/conquest/lib/engine.js` `reinforcementFor` | `max(3, floor(owned/3)) + continent bonuses` |
| Territory ownership / armies | `engine.js` state `territories[id] = { owner, armies }` | Updated by claim/place/attack/occupy/fortify |
| Setup / claiming | `engine.js` `createGame`, `applyAction` `claim`/`place` (setup) | Initial armies by player count; quick vs classic |
| Attack legality | `engine.js` `canAttack` | Adjacent enemy/neutral; ≥2 armies |
| Combat / dice | `engine.js` `battle` | Attacker 1–3 dice; defender ≤2; ties to defender |
| Blitz / steamroll | `engine.js` `applyAction` `attack` | Optional repeats; auto max occupation |
| Occupation | `engine.js` `occupy` | Leave ≥1; move between min/max |
| Fortification | `engine.js` `canFortify`, `applyAction` `fortify` | **One** adjacent friendly move, then turn ends |
| Cards / symbols | `engine.js` `cards`, `isValidSet`, `validTrades`, `tradeValue` | Territory + 2 wilds; sets escalate 4,6,8,10,12,15,+5 |
| Mandatory trade | `engine.js` `beginTurn` / trade path | ≥5 cards; elimination ≥6 forces trade-down |
| Elimination | `engine.js` battle capture path | Loser’s territories empty → eliminated; cards transfer |
| Victory | `engine.js` after occupy / last opponent | `winner` set; README: 2p needs human opponent defeated (neutral optional) |
| Network / privacy / encrypted deck | `node/mods/conquest/conquest.js` | Signatures, commit/reveal entropy, SAFEDEAL |

## Human-readable descriptions (repo)

| Document | What it contains | Available to Codex in a runner decision? |
| --- | --- | --- |
| `node/mods/conquest/README.md` | Full rules research summary, edition notes, automation choices, Hasbro PDF links | **No** — not in prompt; not in temp cwd |
| `node/mods/conquest/DESIGN.md` | Visual / UX design, not complete rules | **No** |
| Hasbro Risk PDFs (external links in README) | Classic tabletop rulebooks | **No** — runner disables tools; no URL fetch in prompt |
| `apps/runner/README.md` | Runner behavior, not Conquest strategy rules | **No** for decision prompt |
| Repo `AGENTS.md` files | Saito agent coding guidance | **No** for decision cwd (see `06-…`) |

## Does Codex receive these rules explicitly?

| Channel | Result |
| --- | --- |
| Included in runner prompt? | **No** rules text. Only “Choose the best legal action to win” + observation + choices. |
| Initialization instruction? | **No** separate rules init. Each call is ephemeral. |
| Loaded from a file by runner? | **No**. |
| Can access repository? | **Not intended.** Empty temp cwd; shell tool disabled; read-only sandbox; prompt forbids file/tools. |
| Can use tools to inspect code? | **Blocked by runner flags/prompt** (cannot prove absolute plugin isolation without live trace). |
| Internet / Hasbro PDF? | **Not supplied**; no browse instruction; tools discouraged. |

### What *is* in the observation that encodes rule-adjacent facts

- Continent **bonus numbers** and membership lists (`continents`)
- Full adjacency (`map.neighbors`)
- Current armies/owners (`territories`)
- `reinforcements` already computed for this turn
- Legal actions already filtered (`choices`) — so legality need not be re-derived for the current micro-decision
- Card **ids** in `hand` when present — **not** symbol/effect text; empty in this reinforce example

### Cards specifically

Card effects in Conquest are **Risk-style set trading**, not unique per-card text effects.

- Implementation: `engine.js` cards keyed by territory id + `wild_1`/`wild_2`, with `symbol` ∈ {infantry, cavalry, artillery, wild}.
- Observation `hand` is an array of **ids** (from encrypted deck via `viewState`), not `{id, symbol, name}`.
- Trade actions appear as choices `{ type:'trade', cards:[id,id,id] }` when legal — model need not invent a set, but still benefits from knowing set value / escalation if choosing whether to trade.

**Fact:** No card-effect prose is sent.  
**Inference:** Symbol matching and trade-value schedule must come from pretraining (Risk knowledge) or be inferred poorly from ids alone.
