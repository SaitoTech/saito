const Notification = require('./notification');
const Tweets = require('./tweets');

function normalizeNotificationInput(mod, input) {
  if (!input) {
    return null;
  }

  if (input.msg && input.signature != null) {
    return Notification.fromTransaction(mod.app, mod, input);
  }

  return new Notification(mod.app, mod, input);
}

function getNotificationAggregateKey(mod, notification) {
  if (!notification || notification.type !== 'like' || !notification.tweet_signature) {
    return '';
  }

  return `like:${notification.tweet_signature}`;
}

function getUnreadNotificationCount(mod) {
  const lastViewed = Number(mod.notifications_last_viewed_ts) || 0;
  let unread = 0;

  for (const signature of mod.notifications_timeline || []) {
    const notification = getNotification(mod, signature);

    if (notification && Number(notification.created_at) > lastViewed) {
      unread += 1;
    }
  }

  if (!mod.moderator_mode) {
    return unread;
  }

  const reviewCount = typeof mod.moderate?.count === 'function' ? mod.moderate.count() : 0;

  return unread + reviewCount;
}

function markNotificationsViewed(mod) {
  mod.notifications_last_viewed_ts = Date.now();
  mod.saveOptions?.();
  updateNotificationBadge(mod);
}

function updateNotificationBadge(mod) {
  const count = getUnreadNotificationCount(mod);

  mod.app.connection?.emit('redsquare-update-notifications', count);

  if (mod.main?.menu) {
    mod.main.menu.updateBadge(count);
  }
}

function ensureNotificationTweet(mod, notification) {
  if (!notification?.tx) {
    return;
  }

  const txmsg = returnMessage(notification.tx);

  if (txmsg.request !== 'create tweet') {
    return;
  }

  if (!Tweets.hasTweet(mod, notification.signature)) {
    Tweets.addTweet(mod, notification.tx);
  }
}

function returnMessage(tx) {
  if (tx && typeof tx.returnMessage === 'function') {
    return tx.returnMessage();
  }

  return tx && tx.msg && typeof tx.msg === 'object' ? tx.msg : {};
}

function isKeyringContact(mod, publicKey) {
  if (!publicKey || publicKey === mod.publicKey) {
    return false;
  }

  const keys = mod.app?.keychain?.returnKeys?.() || [];

  return keys.some((key) => key?.publicKey === publicKey);
}

function getInteractionTargetPublicKey(notification) {
  const tx = notification?.tx;
  const actorPublicKey = notification?.actor_publicKey || '';

  if (!tx || !Array.isArray(tx.to)) {
    return '';
  }

  // Wallet transactions include a sender output, so ownership comes from the
  // first recipient other than the actor rather than tx.to[0].
  const target = tx.to.find((slip) => slip?.publicKey && slip.publicKey !== actorPublicKey);

  return target?.publicKey || '';
}

function isOwnTweetInteraction(mod, notification) {
  const tweet = Tweets.getTweet(mod, notification?.tweet_signature);

  if (tweet?.publicKey) {
    return tweet.publicKey === mod.publicKey && notification.actor_publicKey !== mod.publicKey;
  }

  return (
    notification.actor_publicKey !== mod.publicKey &&
    getInteractionTargetPublicKey(notification) === mod.publicKey
  );
}

function isReplyToOwnTweet(mod, notification) {
  const data = returnMessage(notification?.tx).data || {};
  const parentSignature = data.parent_id != null ? String(data.parent_id) : '';
  const parent = Tweets.getTweet(mod, parentSignature);

  if (!parentSignature) {
    return false;
  }

  if (parent?.publicKey) {
    return parent.publicKey === mod.publicKey;
  }

  return getInteractionTargetPublicKey(notification) === mod.publicKey;
}

function shouldNotify(mod, notification) {
  if (Tweets.getTweet(mod, notification?.tweet_signature)?.ephemeral) {
    return true;
  }

  if (!notification?.actor_publicKey || notification.actor_publicKey === mod.publicKey) {
    return false;
  }

  const request = returnMessage(notification.tx).request;

  if (
    request === 'create tweet' ||
    notification.type === 'tweet' ||
    notification.type === 'reply'
  ) {
    return (
      isKeyringContact(mod, notification.actor_publicKey) ||
      (notification.type === 'reply' && isReplyToOwnTweet(mod, notification))
    );
  }

  if (
    request === 'like tweet' ||
    request === 'retweet' ||
    notification.type === 'like' ||
    notification.type === 'quote' ||
    notification.type === 'retweet'
  ) {
    return isOwnTweetInteraction(mod, notification);
  }

  return false;
}

function addNotification(mod, input) {
  const notification = normalizeNotificationInput(mod, input);

  if (!notification || !notification.signature || !notification.tweet_signature) {
    return null;
  }

  if (!shouldNotify(mod, notification)) {
    return null;
  }

  ensureNotificationTweet(mod, notification);

  if (hasNotification(mod, notification.signature)) {
    return updateNotification(mod, input);
  }

  const aggregateKey = getNotificationAggregateKey(mod, notification);

  if (aggregateKey && mod.notifications_aggregate[aggregateKey]) {
    const existing = getNotification(mod, mod.notifications_aggregate[aggregateKey]);

    if (existing) {
      if (!existing.likers?.length) {
        existing.likers = [
          {
            publicKey: existing.actor_publicKey,
            name: existing.actor_name || 'anon',
            count: 1
          }
        ];
      }

      const incomingKey = notification.actor_publicKey;
      const known = existing.likers.find((liker) => liker.publicKey === incomingKey);

      if (known) {
        known.count += 1;
        existing.likers = [known, ...existing.likers.filter((liker) => liker !== known)];
      } else {
        existing.likers.unshift({
          publicKey: incomingKey,
          name: notification.actor_name || 'anon',
          count: 1
        });
      }

      existing.created_at = Math.max(existing.created_at || 0, notification.created_at || 0);
      existing.time = mod.app.browser.formatRelativeTime(existing.created_at);

      const shown = existing.likers.slice(0, 3);
      const names = shown.map((liker) => liker.name);
      let who = names[0] || 'anon';

      if (names.length === 2) {
        who = `${names[0]} and ${names[1]}`;
      } else if (names.length >= 3) {
        who = `${names[0]}, ${names[1]} and ${names[2]}`;
      }

      let clicks = 0;

      for (const liker of shown) {
        if (liker.count > clicks) {
          clicks = liker.count;
        }
      }

      let verb = 'liked';

      if (clicks > 10) {
        verb = 'really, really liked';
      } else if (clicks > 5) {
        verb = 'really liked';
      }

      existing.text = `${who} ${verb} your post`;
      resortNotificationTimeline(mod);
      updateNotificationBadge(mod);
      return existing;
    }
  }

  mod.notifications[notification.signature] = notification;
  insertNotificationTimeline(mod, notification.signature);

  if (aggregateKey) {
    mod.notifications_aggregate[aggregateKey] = notification.signature;
  }

  updateNotificationBadge(mod);

  return notification;
}

function removeNotification(mod, signature) {
  if (!signature || !hasNotification(mod, signature)) {
    return false;
  }

  const notification = getNotification(mod, signature);
  const aggregateKey = getNotificationAggregateKey(mod, notification);

  if (aggregateKey && mod.notifications_aggregate[aggregateKey] === signature) {
    delete mod.notifications_aggregate[aggregateKey];
  }

  removeFromNotificationTimeline(mod, signature);
  delete mod.notifications[signature];
  updateNotificationBadge(mod);

  return true;
}

function updateNotification(mod, input) {
  const notification = normalizeNotificationInput(mod, input);

  if (!notification || !notification.signature) {
    return null;
  }

  const existing = getNotification(mod, notification.signature);

  if (!existing) {
    return addNotification(mod, input);
  }

  if (existing.type === 'like') {
    return existing;
  }

  existing.parseFromData({
    signature: notification.signature,
    tweet_signature: notification.tweet_signature,
    type: notification.type,
    actor_publicKey: notification.actor_publicKey,
    actor_name: notification.actor_name,
    actor_avatar: notification.actor_avatar,
    text: notification.text,
    likers: notification.likers,
    created_at: notification.created_at,
    time: notification.time
  });

  if (notification.tx) {
    existing.tx = notification.tx;
  }

  resortNotificationTimeline(mod);

  return existing;
}

function getNotification(mod, signature) {
  if (!signature) {
    return null;
  }

  return mod.notifications[signature] || null;
}

function hasNotification(mod, signature) {
  return Boolean(signature && mod.notifications[signature]);
}

function insertNotificationTimeline(mod, signature) {
  const notification = getNotification(mod, signature);

  if (!notification) {
    return;
  }

  if (!mod.notifications_timeline.includes(signature)) {
    mod.notifications_timeline.push(signature);
  }

  resortNotificationTimeline(mod);
}

function removeFromNotificationTimeline(mod, signature) {
  mod.notifications_timeline = mod.notifications_timeline.filter((s) => s !== signature);
}

function resortNotificationTimeline(mod) {
  mod.notifications_timeline.sort((a, b) => {
    const notificationA = getNotification(mod, a);
    const notificationB = getNotification(mod, b);

    return (notificationB?.created_at || 0) - (notificationA?.created_at || 0);
  });
}

module.exports = {
  normalizeNotificationInput,
  getNotificationAggregateKey,
  getUnreadNotificationCount,
  markNotificationsViewed,
  updateNotificationBadge,
  ensureNotificationTweet,
  isKeyringContact,
  getInteractionTargetPublicKey,
  isOwnTweetInteraction,
  isReplyToOwnTweet,
  shouldNotify,
  addNotification,
  removeNotification,
  updateNotification,
  getNotification,
  hasNotification,
  insertNotificationTimeline,
  removeFromNotificationTimeline,
  resortNotificationTimeline
};
