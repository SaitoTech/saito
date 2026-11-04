# Advanced Programming Techniques for Twilight Struggle NFT Cards

This guide is for people who already know the basics of writing card code (`api`, `context`, `addToQueue`, `endTurn`) and want to build richer cards: choices, multiple code boxes, remembering earlier events, and using the shared game queue.

It sits alongside:

1. **How to Program a Card** — basic ideas
2. **Programming API** — what methods you can call
3. **This page** — multi-code cards, state, events, and the queue

Anything marked **works today** has been checked against the current code. Anything marked **not available yet** is something the engine partly supports, or that authors may want, but NFT card scripts cannot do yet.

---

## 1. When you need these techniques

Use this guide when a card needs more than “place some influence and finish”:

- The player must pick an option before the effect is decided.
- One card should leave a lasting mark that a later card can check.
- One NFT should contain several pieces of code, and one piece should be able to call another later.
- The effect depends on who is playing, who controls a country, or whether an ongoing event (such as Reformer) is active.

The sandbox rules stay the same:

- Only the player who is resolving the card runs the JavaScript.
- Your script gets `api` and `context` only.
- Game changes go through `api.addToQueue(...)`, then `await api.endTurn()`.
- Return `0` when you are waiting on the player / submitting a turn.

---

## 2. Cards can contain multiple pieces of code

### 2.1 What a multi-code card is

In the Card Generator, one card can have more than one **code box**.

- The **first** code box is what runs when the card is played normally as an event.
- Extra code boxes are additional pieces of code on the same NFT. They do not run automatically. Something must ask the game to run them later.

Think of them as separate scripts attached to one physical card.

**Example**

| Field | Value |
|---|---|
| Title | War Games 2 |
| Card number (editor field) | 105 |
| First code box | Default event when the card is played |
| Second code box | Extra code you can call later |

### 2.2 How those code boxes are stored

Checked in `tscardgen/lib/code-events.js` and `twilight/lib/nft/resolve-code.js`:

- **One** non-empty code box → stored as a plain JavaScript string.
- **Two or more** non-empty code boxes → stored as an array of `{ name, code }` objects.

For “War Games 2” with two boxes, the stored names look like:

- First box: `war_games_2`
- Second box: `war_games_2_2`

Those names come from slugifying the title (spaces become `_`). The Card Generator also keeps array positions `0` and `1`. The game can find a box by **name** or by **number**.

When the card is played normally, Twilight runs the **first usable** piece of code. It does not run every box.

### 2.3 Card identity: what is *not* the NFT id

Authors sometimes expect an id like `war-games-2-105` (title slug + card number).

**That is not how the live system identifies NFTs today.**

| Thing | What it actually is |
|---|---|
| Title slug in the editor | `war_games_2` (underscores). Shown as help text only. |
| Card number (`card_id`) | An editor / printed-card field. It is **not** written into the mint snapshot and is **not** part of `NFT_EVENT`. |
| NFT id | The real identifier of the minted NFT (from the mint transaction). Arcade puts that value in `game.options.nfts[].id`. Twilight deals and resolves the card under that same id. |
| Test card in Twilight | Hard-coded example id `nft-test-title-105` — useful for tests, not a general naming rule. |

So: slug and card number help humans talk about a card. The instruction that runs extra code uses the **NFT id**, not `war-games-2-105`.

### 2.4 The `NFT_EVENT` instruction (exact format)

Checked in `GameTemplate` queue handling (`gametemplate-queue.js`):

```text
NFT_EVENT\t{player}\t{nft_id}\t{code_box}\t{optional_extra_args...}
```

| Part | Meaning |
|---|---|
| `{player}` | Seat number that must run the script: `1` = USSR, `2` = US |
| `{nft_id}` | The NFT’s real id in the game (`game.options.nfts[].id`) |
| `{code_box}` | Which piece of code to run: a **name** such as `war_games_2_2`, or a **zero-based index** such as `1` |
| Extra args | Optional. Stored on `nft.args` for that NFT. The first of these args is also the code-box chooser when code is an array. |

The Card Generator help dialog (`buildNftEventInstruction`) shows the same shape, with placeholders:

```text
NFT_EVENT\tPLAYER\tNFT_ID\twar_games_2_2
```

You replace `PLAYER` with `1` or `2`, and `NFT_ID` with the card’s actual NFT id in the game.

Slug and card number appear in that help UI as labels. They are **not** fields in the instruction the engine reads.

### 2.5 How one code box calls another

You do **not** call the second box like a normal JavaScript function. Opponents would never see that.

Instead, the first box asks the shared game queue to run the second box later by enqueueing `NFT_EVENT`.

**Intended example** (War Games 2, second code box named `war_games_2_2`):

```javascript
const player = context.game.player; // 1 = USSR, 2 = US
const nftId = "PASTE_REAL_NFT_ID_HERE";

api.addToQueue("NFT_EVENT\t" + player + "\t" + nftId + "\twar_games_2_2");
api.addToQueue("resolve\t" + nftId);
await api.endTurn();
return 0;
```

What should happen:

1. The player plays the card; the first code box runs on their machine.
2. That script queues `NFT_EVENT` for the same NFT’s second code box, then finishes the turn.
3. The game processes the shared queue. Every client sees the same `NFT_EVENT`.
4. The named player runs the second code box.
5. That second script should finish cleanly (usually with `resolve` / `RESOLVE` and `endTurn`).

### 2.6 Important limitation: NFT scripts cannot enqueue `NFT_EVENT` today

**Not available yet for NFT authors.**

`api.addToQueue` only allows:

- `NOTIFY` / `notify`
- `RESOLVE`
- `ACKNOWLEDGE`
- Twilight `place`
- Twilight `resolve`

`NFT_EVENT` is handled by the GameEngine when it appears on the queue, but NFT card scripts are blocked from adding it. So the multi-code *storage* and *engine handler* exist; the missing piece for card authors is permission to enqueue `NFT_EVENT` from sandbox code.

**What works today instead:** put the player’s choice and the resulting **allowed** moves in a **single** code box (see §5).

---

## 3. Remembering things with variables and flags

### 3.1 Reading game state from a script

Your script can read a snapshot through `context.game`, and can check ongoing Twilight events with:

```javascript
api.isEventActive("reformer")
```

That returns `1` when `game.state.events.reformer == 1`, otherwise `0`.

Changing `context.game` in your script does nothing. It is a copy.

### 3.2 Writing variables / flags

Native Twilight cards sometimes use engine `SETVAR` or Twilight `setvar` to change shared state.

**NFT scripts cannot enqueue `SETVAR` or `setvar` today.** They are rejected by the queue policy.

There is also **no** `api.addEvent` or `api.removeEvent`.

So:

- **Reading** whether an event is active → works today (`api.isEventActive`).
- **Setting** a custom flag from NFT code → not available yet.
- Values that *do* get into `game.state` last for the rest of **that game**, not across separate games.

### 3.3 Practical pattern once writes are allowed

Card A would turn a flag on; Card B would read it:

```javascript
// Card B — works today for the READ
if (api.isEventActive("global_initiative")) {
  api.addToQueue("place\tus\tus\tegypt\t2");
} else {
  api.addToQueue("NOTIFY\tGlobal Initiative is not active");
}
api.addToQueue("resolve\t" + "card-b-nft-id");
await api.endTurn();
return 0;
```

Until NFT scripts can write flags, Card A has to be a native card, a test harness, or a future API change.

---

## 4. Event flags in plain language

Twilight keeps “this effect is still in play” markers on `game.state.events`. Built-in examples include `nato`, `marshall`, and `reformer`.

For custom cards:

1. Pick a clear flag name that will not collide with built-ins.
2. Use `api.isEventActive("your_flag")` to check it.
3. Do not invent `api.addEvent` / `api.removeEvent` — they are not in the API.

Custom flags are **not** automatically named from title slug + card number. If you want `global_initiative`, you choose that string and use it consistently.

---

## 5. Choices and conditions (what works today)

### 5.1 Tools you can use

- `await api.playerSelectOption([...])` — menu choice
- `await api.playerSelectCountry([...])` — country choice
- `api.isControlled("us", "canada")`
- `api.whoControls("egypt")`
- `api.isEventActive("reformer")`
- `api.addToQueue(...)` / `await api.endTurn()`

Avoid `api.isPlayer(...)` for now. In the current code it disagrees with Twilight seating (`1` = USSR, `2` = US). Prefer:

```javascript
const isUs = context.game.player === 2;
const isUssr = context.game.player === 1;
```

### 5.2 Choose first, then queue moves

If the decision only needs the current board and a HUD click, do it in one code box:

```javascript
const isUs = context.game.player === 2;

if (!isUs) {
  api.addToQueue("NOTIFY\tThis branch is for the US only");
  api.addToQueue("resolve\tyour-nft-id");
  await api.endTurn();
  return 0;
}

const country = await api.playerSelectCountry(["egypt", "libya", "israel"]);

if (api.whoControls(country) === "ussr") {
  api.addToQueue("NOTIFY\tCannot place into USSR-controlled " + country);
} else if (api.isEventActive("reformer") == 1) {
  api.addToQueue("place\tus\tus\t" + country + "\t1");
} else {
  api.addToQueue("place\tus\tus\t" + country + "\t2");
}

api.addToQueue("resolve\tyour-nft-id");
await api.endTurn();
return 0;
```

### 5.3 When you need a second code box

If the next step depends on something that happens **after** the shared queue has processed an earlier instruction (opponent reply, dice, later board change), you need a second run through the queue — typically another `NFT_EVENT`.

That staging pattern is described in §2. It is **not available yet** from NFT `addToQueue`.

---

## 6. How the GameEngine queue fits in

### 6.1 The simple picture

Your script does not edit the live queue directly. It builds a short list of instructions with `addToQueue`, then submits them with `endTurn`. The game applies those instructions for every player in the same order.

The queue is a **stack**: the game usually works from the **last** instruction first. Match the working test card: enqueue effects, then `resolve`, then `endTurn`.

```javascript
api.addToQueue("place\tus\tus\tegypt\t2");
api.addToQueue("resolve\tnft-test-title-105");
await api.endTurn();
return 0;
```

### 6.2 Why `place` feels special

For `place`, the acting player’s influence is applied immediately on their machine, then the same instruction is sent so opponents update once without doubling. The format is:

```text
place\t{origin}\t{faction}\t{country}\t{amount}
```

The policy rewrites `{origin}` to the acting faction for you.

### 6.3 Commands outside the NFT allow-list

Many Twilight instructions (`vp`, `defcon`, `coup`, `SETVAR`, `NFT_EVENT`, …) exist for the native game. NFT scripts may only use what `context.commands` lists at runtime. If `addToQueue` throws “not permitted”, that command is blocked for sandbox cards even if the engine knows it.

---

## 7. Short examples

### Example A — One code box with a choice (works today)

```javascript
const choice = await api.playerSelectOption([
  { id: "egypt", label: "Egypt" },
  { id: "canada", label: "Canada" }
]);

api.addToQueue("place\tus\tus\t" + choice + "\t2");
api.addToQueue("resolve\tyour-nft-id");
await api.endTurn();
return 0;
```

### Example B — Check an ongoing event (works today)

```javascript
if (api.isEventActive("reformer")) {
  api.addToQueue("NOTIFY\tReformer is active");
} else {
  api.addToQueue("place\tus\tus\tegypt\t2");
}
api.addToQueue("resolve\tyour-nft-id");
await api.endTurn();
return 0;
```

### Example C — Call a second code box (not available yet from NFT scripts)

```javascript
// Intended shape once NFT_EVENT is permitted:
api.addToQueue("NFT_EVENT\t" + context.game.player + "\t" + "REAL_NFT_ID" + "\twar_games_2_2");
api.addToQueue("resolve\t" + "REAL_NFT_ID");
await api.endTurn();
return 0;
```

### Example D — Several allowed instructions (works today)

```javascript
api.addToQueue("NOTIFY\tOptional card begins");
api.addToQueue("place\tus\tus\tcanada\t1");
api.addToQueue("place\tus\tus\tegypt\t1");
api.addToQueue("resolve\tyour-nft-id");
await api.endTurn();
return 0;
```

---

## 8. Common mistakes

1. Treating `war-games-2-105` as the NFT id — the real id comes from the minted NFT.
2. Putting slug or card number into `NFT_EVENT` — the engine wants player, NFT id, and code-box name/index.
3. Calling a second code box as a JavaScript function — opponents will not follow along; use the queue.
4. Enqueueing `NFT_EVENT`, `SETVAR`, `vp`, or `defcon` from NFT scripts — blocked today.
5. Forgetting `resolve\tyour-nft-id` after a normal card play.
6. Expecting flags to survive into a brand-new game.
7. Relying on `api.isPlayer` — seating check is unreliable in the current API.
8. Expecting a second code box to exist as an array entry when only one box has code — a single box is stored as a plain string, so numeric indexes do not apply.

---

## 9. Quick status

| Idea | Status |
|---|---|
| Multiple code boxes on one NFT | Works |
| First box runs on normal card play | Works |
| Engine can run a later box via `NFT_EVENT` | Works in the engine |
| NFT script can enqueue `NFT_EVENT` | Not available yet |
| `api.isEventActive` | Works |
| `api.addEvent` / `api.removeEvent` | Do not exist |
| NFT script can enqueue `SETVAR` / `setvar` | Not available yet |
| `place`, `resolve`, `NOTIFY`, `RESOLVE`, `ACKNOWLEDGE` | Works for NFT scripts |
| Cross-game saved variables | Not supported |

---

## Related reading

- How to Program a Card
- Programming API (Card Generator sidebar)
- Source files for this guide: `tscardgen/lib/code-events.js`, `twilight/lib/nft/resolve-code.js`, `twilight/lib/core/api.js`, `twilight/lib/core/queue-policy.js`, `gametemplate-src/gametemplate-queue.js` (`NFT_EVENT`), `gametemplate-src/gametemplate-nft-queue.js`
