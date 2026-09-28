const Transaction = require('../../../lib/saito/transaction').default;

// Confirmed tweets newer than this are treated as live inserts. They must not
// advance tweets_local_synced_ts, or a single new post would imply the entire
// historical local archive is a reliable feed source.
const LIVE_TWEET_WINDOW_MS = 5 * 60 * 1000;

function isLocalPeer(peer_obj) {
  return peer_obj?.peer === 'localhost';
}

function remotePeers(mod) {
  return (mod.peers || []).filter((peer_obj) => !isLocalPeer(peer_obj));
}

function localPeer(mod) {
  return (mod.peers || []).find((peer_obj) => isLocalPeer(peer_obj)) || null;
}

function createPeerState(peer, publicKey) {
  return {
    peer,
    publicKey: publicKey || '',
    tweets_earliest_ts: Date.now(),
    tweets_latest_ts: 0,
    tweets_limit: 10,
    tweets_hydrated: false
  };
}

function hasUsableTimelineContent(mod) {
  return (mod.tweets_timeline || []).length > 0;
}

function newestKnownTweetTs(mod) {
  return (mod.tweets_timeline || []).reduce((latest, signature) => {
    const tweet = mod.getTweet?.(signature);
    return Math.max(latest, Number(tweet?.created_at) || 0);
  }, 0);
}

//
// tweets_local_synced_ts is the newest created_at through which locally archived
// content can reasonably be relied on as a feed source. It is not a viewed
// cursor, not updated_at, and not "the newest tweet the user just posted."
//
// Only blockchain-confirmed tweets that are already older than LIVE_TWEET_WINDOW_MS
// move the frontier forward. Historical sync therefore advances it as old blocks
// land; a live tweet at "now" does not claim that every earlier hole is filled.
//
function noteLocalSyncedTweet(mod, created_at, blk) {
  if (!blk) {
    return false;
  }

  const ts = Number(created_at) || 0;

  if (ts <= 0) {
    return false;
  }

  if (Date.now() - ts < LIVE_TWEET_WINDOW_MS) {
    return false;
  }

  const current = Number(mod.tweets_local_synced_ts) || 0;

  if (ts <= current) {
    return false;
  }

  mod.tweets_local_synced_ts = ts;
  mod.saveOptions?.();
  return true;
}

//
// Decide which peers to query. Manager does not call this; loadTransactions does.
//
// newer + unhydrated remotes → remote tip (created_earlier_than now).
// newer + hydrated remotes   → poll (updated_later_than).
// newer + no remotes         → localhost tip/poll as fallback.
// older                      → remotes still walking backward; localhost joins
//                              only once demand has reached the local frontier.
//
function isExactLookup(mode) {
  return mode === 'local' || mode === 'remote' || mode === 'all';
}

function selectTweetSources(mod, mode, options = {}) {
  const remotes = remotePeers(mod);
  const local = localPeer(mod);
  const frontier = Number(mod.tweets_local_synced_ts) || 0;
  const demand_ts = Number(options.demand_ts) || 0;

  // Exact signature lookup is a different operation from chronological
  // newer/older paging. It never consults the local frontier or peer cursors.
  if (isExactLookup(mode)) {
    const peers = [];

    if (mode !== 'remote' && local) {
      peers.push(local);
    }

    if (mode !== 'local') {
      for (const peer_obj of remotes) {
        peers.push(peer_obj);
      }
    }

    return { mode, peers, demand_ts, frontier, lookup: true };
  }

  if (mode === 'older') {
    const peers = [];

    for (const peer_obj of remotes) {
      if (peer_obj.tweets_earliest_ts > 0) {
        peers.push(peer_obj);
      }
    }

    // Demand is the oldest currently rendered root. Once that timestamp is at
    // or below the durable local frontier, localhost is an additional source —
    // not a replacement for remote. An unknown frontier (0) still includes
    // local on older fetches so scrolling can use the archive, without ever
    // making init local-first.
    const demandReachedLocal = demand_ts > 0 && (frontier <= 0 || demand_ts <= frontier);

    if (local && local.tweets_earliest_ts > 0 && (demandReachedLocal || peers.length === 0)) {
      peers.push(local);
    }

    return { mode: 'older', peers, demand_ts, frontier };
  }

  const unhydratedRemotes = remotes.filter((peer_obj) => !peer_obj.tweets_hydrated);
  const hydratedRemotes = remotes.filter((peer_obj) => peer_obj.tweets_hydrated);

  if (remotes.length === 0) {
    if (!local) {
      return { mode: 'tip', peers: [], demand_ts, frontier };
    }

    return {
      mode: local.tweets_hydrated ? 'poll' : 'tip',
      peers: [local],
      demand_ts,
      frontier
    };
  }

  // Prefer remotes for the initial feed. Localhost is excluded until it is
  // already hydrated (poll) or until a remote tip produced nothing (fallback).
  const peers = unhydratedRemotes.concat(hydratedRemotes);

  if (local && local.tweets_hydrated) {
    peers.push(local);
  }

  return {
    mode: unhydratedRemotes.length && !hydratedRemotes.length ? 'tip' : 'poll',
    peers,
    demand_ts,
    frontier
  };
}

function queryTypeForPeer(peer_obj, mode) {
  if (isExactLookup(mode)) {
    return 'lookup';
  }

  if (mode === 'older') {
    return 'older';
  }

  if (!peer_obj.tweets_hydrated) {
    return 'tip';
  }

  return 'poll';
}

function emptyResult(type, direction) {
  return {
    type,
    direction,
    added: [],
    new_tweets: [],
    updated: [],
    ignored: [],
    exhausted: true
  };
}

function processTweetTxs(
  mod,
  peer_obj,
  txs,
  { updateEarliest, updatePeerCursors, notify, newest_known_tweet_ts, includeNew }
) {
  const added = [];
  const new_tweets = [];
  const updated = [];
  const ignored = [];

  for (let i = 0; i < (txs || []).length; i++) {
    const tx = txs[i];

    if (!tx) {
      continue;
    }

    const working =
      typeof tx.toJson === 'function' ? new Transaction(undefined, tx.toJson()) : tx;

    if (!working) {
      continue;
    }

    if (working !== tx) {
      working.optional = tx.optional && typeof tx.optional === 'object' ? { ...tx.optional } : {};
    }

    if (typeof working.decryptMessage === 'function') {
      working.decryptMessage(mod.app);
    }

    const signature = working.signature != null ? String(working.signature) : '';

    if (!signature) {
      continue;
    }

    const created_at = Number(working.timestamp) || Number(tx.timestamp) || Date.now();
    const updated_at = Number(working.optional?.updated_at) || created_at;
    const hadTweet = mod.hasTweet(signature);
    const tweet = mod.addTweet(working);

    if (!tweet) {
      if (!ignored.includes(signature)) {
        ignored.push(signature);
      }
    } else if (!hadTweet) {
      if (!added.includes(signature)) {
        added.push(signature);
      }

      if (notify && mod.app?.BROWSER) {
        mod.addNotification?.(working);
      }

      if (includeNew && created_at > newest_known_tweet_ts && !new_tweets.includes(signature)) {
        new_tweets.push(signature);
      }
    } else if (!updated.includes(signature)) {
      updated.push(signature);
    }

    if (updatePeerCursors && updateEarliest && created_at < peer_obj.tweets_earliest_ts) {
      peer_obj.tweets_earliest_ts = created_at;
    }

    if (updatePeerCursors && updated_at > peer_obj.tweets_latest_ts) {
      peer_obj.tweets_latest_ts = updated_at;
    }
  }

  return { added, new_tweets, updated, ignored };
}

function queryPeer(mod, peer_obj, queryType, options, onComplete) {
  if (queryType === 'lookup') {
    const obj = {
      sig: String(options.sig),
      field1: 'RedSquare',
      flagged_ne: 1,
      limit: 1
    };
    const archivePeer = isLocalPeer(peer_obj) ? 'localhost' : peer_obj.peer;

    mod.app.storage.loadTransactions(
      obj,
      (txs) => {
        onComplete(txs || []);
      },
      archivePeer
    );
    return;
  }

  if (queryType === 'older' && !isLocalPeer(peer_obj) && peer_obj.peer?.publicKey) {
    mod.app.network.sendRequestAsTransaction(
      'load tweets',
      { created_earlier_than: peer_obj.tweets_earliest_ts, field4: '' },
      (txs) => {
        const deserialized = [];

        for (let t = 0; t < (txs || []).length; t++) {
          const tx = new Transaction();
          tx.deserialize_from_web(mod.app, txs[t]);
          deserialized.push(tx);
        }

        onComplete(deserialized);
      },
      peer_obj.peer.publicKey
    );
    return;
  }

  const obj = {
    field1: 'RedSquare',
    flagged_ne: 1,
    field4: '',
    limit: peer_obj.tweets_limit || 10
  };

  if (queryType === 'older' || queryType === 'tip') {
    obj.created_earlier_than =
      queryType === 'tip' ? Date.now() : peer_obj.tweets_earliest_ts;
  } else {
    obj.updated_later_than = peer_obj.tweets_latest_ts;
  }

  const archivePeer = isLocalPeer(peer_obj) ? 'localhost' : peer_obj.peer;

  mod.app.storage.loadTransactions(
    obj,
    (txs) => {
      onComplete(txs || []);
    },
    archivePeer
  );
}

function loadTweetTransactions(mod, mode, callback, options = {}) {
  if (typeof callback !== 'function') {
    return;
  }

  const type = 'tweets';
  const lookup = isExactLookup(mode);
  const signature = options.sig != null ? String(options.sig) : '';
  const busyKey = lookup ? `tweets:${mode}:${signature}` : `tweets:${mode}`;

  if (lookup && !signature) {
    callback(emptyResult(type, mode));
    return;
  }

  if (!mod._load_busy) {
    mod._load_busy = {};
  }

  if (mod._load_busy[busyKey]) {
    mod._load_busy[busyKey].push(callback);
    return;
  }

  mod._load_busy[busyKey] = [callback];

  const added = [];
  const new_tweets = [];
  const updated = [];
  const ignored = [];
  const newest_known_tweet_ts = newestKnownTweetTs(mod);
  const notify = !lookup;

  const finish = (exhausted) => {
    const result = {
      type,
      direction: mode,
      added: added.slice(),
      new_tweets: new_tweets.slice(),
      updated: updated.slice(),
      ignored: ignored.slice(),
      exhausted: Boolean(exhausted)
    };
    const callbacks = mod._load_busy[busyKey] || [];

    mod._load_busy[busyKey] = null;

    for (const cb of callbacks) {
      cb(result);
    }
  };

  const mergeBuckets = (buckets) => {
    for (const sig of buckets.added) {
      if (!added.includes(sig)) {
        added.push(sig);
      }
    }

    for (const sig of buckets.new_tweets) {
      if (!new_tweets.includes(sig)) {
        new_tweets.push(sig);
      }
    }

    for (const sig of buckets.updated) {
      if (!updated.includes(sig)) {
        updated.push(sig);
      }
    }

    for (const sig of buckets.ignored) {
      if (!ignored.includes(sig)) {
        ignored.push(sig);
      }
    }
  };

  const runPeers = (selectionMode, peers, done) => {
    if (!peers.length) {
      done(true);
      return;
    }

    let remaining = peers.length;
    let emptyCount = 0;
    let stoppedForLookup = false;

    const onPeerComplete = (peer_obj, queryType, txs) => {
      if (stoppedForLookup) {
        return;
      }

      const rows = txs || [];
      const empty = rows.length === 0;
      const updateEarliest = queryType === 'older' || queryType === 'tip';
      const updatePeerCursors = queryType !== 'lookup';

      if (empty && queryType === 'older') {
        peer_obj.tweets_earliest_ts = 0;
      }

      if (empty && queryType === 'tip') {
        peer_obj.tweets_earliest_ts = 0;
      }

      const buckets = processTweetTxs(mod, peer_obj, rows, {
        updateEarliest,
        updatePeerCursors,
        notify,
        newest_known_tweet_ts,
        includeNew: queryType !== 'older' && queryType !== 'lookup'
      });

      mergeBuckets(buckets);

      if (updatePeerCursors) {
        peer_obj.tweets_hydrated = true;
      }

      if (lookup && (mod.hasTweet(signature) || buckets.added.length || buckets.updated.length)) {
        stoppedForLookup = true;
        done(false);
        return;
      }

      if (empty) {
        emptyCount++;
      }

      remaining--;

      if (remaining <= 0) {
        done(emptyCount === peers.length && added.length === 0);
      }
    };

    for (const peer_obj of peers) {
      const queryType = queryTypeForPeer(peer_obj, selectionMode);

      if (queryType === 'older' && !(peer_obj.tweets_earliest_ts > 0)) {
        remaining--;
        emptyCount++;
        if (remaining <= 0) {
          done(emptyCount === peers.length && added.length === 0);
        }
        continue;
      }

      queryPeer(mod, peer_obj, queryType, options, (txs) => {
        onPeerComplete(peer_obj, queryType, txs);
      });
    }
  };

  if (lookup && mod.hasTweet(signature)) {
    finish(false);
    return;
  }

  const selection = selectTweetSources(mod, mode, options);

  runPeers(selection.mode, selection.peers, (exhausted) => {
    // Remote tip produced no timeline roots: localhost is a fallback, never the
    // default just because the archive happens to be populated.
    if (
      !lookup &&
      mode === 'newer' &&
      !hasUsableTimelineContent(mod) &&
      remotePeers(mod).length > 0
    ) {
      const local = localPeer(mod);

      if (local && !selection.peers.includes(local)) {
        runPeers('tip', [local], (localExhausted) => {
          finish(exhausted && localExhausted);
        });
        return;
      }
    }

    finish(exhausted);
  });
}

module.exports = {
  LIVE_TWEET_WINDOW_MS,
  isLocalPeer,
  remotePeers,
  localPeer,
  createPeerState,
  hasUsableTimelineContent,
  noteLocalSyncedTweet,
  isExactLookup,
  selectTweetSources,
  queryTypeForPeer,
  emptyResult,
  loadTweetTransactions
};
