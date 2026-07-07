# Link Sharing And Short URLs: Design

## Problem

Share links generated across the application have two problems:

1. **Length.** Most modules serialize a JSON payload to base64 and embed it in a
   query parameter (`/videocall/?stun_video_chat=eyJjYWxsX2lkIjo...`), producing
   URLs of several hundred characters. Even reference-style links carry 128-char
   hex signatures or 44-char public keys. Long URLs are hostile to chat messages,
   QR codes (dense, hard to scan), and social previews.
2. **No native share sheet.** `browser.handleShare()` wraps the Web Share API
   with a clipboard fallback, but only three call sites use it (Stack ×2,
   RedSquare ×1). Everything else calls `navigator.clipboard.writeText()`
   directly, so users never get the standard mobile share flow.

## Current State Inventory

Shared infrastructure:

- `node/lib/saito/browser.ts` — `handleShare()` (line ~2997): Web Share API +
  clipboard fallback, currently gated behind `isMobileBrowser()`.
- `node/lib/saito/browser.ts` — `createEventInviteLink()` (line ~498): builds
  `?event=<base64 keychain key>` links; parsed generically in
  `node/lib/templates/modtemplate.js` (line ~279).
- `node/lib/saito/ui/modals/saito-link/saito-link.js` — the shared
  `InvitationLink` overlay (copy / chat / redsquare / QR). Concatenates its
  `data` object into query params; link length is determined by the caller.
  Does not call `handleShare` — its copy button is clipboard-only.

Link creators and the params their receiving side parses:

| Module | Creates | Parses | Payload style |
|---|---|---|---|
| Videocall | `videocall.js` `generateCallLink()` | `stun_video_chat` | base64 JSON `{call_id, host_public_key, call_peers}` |
| Chat | `chat.js` `generateChatGroupLink()`; `chat-manager-menu.js` (DMs) | `chat_id` | base64 JSON `{id, name, sender, admin}`, or raw pubkey |
| Limbo | `limbo.js` `copyInviteLink()` via InvitationLink | `dream` | base64 pubkey |
| Fileshare | `fileshare.js` via InvitationLink | `file` | base64 JSON `{publicKey, id, name, size, type}` |
| Arcade | `arcade.js` `showShareLink()` via InvitationLink | `game_id`, `game`, `invite`, `crypto` | tx signature + slug |
| RedSquare | `lib/tweet.js` (uses `handleShare`) | `tweet_id`, `user_id` | tx signature / pubkey |
| Blog | `lib/utils/index.js` `copyPostLinkToClipboard()` | `public_key`, `tx_id` | pubkey + tx signature |
| Stack | `lib/ui/view-post.js`, `lib/ui/overlay/explore.js` (uses `handleShare`) | path params | clean paths `/{slug}/{pubkey}/{sig}` with express routes |
| League | `lib/menu.js`, `lib/overlays/league.js` via InvitationLink | `league_id` | id string |
| AssetStore | `lib/main/main.js`, `lib/overlays/delist-nft.js` via InvitationLink | `seller`, `listing` | pubkey |
| Profile | `node/lib/saito/ui/saito-profile/saito-profile.js` | `load_key` | **base64 JSON containing a private key** |
| Events (Videocall/Limbo scheduling) | `browser.ts` `createEventInviteLink()` | `event` | base64 keychain key object |

## Taxonomy

Two axes determine the right mechanism for each link:

- **Locality** — does the link reference publicly retrievable truth (a tweet in
  the archive, a game invite tx), or does it carry browser-side/private payload
  (a private key export)?
- **Permanence** — should the link work indefinitely (tweets, posts), or does it
  reference something inherently transitory (a call room, a file offer, an open
  game seat)?

|  | Public truth | Browser-side / private |
|---|---|---|
| **Permanent** | Resolve from Archive / Registry. RedSquare tweets, Stack posts, Blog posts, profiles, sellers, leagues. | Stay self-contained, payload in `#fragment`. Profile key export, wallet backup. |
| **Transitory** | Shortlink service with TTL. Videocall rooms, Limbo dreams, Arcade invites, Fileshare offers. | Capability links (payload is the permission). Chat group invites — see below. |

Design consequence: **three mechanisms, not one**. A single server-side
shortener would manufacture link rot for permanent content (rows must never be
GC'd, and only the minting node can resolve them) while being a perfect fit for
transitory content (expiry aligns with content lifetime).

## URL Grammar

| Kind | Shape | Example |
|---|---|---|
| Permanent content | `/{slug}/t/{sig-prefix}` | `saito.io/redsquare/t/000b1784ccaac90e` |
| Transitory invite | `/l/{slug}/{id}` | `saito.io/l/videocall/Ab3xK9q2` |
| Person | `/{slug}/@{identifier}` | `saito.io/redsquare/@daniel` |
| Private payload | `/{slug}/#{params}` | `saito.io/profile#load_key=...` |

Every link is self-identifying: the slug names the app, `l/` marks a temporary
invite, `t/` marks archived content. This matters when OpenGraph previews are
slow or absent — the raw URL string alone tells the recipient what they are
opening.

An optional decorative tail is permitted on shortlinks and ignored by the
resolver (`/l/arcade/Ab3xK9q2/chess-vs-daniel`). The id is authoritative; the
tail is human context. Modules populate it from public-ish names (game type),
never message content; default off for Fileshare (filenames may be sensitive).

## Mechanism 1: Archive Permalinks (permanent + public)

The content is already addressable by tx signature; the URL is long only
because the encoding is verbose. Shorten the address, not the link.

### Signature-prefix resolution

- Signatures are uniformly 128-char lowercase hex (verified against live
  `archive.sq3`: 8,399 rows, all length 128).
- `archives.sig` is indexed (`sig_idx`, `node/mods/archive/sql/archives2.sql`).
- Prefix length is **16 hex chars** (64 bits): zero collisions between
  distinct transactions in live data, and collisions require billions of rows.
  The resolver handles ambiguity anyway (see below), so 16 is conservative by
  design.

Implementation:

- Add a `sig_prefix` key to the archive load path. The query builder in
  `archive.js` `loadTransactionsWithCallback` (equality loop at line ~732) gets
  one special case. Use a **range predicate**, not `LIKE`:
  `sig >= $prefix AND sig < $prefix_incremented` — SQLite `LIKE` is
  case-insensitive by default and will not use `sig_idx`; the range form always
  does.
- The same tx legitimately appears in multiple rows (per-owner copies; live
  data: 8,320 distinct sigs across 8,399 rows). The resolver groups by sig and
  serves the first row. If a prefix ever matches two *distinct* sigs, return
  the not-found page (honest failure; callers can lengthen the prefix).
- Each module adds a `/{slug}/t/:prefix` route in its existing `webServer()`.
  RedSquare already has the hard part — exact-sig lookup with per-tweet
  OpenGraph rendering (`redsquare.js` line ~2828); the permalink route reuses
  it with prefix lookup substituted.

### Registry-name resolution for person links

The registry module (`node/mods/registry/`) already maps identifiers to
pubkeys on-chain. Person-shaped routes (`user_id`, `seller`, Stack authors)
additionally accept `@identifier` and resolve through the registry, giving
short human-readable URLs whose permanence rides on on-chain records.

### Retention: findings and policy

The archive **prunes** (`archive.js` `pruneArchive()`, line ~1132). Verified
policy and live-data behavior:

| Content | Effective lifetime | Mechanism |
|---|---|---|
| Stack posts | Permanent | saved `preserve=1` (`stack.js` ~1006); prune respects the flag |
| Profile records, NFTs | Permanent | `preserve=1` (NFTs: `archive.js` ~322) |
| RedSquare tweets | **~347 days, hard cap** | see below |
| Public txs (games, calls) | ~7 days | `preserve=0`, `prune_public_ts` |
| Owned/private txs | ~5 days | `prune_private_ts` |

The RedSquare cap is `archive.js` line ~1197:
`DELETE ... WHERE (tx_size = 0 or field1 = 'RedSquare') and updated_at < now - 50 * prune_public_ts`
— it **ignores `preserve`**. Live data confirms the cliff: tweet `updated_at`
ages run to 348 days and stop, despite 5,374 of 5,379 tweet rows carrying
`preserve=1`.

**Decision:** the ~1-year cap stays as-is — it is deliberate policy, not a
bug. Two consequences for this design:

1. *Sharing is curation.* Generating a tweet permalink calls
   `saveTweet(tweet, true)` — the same signal RedSquare already uses for
   like/retweet/reply (`redsquare.js` ~2659). This sets `preserve=1` (keeping
   the tweet past the 7-day public prune) and bumps `updated_at` through the
   archive update path, so each re-share naturally resets the 1-year clock.
   No changes to `pruneArchive()`.
2. *Graceful misses are a first-class requirement, not a fallback.* Permalinks
   to pruned tweets are expected (year-old links, spam/offensive content that
   was flagged and removed, content minted on other nodes). The `/t/:prefix`
   route on a miss serves the module page with a "tweet not found in archive"
   notice instead of a 404 — same page also covers moderated content.

## Mechanism 2: TTL Shortlink Service (transitory + public)

New module `node/mods/shortlink/`, following the registry pattern (peer
service + module-owned sqlite DB + express route).

### Schema (`sql/links.sql`)

```sql
CREATE TABLE IF NOT EXISTS links (
  id          TEXT PRIMARY KEY,      -- 8-char base62, crypto-random
  module      TEXT,                  -- creating module slug, verified
  path        TEXT,                  -- target path, e.g. "/videocall/"
  params      TEXT,                  -- raw query string (the long payload)
  creator     TEXT,                  -- creator publickey
  created_at  INTEGER,
  expires_at  INTEGER,               -- 0 = never (capability links only)
  max_uses    INTEGER DEFAULT 0,     -- 0 = unlimited; 1 = burn after resolve
  uses        INTEGER DEFAULT 0
);
```

Storing `path` + `params` (not a full URL) means the resolver only ever
redirects within its own origin — the service cannot be abused as an open
redirector.

### Creation (over the existing websocket)

- `returnServices()` advertises `shortlink` when `app.BROWSER == 0`.
- `handlePeerTransaction` handles
  `{ request: 'shortlink create', data: { path, params, ttl, max_uses } }`
  and calls back `{ err, id, url }`.
- Validation before insert:
  1. `path` must resolve to an installed module slug
     (`app.modules.returnModuleBySlug`).
  2. `params` capped (~4 KB).
  3. Reject payloads containing `load_key`, `privateKey`, or `seed` —
     private-key material is never persisted server-side.
  4. Rate limit per creator key (e.g. 30/hour).
- Id: 8 chars base62 from `crypto.randomBytes` (~47 bits, unguessable to the
  same degree the long URL was), retry on collision.

### Resolution

```
GET /l/:slug/:id[/:label]
```

- Look up by id. **Verify `row.module === req.params.slug`** — the
  human-readable slug is a verified claim, so a link displaying as
  `saito.io/l/videocall/...` can never resolve into a different app
  (anti-phishing property).
- Unknown id or slug mismatch → 302 to `/{slug}/` if the slug is a valid
  module, else `/`.
- Expired or `max_uses` exhausted → 302 to `/{slug}/?expired_invite={id}` so
  the module can show a contextual message ("this call has ended") via the
  existing `returnURLParameter` machinery.
- Live row → bump `uses` (delete if burned), 302 to `path + '?' + params`.
  The receiving module's existing parsing code runs unchanged — the shortener
  is a pure wrapper.
- Cleanup: purge expired rows opportunistically (on create + coarse interval).

### Client helper

One method in `browser.ts` next to `createEventInviteLink`:

```ts
async shortenLink(longUrl, { module, ttl = 0, max_uses = 0, label = '' } = {})
  // -> short URL string, or null
```

Finds the first peer advertising `shortlink`, sends the create request with a
~1.5 s timeout. `null` means "use the long URL" — the shortener is strictly
best-effort; the app must work identically without it.

### TTL defaults

| Module | TTL | Notes |
|---|---|---|
| Videocall | 24 h | room lifetime |
| Limbo | 24 h / event end | |
| Arcade | until game fills; fallback 7 d | matches archive prune of invite txs |
| Fileshare | session-length | consider `max_uses: 1` |
| Events | event end time | |
| Chat groups | 0 (never) | capability link — see below |

### Capability links (chat groups, leagues)

Chat group invites are neither public truth nor transitory: possessing the
payload *is* the permission to join, and groups are long-lived. Use
non-expiring shortlink rows (`expires_at = 0`) and expose **revocation**: a
group admin can invalidate a leaked invite link by deleting the row — something
the current self-contained base64 link can never do. This is the one quadrant
where server-side state adds a capability rather than just brevity.

### Trade-offs

- A short link is only resolvable by the node that minted it. This is bounded,
  not new, centralization: long links are already origin-relative, and their
  payloads already transit that server in the GET request. What is new is
  persistence — hence TTLs, `max_uses`, and the private-key blocklist.
- QR codes shrink from dense base64 blobs to trivially scannable short URLs —
  arguably the largest UX win.
- Social previews: phase 2 can add optional `title`/`image` columns and an
  OG-tag interstitial instead of a bare 302. Not needed at launch; module
  HomePages already carry generic social meta.

## Mechanism 3: Private Fragment Links

Profile key export (`saito-profile.js` ~213) and anything wallet-shaped are
user-to-self transfers, not shares. They stay long and self-contained, but move
the payload from `?load_key=` to `#load_key=` so it never appears in the HTTP
request line or server logs. Reader side: `profile.js` ~156 switches from
`returnURLParameter` to parsing `location.hash` (helper:
`returnHashParameter`). These params are hard-blocklisted in the shortener.

## Web Share API Adoption

Orthogonal to all of the above and can ship first:

1. `browser.ts` `handleShare()`: replace the `isMobileBrowser()` gate with
   feature detection (`navigator.canShare?.(data)`). Desktop Chrome/Edge and
   Safari support the API.
2. `InvitationLink`: add a dedicated "Share {name} Link" option (shown when
   `navigator.share` exists) that calls `app.browser.handleShare({ title, url })`;
   the Copy option keeps its literal copy semantics. The no-overlay path
   (`render(false)`) routes through `handleShare`.
3. Direct `writeText` callers (Videocall `copyInviteLink`, Chat
   `generateChatGroupLink`, Blog `copyPostLinkToClipboard`, event links) route
   through `handleShare`.

Gesture-context caveat: clipboard/share must be invoked inside the click
handler. `InvitationLink` fires `shortenLink()` in the background at render
time and swaps the displayed link/QR when it resolves; the copy/share button
uses whatever URL is currently held (short if the background call landed, long
otherwise). Never `await` the network inside the gesture.

## Phasing

1. **Web Share fixes** — `handleShare` feature-detect + `InvitationLink` and
   direct callers routed through it. Small, no server work, benefits every
   module immediately.
2. **Profile fragment fix** — small, security-motivated (private keys out of
   query strings and server logs).
3. **Shortlink module** — schema, peer service, `/l/:slug/:id` resolver,
   `shortenLink()` helper, `InvitationLink` integration. Covers Videocall,
   Limbo, Fileshare, Arcade, League, AssetStore with near-zero per-module
   changes.
4. **Archive permalinks** — `sig_prefix` range query in archive, `/{slug}/t/`
   routes for RedSquare and Blog (Stack already has clean paths) including the
   "not found in archive" miss page, registry `@identifier` routes, and
   share-as-curation in RedSquare (`saveTweet(tweet, true)` on permalink
   generation).
5. **Chat capability links** — non-expiring rows + admin revocation UX.
6. **Later**: OG interstitial for shortlinks, analytics, `title`/`image`
   columns.

## Resolved Decisions

- RedSquare retention: the ~1-year prune clause stays unchanged. Sharing acts
  like the like/retweet/reply curation logic (`saveTweet(tweet, true)`), which
  sets `preserve=1` and bumps `updated_at` (sliding the 1-year window on each
  re-share). Links outliving their content is accepted; the graceful
  "tweet not found in archive" page is required regardless (spam/offensive
  removals, multi-year-old links, other-node content).
- Prefix length: 16 hex chars — conservative choice, confirmed.

## Open Questions

- Chat revocation UX: where does "invalidate invite link" live in the group
  admin UI, and does regenerating mint a new id automatically?
- Person-permalink share UI beyond AssetStore: no "share profile" button
  exists anywhere in the product today (users copy the address bar), so
  emitting `/redsquare/@name` links needs a new UI surface -- a product
  decision, not a mechanical change.

## Implementation Status (2026-07-07)

Phases 1-4 are implemented; phase 5 (chat capability-link revocation) is not.
Decisions made during implementation that refine the design above:

- **Share-as-curation is two-sided.** Sharing is browser-local (no on-chain
  tx), so the server can't observe it through consensus. The share handler
  calls `saveTweet(tweet, true)` (browser copy, same as like/retweet/reply),
  and the `/t/` permalink route calls `storage.updateTransaction()` on
  every successful resolve -- setting `preserve=1` and refreshing `updated_at`
  server-side. Retention is demand-driven: content people actually open stays
  archived.
- **`InvitationLink` shortening is opt-out.** Default ttl 7 days; Fileshare
  and Limbo override to 24h; League and AssetStore set `shorten = false`
  because their links are long-lived references (they belong to mechanism 1
  once person/store permalinks exist).
- **Burned single-use rows are kept for a 7-day grace period** so revisits
  land on the "expired" page instead of a generic miss; `purgeExpired()`
  removes them afterwards.
- **Peer discovery**: `network.returnPeersWithService()` is an unimplemented
  stub, so the shortlink module tracks its own service peers via
  `onPeerServiceUp` (registry pattern) and `browser.shortenLink()` delegates
  to the module.
- **Miss-page convention**: permalink misses redirect to
  `/{slug}/?content_missing=1`; expired shortlinks redirect to
  `/{slug}/?expired_invite={id}`. A default `expired_invite` handler lives in
  `modtemplate.js` `render()`; RedSquare and Blog handle `content_missing`
  in their own `render()`.
- **Registry person routes**: implemented for RedSquare
  (`/redsquare/@name` -> `?user_id=`) and AssetStore
  (`/store/@name` -> `?seller=`); other modules can copy the pattern.
  AssetStore's "share my store" InvitationLink emits the `@name` form when
  the seller has a registered identifier.
- **Videocall rooms cache a background-shortened link**
  (`refreshShortCallLink()` fires at room creation / keychain save, outside
  any gesture); the in-call share button uses the cached short form when
  available. Scheduled-event links (`?event=`) remain long: they are shared
  one-shot from inside gestures where we cannot await the mint.
- **Chat group links remain long until phase 5** (they should become
  revocable non-expiring capability rows, not TTL rows).
  `generateChatGroupLink(group, share)` gained the `share` flag because the
  group-creation confirmation calls it outside a user gesture, where the
  share sheet would be blocked -- non-gesture callers keep the old silent
  copy behavior.
- The archive `sig_prefix` query was verified against live data: SQLite uses
  `sig_idx` (`SEARCH archives USING INDEX sig_idx`), and the
  `[prefix, prefix+'g')` bound was property-tested over 40k random cases.
