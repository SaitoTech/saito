const Tweet = require('./tweet');

function addTweet(mod, tx) {
  const tweet = new Tweet(mod.app, mod, tx);

  if (!tweet.signature) {
    return null;
  }

  if (!isValidTweetMessage(mod, tweet)) {
    return null;
  }

  if (hasTweet(mod, tweet.signature)) {
    return updateTweet(mod, tx);
  }

  mod.tweets[tweet.signature] = tweet;
  indexTweetRelationships(mod, tweet.signature);
  insertTimeline(mod, tweet.signature);
  attachOrphans(mod, tweet.signature);

  return tweet;
}

function removeTweet(mod, signature) {
  if (!signature || !hasTweet(mod, signature)) {
    return false;
  }

  unindexTweetRelationships(mod, signature);
  removeFromTimeline(mod, signature);
  delete mod.tweets[signature];

  return true;
}

function updateTweet(mod, tx) {
  const tweet = new Tweet(mod.app, mod, tx);

  if (!tweet.signature) {
    return null;
  }

  if (!isValidTweetMessage(mod, tweet)) {
    return null;
  }

  const existing = getTweet(mod, tweet.signature);

  if (!existing) {
    return addTweet(mod, tx);
  }

  const previousParent = existing.parent_id || '';

  existing.updateFromTransaction(tx);

  if ((existing.parent_id || '') !== previousParent) {
    unindexTweetRelationships(mod, tweet.signature);
    indexTweetRelationships(mod, tweet.signature);
    removeFromTimeline(mod, tweet.signature);
    insertTimeline(mod, tweet.signature);
  } else {
    resortTimeline(mod);
  }

  return existing;
}

function getTweet(mod, signature) {
  if (!signature) {
    return null;
  }

  return mod.tweets[signature] || null;
}

function hasTweet(mod, signature) {
  return Boolean(signature && mod.tweets[signature]);
}

function isValidTweetMessage(mod, tweet) {
  const tx = tweet.tx;
  const txmsg =
    tx && typeof tx.returnMessage === 'function' ? tx.returnMessage() : tx?.msg && typeof tx.msg === 'object' ? tx.msg : {};

  if (txmsg.module && txmsg.module !== mod.name) {
    return false;
  }

  if (txmsg.request && txmsg.request !== 'create tweet') {
    return false;
  }

  return true;
}

function indexTweetRelationships(mod, signature) {
  const tweet = getTweet(mod, signature);

  if (!tweet || !tweet.parent_id) {
    return;
  }

  const parentId = tweet.parent_id;

  mod.tweets_parents[signature] = parentId;

  if (hasTweet(mod, parentId)) {
    addChildSignature(mod, parentId, signature);
    return;
  }

  if (!mod.tweets_orphans[parentId]) {
    mod.tweets_orphans[parentId] = [];
  }

  if (!mod.tweets_orphans[parentId].includes(signature)) {
    mod.tweets_orphans[parentId].push(signature);
  }
}

function unindexTweetRelationships(mod, signature) {
  const parentId = mod.tweets_parents[signature];

  if (parentId) {
    removeChildSignature(mod, parentId, signature);
    delete mod.tweets_parents[signature];
  }

  if (mod.tweets_children[signature]) {
    for (const childSignature of mod.tweets_children[signature]) {
      delete mod.tweets_parents[childSignature];

      if (!mod.tweets_orphans[signature]) {
        mod.tweets_orphans[signature] = [];
      }

      if (!mod.tweets_orphans[signature].includes(childSignature)) {
        mod.tweets_orphans[signature].push(childSignature);
      }
    }

    delete mod.tweets_children[signature];
  }

  for (const parentKey of Object.keys(mod.tweets_orphans)) {
    mod.tweets_orphans[parentKey] = mod.tweets_orphans[parentKey].filter((s) => s !== signature);

    if (mod.tweets_orphans[parentKey].length === 0) {
      delete mod.tweets_orphans[parentKey];
    }
  }
}

function addChildSignature(mod, parentSignature, childSignature) {
  if (!mod.tweets_children[parentSignature]) {
    mod.tweets_children[parentSignature] = [];
  }

  if (!mod.tweets_children[parentSignature].includes(childSignature)) {
    mod.tweets_children[parentSignature].push(childSignature);
  }

  updateCriticalChild(mod, parentSignature);
}

function removeChildSignature(mod, parentSignature, childSignature) {
  const children = mod.tweets_children[parentSignature];

  if (!children) {
    return;
  }

  mod.tweets_children[parentSignature] = children.filter((s) => s !== childSignature);

  if (mod.tweets_children[parentSignature].length === 0) {
    delete mod.tweets_children[parentSignature];
  }

  updateCriticalChild(mod, parentSignature);
}

function updateCriticalChild(mod, parentSignature) {
  const parent = getTweet(mod, parentSignature);

  if (!parent) {
    return;
  }

  const children = mod.tweets_children[parentSignature] || [];

  if (children.length === 0) {
    parent.critical_child = null;
    return;
  }

  let selected = null;
  let selectedAt = -1;

  for (const childSignature of children) {
    const child = getTweet(mod, childSignature);

    if (!child) {
      continue;
    }

    if (child.created_at >= selectedAt) {
      selectedAt = child.created_at;
      selected = childSignature;
    }
  }

  parent.critical_child = selected;
}

function attachOrphans(mod, parentSignature) {
  const orphans = mod.tweets_orphans[parentSignature];

  if (!orphans || orphans.length === 0) {
    return;
  }

  for (const childSignature of orphans) {
    mod.tweets_parents[childSignature] = parentSignature;
    addChildSignature(mod, parentSignature, childSignature);
  }

  delete mod.tweets_orphans[parentSignature];
}

function insertTimeline(mod, signature) {
  const tweet = getTweet(mod, signature);

  if (!tweet || tweet.parent_id) {
    return;
  }

  if (!mod.tweets_timeline.includes(signature)) {
    mod.tweets_timeline.push(signature);
  }

  resortTimeline(mod);
}

function removeFromTimeline(mod, signature) {
  mod.tweets_timeline = mod.tweets_timeline.filter((s) => s !== signature);
}

function resortTimeline(mod) {
  mod.tweets_timeline.sort((a, b) => {
    const tweetA = getTweet(mod, a);
    const tweetB = getTweet(mod, b);

    return (tweetB?.created_at || 0) - (tweetA?.created_at || 0);
  });
}

function showTweetInfo(mod, tweet) {
  if (!tweet) {
    return;
  }

  const lines = [
    `Tweet signature: ${tweet.signature}`,
    `Author: ${tweet.username}`,
    `Public key: ${tweet.publicKey || 'unknown'}`,
    `Posted: ${new Date(tweet.created_at).toLocaleString()}`
  ];

  if (tweet.thread_id) {
    lines.push(`Thread: ${tweet.thread_id}`);
  }

  if (tweet.parent_id) {
    lines.push(`Parent: ${tweet.parent_id}`);
  }

  alert(lines.join('\n'));
}

module.exports = {
  addTweet,
  removeTweet,
  updateTweet,
  getTweet,
  hasTweet,
  isValidTweetMessage,
  indexTweetRelationships,
  unindexTweetRelationships,
  addChildSignature,
  removeChildSignature,
  updateCriticalChild,
  attachOrphans,
  insertTimeline,
  removeFromTimeline,
  resortTimeline,
  showTweetInfo
};
