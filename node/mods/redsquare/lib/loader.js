const Transaction = require('../../../lib/saito/transaction').default;

// Confirmed tweets newer than this are treated as live inserts. They must not
// advance tweets_local_synced_ts, or a single new post would imply the entire
// historical local archive is a reliable feed source.
const LIVE_TWEET_WINDOW_MS = 5 * 60 * 1000;
const PEER_REQUEST_TIMEOUT_MS = 12000;
const MAX_POLL_PAGES = 5;
const MAX_ARCHIVE_PAGE_SIZE = 100;

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
    tweets_exhausted: false,
    tweets_has_rows: false,
    tweets_history_version: 0,
    tweets_latest_ts: 0,
    tweets_limit: 10,
    tweets_hydrated: false
  };
}

// History may have gained rows above the old cursor. Revisit the recent end;
// signature deduplication keeps already cached tweets from being added twice.
function reopenTweetSource(peer_obj) {
  peer_obj.tweets_exhausted = false;
  peer_obj.tweets_earliest_ts = Date.now();
  peer_obj.tweets_history_version = (peer_obj.tweets_history_version || 0) + 1;
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
      if (!peer_obj.tweets_exhausted) {
        peers.push(peer_obj);
      }
    }

    // Demand is the oldest currently rendered root. Once that timestamp is at
    // or below the durable local frontier, localhost is an additional source —
    // not a replacement for remote. An unknown frontier (0) still includes
    // local on older fetches so scrolling can use the archive, without ever
    // making init local-first.
    const demandReachedLocal = demand_ts > 0 && (frontier <= 0 || demand_ts <= frontier);

    if (local && !local.tweets_exhausted && (demandReachedLocal || peers.length === 0)) {
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
    failed: false,
    history_reopened: false,
    exhausted: true
  };
}

function processTweetTxs(
  mod,
  peer_obj,
  txs,
  { updateEarliest, updatePeerCursors, updateLatest = updatePeerCursors, notify, newest_known_tweet_ts, includeNew }
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

    if (updateLatest && updated_at > peer_obj.tweets_latest_ts) {
      peer_obj.tweets_latest_ts = updated_at;
    }
  }

  return { added, new_tweets, updated, ignored };
}

function queryPeer(mod, peer_obj, queryType, options) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (txs, failed = false) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ txs, failed });
    };
    const timer = setTimeout(() => finish([], true), PEER_REQUEST_TIMEOUT_MS);
    const customRequest =
      queryType === 'older' && !isLocalPeer(peer_obj) && peer_obj.peer?.publicKey;
    const receive = (rows) => {
      // A timed-out request must not deserialize or ingest a late response.
      if (settled) {
        return;
      }
      try {
        if (!Array.isArray(rows)) {
          throw new Error('Invalid tweet response');
        }
        const txs = customRequest
          ? rows.map((row) => {
              const tx = new Transaction();
              tx.deserialize_from_web(mod.app, row);
              return tx;
            })
          : rows;
        finish(txs);
      } catch (err) {
        finish([], true);
      }
    };

    try {
      let request;
      if (customRequest) {
        request = mod.app.network.sendRequestAsTransaction(
          'load tweets',
          { created_earlier_than: peer_obj.tweets_earliest_ts, field4: '' },
          receive,
          peer_obj.peer.publicKey
        );
      } else {
        const obj = queryType === 'lookup'
          ? { sig: String(options.sig), field1: 'RedSquare', flagged_ne: 1, limit: 1 }
          : { field1: 'RedSquare', flagged_ne: 1, field4: '', limit: peer_obj.tweets_limit || 10 };

        if (queryType === 'older' || queryType === 'tip') {
          obj.created_earlier_than =
            queryType === 'tip' ? Date.now() : peer_obj.tweets_earliest_ts;
        } else if (queryType === 'poll') {
          obj.updated_later_than = options.pollAfter ?? peer_obj.tweets_latest_ts;
          obj.ascending = true;
          obj.limit = options.pollLimit ?? peer_obj.tweets_limit ?? 10;
        }

        const archivePeer = isLocalPeer(peer_obj) ? 'localhost' : peer_obj.peer;
        request = mod.app.storage.loadTransactions(obj, receive, archivePeer);
      }
      Promise.resolve(request).catch(() => finish([], true));
    } catch (err) {
      finish([], true);
    }
  });
}

async function queryPollPages(mod, peer_obj, options) {
  const baseLimit = Math.min(MAX_ARCHIVE_PAGE_SIZE,
    Math.max(10, Math.floor(Number(peer_obj.tweets_limit) || 10)));
  const historyVersion = peer_obj.tweets_history_version || 0;
  let limit = baseLimit;
  let after = Number(peer_obj.tweets_latest_ts) || 0;
  const transactions = new Map();

  for (let page = 0; page < MAX_POLL_PAGES; page++) {
    if ((peer_obj.tweets_history_version || 0) !== historyVersion) {
      return { txs: [], failed: true };
    }
    const response = await queryPeer(mod, peer_obj, 'poll', {
      ...options, pollAfter: after, pollLimit: limit
    });
    if (response.failed) {
      return response;
    }
    if (response.txs.length > limit) {
      return { txs: [], failed: true };
    }

    let latest = after;
    for (const tx of response.txs) {
      const signature = String(tx?.signature || '');
      const updatedAt = Number(tx?.optional?.updated_at) || Number(tx?.timestamp);
      // Reject invalid/non-ascending results instead of advancing past unseen rows.
      if (!signature || !Number.isSafeInteger(updatedAt) ||
          updatedAt <= after || updatedAt < latest) {
        return { txs: [], failed: true };
      }
      latest = updatedAt;
      transactions.set(signature, tx);
    }

    if (response.txs.length < limit) {
      return { txs: Array.from(transactions.values()), failed: false, poll_latest_ts: latest };
    }

    // A full page may end partway through a timestamp shared by several rows.
    // Re-read that boundary until a shorter page or a later timestamp proves
    // that the whole group has been fetched.
    const safeAfter = latest - 1;
    if (safeAfter > after) {
      after = safeAfter;
      limit = baseLimit;
    } else if (limit < MAX_ARCHIVE_PAGE_SIZE) {
      limit = Math.min(MAX_ARCHIVE_PAGE_SIZE, limit * 2);
    } else {
      // Archive caps pages at 100 and has no secondary cursor. Keep the old
      // watermark rather than silently dropping the rest of this timestamp.
      return { txs: [], failed: true };
    }
  }

  // Bound each polling operation; a later poll resumes from this safe cursor.
  return { txs: Array.from(transactions.values()), failed: false, poll_latest_ts: after };
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

  const callbacks = [callback];
  mod._load_busy[busyKey] = callbacks;
  let finished = false;
  let failed = false;
  const requestVersions = new Map();

  const added = [];
  const new_tweets = [];
  const updated = [];
  const ignored = [];
  const newest_known_tweet_ts = newestKnownTweetTs(mod);
  const notify = !lookup;

  const finish = (exhausted) => {
    if (finished) {
      return;
    }
    finished = true;
    // A source may reopen after its response, while another peer is pending.
    const history_reopened = Array.from(requestVersions).some(
      ([peer_obj, version]) => (peer_obj.tweets_history_version || 0) !== version
    );
    const result = {
      type,
      direction: mode,
      added: added.slice(),
      new_tweets: new_tweets.slice(),
      updated: updated.slice(),
      ignored: ignored.slice(),
      failed,
      history_reopened,
      exhausted: !failed && !history_reopened && Boolean(exhausted)
    };

    mod._load_busy[busyKey] = null;

    for (const cb of callbacks) {
      try {
        cb(result);
      } catch (err) {
        console.error('RedSquare tweet load callback failed', err);
      }
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

    const onPeerComplete = (peer_obj, queryType, response, historyVersion) => {
      if (stoppedForLookup) {
        return;
      }

      let peerFailed = response.failed;
      const rows = response.txs;
      const updateEarliest = queryType === 'older' || queryType === 'tip';
      const updatePeerCursors = queryType !== 'lookup';
      // Commit cursors only after the entire response was processed successfully.
      const nextPeerState = { ...peer_obj };
      let buckets;
      if (!peerFailed) {
        try {
          buckets = processTweetTxs(mod, nextPeerState, rows, {
            updateEarliest,
            updatePeerCursors,
            updateLatest: queryType !== 'older' && queryType !== 'lookup',
            notify,
            newest_known_tweet_ts,
            includeNew: queryType !== 'older' && queryType !== 'lookup'
          });
          if (queryType === 'poll') {
            nextPeerState.tweets_latest_ts = response.poll_latest_ts;
          }
          mergeBuckets(buckets);
        } catch (err) {
          peerFailed = true;
        }
      }

      if (peerFailed) {
        failed = true;
      } else {
        const currentHistory = (peer_obj.tweets_history_version || 0) === historyVersion;
        if (updatePeerCursors) {
          const reopen = currentHistory && queryType === 'poll' && peer_obj.tweets_exhausted &&
            rows.length > 0 && (!peer_obj.tweets_has_rows || buckets.added.some((signature) => {
              const tweet = mod.getTweet(signature);
              return tweet && !tweet.parent_id && !tweet.ephemeral;
            }));

          if (currentHistory) {
            peer_obj.tweets_earliest_ts = nextPeerState.tweets_earliest_ts;
            if (updateEarliest) {
              peer_obj.tweets_exhausted = rows.length === 0;
            }
            peer_obj.tweets_latest_ts = nextPeerState.tweets_latest_ts;
            peer_obj.tweets_hydrated = true;
          }
          if (rows.length > 0) {
            peer_obj.tweets_has_rows = true;
          }
          if (reopen) {
            reopenTweetSource(peer_obj);
          }
        }
        if (lookup && mod.hasTweet(signature)) {
          stoppedForLookup = true;
          done(false);
          return;
        }
        if (rows.length === 0 && currentHistory) {
          emptyCount++;
        }
      }

      remaining--;
      if (remaining <= 0) {
        done(emptyCount === peers.length && added.length === 0);
      }
    };

    for (const peer_obj of peers) {
      const queryType = queryTypeForPeer(peer_obj, selectionMode);

      if (queryType === 'older' && peer_obj.tweets_exhausted) {
        remaining--;
        emptyCount++;
        if (remaining <= 0) {
          done(emptyCount === peers.length && added.length === 0);
        }
        continue;
      }

      const historyVersion = peer_obj.tweets_history_version || 0;
      if (queryType !== 'lookup') {
        requestVersions.set(peer_obj, historyVersion);
      }
      const request = queryType === 'poll'
        ? queryPollPages(mod, peer_obj, options)
        : queryPeer(mod, peer_obj, queryType, options);
      request.then((response) => {
        onPeerComplete(peer_obj, queryType, response, historyVersion);
      });
    }
  };

  if (lookup && mod.hasTweet(signature)) {
    finish(false);
    return;
  }

  const selection = selectTweetSources(mod, mode, options);

  runPeers(selection.mode, selection.peers, (exhausted) => {
    // Remote history ended: check the remaining local archive before reporting
    // exhaustion to the manager.
    if (mode === 'older' && exhausted && !failed) {
      const local = localPeer(mod);

      if (
        local &&
        !local.tweets_exhausted &&
        !selection.peers.includes(local)
      ) {
        runPeers('older', [local], (localExhausted) => {
          finish(exhausted && localExhausted);
        });
        return;
      }
    }

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
  reopenTweetSource,
  hasUsableTimelineContent,
  noteLocalSyncedTweet,
  isExactLookup,
  selectTweetSources,
  queryTypeForPeer,
  emptyResult,
  loadTweetTransactions
};
