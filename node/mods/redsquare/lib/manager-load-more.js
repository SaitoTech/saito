const LOAD_DELAY_MS = 2000;
const MOCK_PAGE_SIZE = 3;
const MAX_MOCK_PAGES = 2;

const MOCK_AUTHOR_KEYS = [
  'redsquare-mock-pk-saito',
  'redsquare-mock-pk-rp',
  'redsquare-mock-pk-alice',
  'redsquare-mock-pk-bob',
  'redsquare-mock-pk-carol',
  'redsquare-mock-pk-dave'
];

const MOCK_TIMELINE_TEXTS = [
  'Archive pagination lands here eventually. For now this batch is simulated.',
  'Every scroll append keeps the existing DOM intact — no full rerenders.',
  'Mock tweets exercise the same pipeline a real archive response will use.',
  'Manager owns scroll detection, loading state, and append rendering.',
  'Tweet objects stay unaware that infinite scrolling exists.',
  'When networking arrives, only loadMore() needs to change.',
  'Decentralized feeds should feel instant when you navigate back.',
  'The loader uses the same Saito pulse animation as the rest of the stack.'
];

const MOCK_NOTIFICATION_TYPES = ['like', 'reply', 'retweet', 'mention'];

const MOCK_THREAD_TEXTS = [
  'This reply simulates a deeper thread from the archive.',
  'More conversation below the critical path — loaded on demand.',
  'Thread scrolling appends replies without rebuilding the view.',
  'Another mock reply while archive queries are still stubbed out.'
];

function delay(ms = LOAD_DELAY_MS) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildMockTweetTx({ signature, publicKey, text, parent_id = '', thread_id = '' }) {
  return {
    signature,
    timestamp: Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
    from: [
      {
        publicKey,
        amount: '0',
        type: 1,
        index: 0,
        blockId: '0',
        txOrdinal: '0'
      }
    ],
    msg: {
      module: 'RedSquare',
      request: 'create tweet',
      data: {
        text,
        images: [],
        parent_id,
        thread_id: thread_id || signature
      }
    },
    optional: {
      num_likes: Math.floor(Math.random() * 120),
      num_replies: Math.floor(Math.random() * 24),
      num_retweets: Math.floor(Math.random() * 40)
    }
  };
}

function pickAuthor(index = 0) {
  return MOCK_AUTHOR_KEYS[index % MOCK_AUTHOR_KEYS.length];
}

function sliceUnrendered(signatures, cursor, batchSize) {
  if (cursor >= signatures.length) {
    return [];
  }

  return signatures.slice(cursor, cursor + batchSize);
}

function ingestTimelineBatch(mod, page, batchSize) {
  const signatures = [];
  const startIndex = page * MOCK_PAGE_SIZE;

  for (let i = 0; i < batchSize; i++) {
    const textIndex = startIndex + i;

    if (textIndex >= MOCK_TIMELINE_TEXTS.length) {
      break;
    }

    const signature = `redsquare-mock-tx-scroll-${page + 1}-${i + 1}`;

    if (mod.hasTweet(signature)) {
      signatures.push(signature);
      continue;
    }

    const tx = buildMockTweetTx({
      signature,
      publicKey: pickAuthor(textIndex),
      text: MOCK_TIMELINE_TEXTS[textIndex]
    });
    const tweet = mod.addTweet(tx);

    if (tweet) {
      signatures.push(signature);
    }
  }

  return signatures;
}

function ingestNotificationBatch(mod, page, batchSize) {
  const signatures = [];
  const tweetPool = mod.tweets_timeline.filter((signature) => mod.hasTweet(signature));

  if (tweetPool.length === 0) {
    return signatures;
  }

  for (let i = 0; i < batchSize; i++) {
    const signature = `redsquare-mock-notif-scroll-${page + 1}-${i + 1}`;

    if (mod.hasNotification(signature)) {
      signatures.push(signature);
      continue;
    }

    const notification = mod.addNotification({
      signature,
      tweet_signature: tweetPool[(page * batchSize + i) % tweetPool.length],
      type: MOCK_NOTIFICATION_TYPES[(page + i) % MOCK_NOTIFICATION_TYPES.length],
      actor_publicKey: pickAuthor(page + i + 1),
      created_at: Date.now() - (page * batchSize + i + 1) * 45 * 60 * 1000
    });

    if (notification) {
      signatures.push(signature);
    }
  }

  return signatures;
}

function ingestThreadBatch(mod, threadId, parentSignature, page, batchSize) {
  const signatures = [];

  for (let i = 0; i < batchSize; i++) {
    const textIndex = page * batchSize + i;

    if (textIndex >= MOCK_THREAD_TEXTS.length) {
      break;
    }

    const signature = `redsquare-mock-tx-thread-${threadId.slice(-3)}-${page + 1}-${i + 1}`;

    if (mod.hasTweet(signature)) {
      signatures.push(signature);
      continue;
    }

    const tx = buildMockTweetTx({
      signature,
      publicKey: pickAuthor(textIndex + 2),
      text: MOCK_THREAD_TEXTS[textIndex],
      parent_id: parentSignature,
      thread_id: threadId
    });
    const tweet = mod.addTweet(tx);

    if (tweet) {
      signatures.push(signature);
    }
  }

  return signatures;
}

async function loadTimelinePage(mod, pagination) {
  const pending = sliceUnrendered(mod.tweets_timeline, pagination.cursor, pagination.batchSize);

  if (pending.length > 0) {
    return { items: pending, exhausted: false };
  }

  if (pagination.mockPage >= MAX_MOCK_PAGES) {
    return { items: [], exhausted: true, message: 'No more tweets available' };
  }

  const items = ingestTimelineBatch(mod, pagination.mockPage, pagination.batchSize);
  pagination.mockPage += 1;

  if (items.length === 0) {
    return { items: [], exhausted: true, message: 'No more tweets available' };
  }

  return { items, exhausted: false };
}

async function loadNotificationsPage(mod, pagination) {
  const pending = sliceUnrendered(mod.notifications_timeline, pagination.cursor, pagination.batchSize);

  if (pending.length > 0) {
    return { items: pending, exhausted: false };
  }

  if (pagination.mockPage >= MAX_MOCK_PAGES) {
    return { items: [], exhausted: true, message: "You're all caught up" };
  }

  const items = ingestNotificationBatch(mod, pagination.mockPage, pagination.batchSize);
  pagination.mockPage += 1;

  if (items.length === 0) {
    return { items: [], exhausted: true, message: "You're all caught up" };
  }

  return { items, exhausted: false };
}

async function loadThreadPage(mod, pagination, active_thread_id) {
  const pending = sliceUnrendered(pagination.chain, pagination.cursor, pagination.batchSize);

  if (pending.length > 0) {
    return { items: pending, exhausted: false, source: 'chain' };
  }

  if (pagination.mockPage >= MAX_MOCK_PAGES) {
    return { items: [], exhausted: true, message: 'No more replies in this thread' };
  }

  const parentSignature = pagination.chain[pagination.chain.length - 1] || '';

  if (!parentSignature || !active_thread_id) {
    return { items: [], exhausted: true, message: 'No more replies in this thread' };
  }

  const items = ingestThreadBatch(mod, active_thread_id, parentSignature, pagination.mockPage, pagination.batchSize);
  pagination.mockPage += 1;

  if (items.length === 0) {
    return { items: [], exhausted: true, message: 'No more replies in this thread' };
  }

  for (const signature of items) {
    pagination.chain.push(signature);
  }

  return { items, exhausted: false, source: 'archive' };
}

async function loadMore({ mode, mod, pagination, active_thread_id }) {
  await delay();

  switch (mode) {
    case 'notifications':
      return loadNotificationsPage(mod, pagination.notifications);
    case 'thread':
      return loadThreadPage(mod, pagination.thread, active_thread_id);
    case 'timeline':
    default:
      return loadTimelinePage(mod, pagination.timeline);
  }
}

module.exports = {
  LOAD_DELAY_MS,
  loadMore
};
