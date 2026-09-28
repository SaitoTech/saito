const assert = require('node:assert/strict');
const test = require('node:test');

const Manager = require('../../../mods/redsquare/lib/manager');
const RedSquareApi = require('../../../mods/redsquare/lib/redsquare-api');
const RedSquare = require('../../../mods/redsquare/redsquare');

function createManager(tweets, children = {}, parents = {}) {
  const mod = {
    tweets,
    tweets_children: children,
    tweets_parents: parents,
    getTweet: (signature) => tweets[signature] || null
  };

  return new Manager({}, mod);
}

test('home resets an active main feed to the top', () => {
  const manager = createManager({});
  let restoredScroll = null;

  manager.mode = 'timeline';
  manager.scroll_positions.timeline = 480;
  manager.replaceTweetLocation = () => {};
  manager.saveScrollPosition = (mode) => {
    manager.scroll_positions[mode] = 480;
  };
  manager.render = () => {};
  manager.restoreScrollPosition = (mode) => {
    restoredScroll = manager.scroll_positions[mode];
  };
  manager.syncScrollFooter = () => {};
  manager.syncPendingNewerTweets = () => {};

  manager.renderHome();

  assert.equal(restoredScroll, 0);
  assert.equal(manager.scroll_positions.timeline, 0);
});

test('home restores the saved main-feed position when returning from another view', () => {
  const manager = createManager({});
  let restoredScroll = null;

  manager.mode = 'notifications';
  manager.scroll_positions.timeline = 480;
  manager.replaceTweetLocation = () => {};
  manager.saveScrollPosition = () => {};
  manager.render = () => {};
  manager.restoreScrollPosition = (mode) => {
    restoredScroll = manager.scroll_positions[mode];
  };
  manager.resetMenuToHome = () => {};
  manager.syncScrollFooter = () => {};
  manager.syncPendingNewerTweets = () => {};

  manager.renderHome();

  assert.equal(restoredScroll, 480);
  assert.equal(manager.scroll_positions.timeline, 480);
});

test('thread view includes every known descendant in deterministic order', () => {
  const tweets = {
    root: { signature: 'root', created_at: 1 },
    alpha: { signature: 'alpha', created_at: 2 },
    beta: { signature: 'beta', created_at: 2 },
    grandchild: { signature: 'grandchild', created_at: 3 }
  };
  const manager = createManager(
    tweets,
    {
      root: ['beta', 'alpha'],
      alpha: ['grandchild'],
      grandchild: ['root']
    },
    { alpha: 'root', beta: 'root', grandchild: 'alpha', root: 'grandchild' }
  );

  assert.deepEqual(manager.buildThreadView('root'), ['root', 'alpha', 'grandchild', 'beta']);

  manager.resetThreadPagination('root');
  assert.equal(manager.pagination.thread.batchSize, 4);
  assert.deepEqual(manager.pagination.thread.chain, ['root', 'alpha', 'grandchild', 'beta']);
  assert.equal(manager.getThreadRoot('grandchild'), 'root');
});

test('thread view reconstructs missing child index entries from loaded replies', () => {
  const tweets = {
    root: { signature: 'root', parent_id: '', created_at: 1 },
    reply: { signature: 'reply', parent_id: 'root', created_at: 2 },
    grandchild: { signature: 'grandchild', parent_id: 'reply', created_at: 3 }
  };
  const manager = createManager(tweets, { root: ['reply'] }, { reply: 'root' });

  assert.deepEqual(manager.buildThreadView('root'), ['root', 'reply', 'grandchild']);
});

test('view entire thread refreshes the root and repaints newly loaded replies', async () => {
  const tweets = {
    root: { signature: 'root', parent_id: '', created_at: 1 },
    reply: { signature: 'reply', parent_id: 'root', created_at: 2 }
  };
  const manager = createManager(tweets, { root: ['reply'] }, { reply: 'root' });
  const rendered = [];

  manager.renderThread = (signature, options) => {
    manager.mode = 'thread';
    manager.active_signature = signature;
    rendered.push({ signature, options });
  };
  manager.mode = 'thread';
  manager.active_signature = 'reply';
  manager.mod.loadTweetThread = async (signature) => {
    tweets.grandchild = {
      signature: 'grandchild',
      parent_id: 'reply',
      created_at: 3
    };
    return { status: 'loaded', tweet: tweets[signature] };
  };

  const result = await manager.openEntireThread('root');

  assert.equal(result.status, 'loaded');
  assert.deepEqual(rendered, [
    { signature: 'root', options: undefined },
    { signature: 'root', options: { updateHistory: false } }
  ]);
  assert.deepEqual(manager.buildThreadView('root'), ['root', 'reply', 'grandchild']);
});

test('missing permalink replaces the feed with a retryable unavailable state', async () => {
  const signature = 'missing';
  const mod = {
    getTweet: () => null,
    returnTweetSignatureFromLocation: () => signature,
    returnUserPublicKeyFromLocation: () => '',
    loadTweetThread: async () => ({
      status: 'unavailable',
      reason: 'not-found',
      tweet: null
    })
  };
  const manager = new Manager({}, mod);
  manager.render = () => {};

  const result = await manager.applyLocationRoute();

  assert.equal(result.status, 'unavailable');
  assert.equal(manager.mode, 'thread');
  assert.equal(manager.active_signature, signature);
  assert.equal(manager.pending_route_signature, signature);
  assert.deepEqual(manager.permalink_state, {
    signature,
    status: 'unavailable',
    reason: 'not-found'
  });
  assert.match(manager.getFeedStatusMessage('unavailable'), /not available/);
});

test('peer updates during a permalink lookup coalesce into one refresh', async () => {
  const signature = 'missing';
  const lookups = [];
  const mod = {
    getTweet: () => null,
    returnTweetSignatureFromLocation: () => signature,
    returnUserPublicKeyFromLocation: () => '',
    loadTweetThread: () =>
      new Promise((resolve) => {
        lookups.push(resolve);
      })
  };
  const manager = new Manager({}, mod);
  manager.render = () => {};

  const initial = manager.applyLocationRoute();
  manager.applyLocationRoute({ refresh: true });
  manager.applyLocationRoute({ refresh: true });

  assert.equal(lookups.length, 1);
  lookups[0]({ status: 'unavailable', reason: 'not-found', tweet: null });
  await initial;
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(lookups.length, 2);
  lookups[1]({ status: 'unavailable', reason: 'not-found', tweet: null });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(lookups.length, 2);
  assert.equal(manager.permalink_state.status, 'unavailable');
});

test('archive lookup reports callback success and thrown failures', async () => {
  const success = Object.create(RedSquare.prototype);
  success.app = {
    storage: {
      loadTransactions: (_query, callback) => callback(['transaction'])
    }
  };

  assert.deepEqual(await success.loadArchiveTransactionsWithStatus({}, 'localhost', 10), {
    status: 'loaded',
    transactions: ['transaction'],
    error: null
  });

  const failure = Object.create(RedSquare.prototype);
  const lookupError = new Error('archive unavailable');
  failure.app = {
    storage: {
      loadTransactions: () => {
        throw lookupError;
      }
    }
  };

  const failedResult = await failure.loadArchiveTransactionsWithStatus({}, 'localhost', 10);
  assert.equal(failedResult.status, 'error');
  assert.deepEqual(failedResult.transactions, []);
  assert.equal(failedResult.error, lookupError);
});

test('thread lookup distinguishes not found from archive failures', async (t) => {
  t.mock.method(console, 'info', () => {});

  const createLookup = (archiveStatus) => {
    const mod = Object.create(RedSquare.prototype);
    mod.returnTweetArchivePeers = () => ['localhost'];
    mod.hasTweet = () => false;
    mod.getTweet = () => null;
    mod.addLoadedTweetTransactions = async () => {};
    mod.loadTweetArchivePhase = async () => [
      { status: archiveStatus, transactions: [], error: null }
    ];
    return mod;
  };

  assert.deepEqual(await createLookup('loaded').loadTweetThread('missing'), {
    status: 'unavailable',
    reason: 'not-found',
    tweet: null
  });
  assert.deepEqual(await createLookup('timeout').loadTweetThread('missing'), {
    status: 'error',
    reason: 'lookup-failed',
    tweet: null
  });

  const target = { signature: 'loaded', thread_id: 'loaded' };
  const partial = Object.create(RedSquare.prototype);
  partial.returnTweetArchivePeers = () => ['localhost'];
  partial.hasTweet = () => true;
  partial.getTweet = () => target;
  partial.addLoadedTweetTransactions = async () => {};
  partial.loadTweetArchivePhase = async () => [
    { status: 'timeout', transactions: [], error: null }
  ];

  assert.deepEqual(await partial.loadTweetThread(target.signature), {
    status: 'loaded',
    tweet: target,
    partial: true
  });
});

test('public API unwraps structured thread lookup results', async () => {
  const tweet = { signature: 'remote' };
  const api = new RedSquareApi(
    {},
    {
      getTweet: () => null,
      loadTweetThread: async () => ({ status: 'loaded', tweet })
    }
  );

  assert.equal(await api.loadTweet(tweet.signature), tweet);

  api.mod.loadTweetThread = async () => ({
    status: 'unavailable',
    reason: 'not-found',
    tweet: null
  });
  assert.equal(await api.loadTweet('missing'), null);
});
