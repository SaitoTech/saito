const MOCK_THREAD_TEXTS = [
  'This reply simulates a deeper thread from the archive.',
  'More conversation below the critical path — loaded on demand.',
  'Thread scrolling appends replies without rebuilding the view.',
  'Another mock reply while archive queries are still stubbed out.'
];

const MOCK_AUTHOR_KEYS = [
  'redsquare-mock-pk-saito',
  'redsquare-mock-pk-rp',
  'redsquare-mock-pk-alice',
  'redsquare-mock-pk-bob',
  'redsquare-mock-pk-carol',
  'redsquare-mock-pk-dave'
];

const MAX_MOCK_PAGES = 2;

function makeLoadResult(type, direction, { added = [], updated = [], ignored = [], exhausted = false } = {}) {
  return {
    type,
    direction,
    added: added.slice(),
    updated: updated.slice(),
    ignored: ignored.slice(),
    exhausted: Boolean(exhausted)
  };
}

function sliceUnrendered(signatures, cursor, batchSize) {
  if (cursor >= signatures.length) {
    return [];
  }

  return signatures.slice(cursor, cursor + batchSize);
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

function ingestThreadBatch(mod, threadId, parentSignature, page, batchSize) {
  const added = [];
  const updated = [];
  const ignored = [];

  for (let i = 0; i < batchSize; i++) {
    const textIndex = page * batchSize + i;

    if (textIndex >= MOCK_THREAD_TEXTS.length) {
      break;
    }

    const signature = `redsquare-mock-tx-thread-${threadId.slice(-3)}-${page + 1}-${i + 1}`;

    if (mod.hasTweet(signature)) {
      ignored.push(signature);
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
      added.push(signature);
    } else {
      ignored.push(signature);
    }
  }

  return { added, updated, ignored };
}

async function loadThreadPage(mod, pagination, active_thread_id, active_signature) {
  const pending = sliceUnrendered(pagination.chain, pagination.cursor, pagination.batchSize);

  if (pending.length > 0) {
    return makeLoadResult('thread', 'older', { added: pending, exhausted: false });
  }

  if (pagination.mockPage >= MAX_MOCK_PAGES) {
    return makeLoadResult('thread', 'older', { exhausted: true });
  }

  const parentSignature = active_signature || pagination.chain[0] || '';

  if (!parentSignature || !active_thread_id) {
    return makeLoadResult('thread', 'older', { exhausted: true });
  }

  const buckets = ingestThreadBatch(
    mod,
    active_thread_id,
    parentSignature,
    pagination.mockPage,
    pagination.batchSize
  );
  pagination.mockPage += 1;

  if (buckets.added.length === 0) {
    return makeLoadResult('thread', 'older', { ...buckets, exhausted: true });
  }

  for (const signature of buckets.added) {
    pagination.chain.push(signature);
  }

  return makeLoadResult('thread', 'older', { ...buckets, exhausted: false });
}

async function loadMore({ mode, mod, pagination, active_thread_id, active_signature }) {
  if (mode !== 'thread') {
    return makeLoadResult(mode || 'tweets', 'older', { exhausted: true });
  }

  return loadThreadPage(mod, pagination.thread, active_thread_id, active_signature);
}

module.exports = {
  loadMore
};
