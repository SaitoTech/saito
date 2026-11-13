// Archive pages use (creation timestamp, signature) so tied timestamps are stable.
function pageQuery(publicKey, cursor = null, limit = 10) {
  return {
    field1: 'Stack',
    field4: 'stack:post',
    ...(publicKey ? { field2: publicKey } : {}),
    created_cursor: cursor || { timestamp: Date.now() + 1, signature: '' },
    limit: Math.min(100, Math.max(10, limit + 1))
  };
}

function comparePosts(a, b) {
  return (
    b.timestamp - a.timestamp ||
    (a.signature < b.signature ? 1 : a.signature > b.signature ? -1 : 0)
  );
}

function collapsePosts(mod, posts) {
  const latest = new Map();
  for (const tx of [...posts].sort(comparePosts)) {
    const msg = tx?.returnMessage?.();
    if (!tx?.signature || msg?.module !== 'Stack' || msg?.data?.type !== 'stack_post') continue;
    const id = `${tx.from?.[0]?.publicKey}:${mod.getLogicalPostId(tx)}`;
    if (!latest.has(id)) latest.set(id, tx);
  }
  return [...latest.values()];
}

function postPage(mod, posts, limit = 10) {
  const unique = [
    ...new Map(posts.filter((tx) => tx?.signature).map((tx) => [tx.signature, tx])).values()
  ];
  unique.sort(comparePosts);
  const page = unique.slice(0, limit);
  const last = page[page.length - 1];
  return {
    posts: collapsePosts(mod, page),
    hasMore: unique.length > limit,
    nextCursor: last ? { timestamp: last.timestamp, signature: last.signature } : null
  };
}

function loadArchivePosts(app, query, peer = 'localhost') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Stack archive request timed out')), 15000);
    Promise.resolve()
      .then(() =>
        app.storage.loadTransactions(
          { ...query },
          (posts) => {
            clearTimeout(timer);
            resolve(posts || []);
          },
          peer
        )
      )
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

module.exports = { pageQuery, postPage, collapsePosts, loadArchivePosts };
