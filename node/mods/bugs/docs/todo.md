# RedSquare extension points required by Bugs

This handoff lives under `docs/` because Saito's lite-client bundler excludes
module documentation directories from its dynamic module context.

This file is intentionally the only handoff for changes outside `mods/bugs`. Bugs must not import RedSquare implementation files. Add the following capabilities to RedSquare, then return this task so the integration can be exercised end to end.

## 1. Public RedSquare capability — completed

RedSquare now returns `lib/redsquare-api.js` from `respondTo("redsquare-api", context)`.
The adapter exposes these methods by delegating to RedSquare's existing composer,
tweet transactions, cache/archive lookup, Tweet renderer, manager controls and routing.

```js
{
  // Open the normal RedSquare root composer with initial text/image support.
  // Resolve only after normal signing and propagation, returning the created Transaction.
  composeRoot({ text = "", images = true, prompt = "" }),

  // Open/use the normal RedSquare reply composer. Set parent_id to parent_tx_sig
  // and thread_id to root_tx_sig. Preserve normal mentions and notifications.
  // If publishImmediately is true, publish text through the same normal path.
  // Resolve with the created Transaction, or null on cancel.
  composeReply({ root_tx_sig, parent_tx_sig, text = "", prompt = "", publishImmediately = false }),

  // Resolve archive/cache data, validate source is root or descendant of root,
  // and return { root_tx_sig, source_tx_sig, reporter_publickey, transaction }.
  resolveTweet({ root_tx_sig, source_tx_sig }),

  // Return the root signature using RedSquare's existing thread graph/cache.
  resolveReplyRoot(transaction),

  // Render the existing sanitized Tweet/thread UI into container. Return a
  // disposable component or cleanup callback if the renderer requires one.
  renderThread(container, { root_tx_sig, source_tx_sig, reply: true }),

  // Navigate/open using RedSquare's existing routing and selected-tweet rules.
  openThread({ root_tx_sig, source_tx_sig })
}
```

The create and reply methods must have one completion contract: return the published transaction. Do not both invoke a supplied callback and return the same transaction, because that can cause duplicate metadata submission by consumers.

## 2. Tweet context-menu hook — completed

RedSquare now collects this responder where it assembles a tweet's context menu:

```js
app.modules.getRespondTos('redsquare-tweet-menu', {
  tweet,
  transaction: tweet.tx,
  root_tx_sig: tweet.thread_id || tweet.tx.signature,
  source_tx_sig: tweet.tx.signature,
  reporter_publickey: tweet.tx.from[0].publicKey
});
```

Each returned action is appended using its `text`, `icon`, and `callback`. The callback receives the same context. RedSquare does not special-case Bugs or inspect `app.options.bugs`; Bugs already returns no action until `/bugs` has enabled it.

Acceptance checks:

1. Before visiting `/bugs`, no Capture as Bug item is shown.
2. After visiting `/bugs`, root tweets and replies show Capture as Bug.
3. A reply context supplies its own signature as `source_tx_sig` and the thread root as `root_tx_sig`.
4. Selecting the item opens the standard Bugs overlay without changing the tweet.

## 3. Module selection/build configuration

If this checkout uses an explicit module allow-list rather than directory discovery, add `Bugs` to that normal build/runtime configuration. This repository change is deliberately not made here because the requested scope permits edits only inside `mods/bugs`.

## 4. Optional workflow notification adapter

Ordinary bug replies already use RedSquare's normal reply transaction and notification path through `composeReply`. RedSquare currently exposes no `respondTo` capability for a foreign module to add a workflow notification without importing its internals. If metadata notifications are desired, add an optional `notifyWorkflow(transaction, { type, root_tx_sig, recipients })` method to `redsquare-api`. It must consume the accepted signed Bugs transaction, deduplicate by its signature, and feed the existing notification list. Bugs must not create a second notification store or notification screen.
