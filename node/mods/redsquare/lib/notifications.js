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
  if (!notification || notification.type !== 'like') {
    return '';
  }

  if (!notification.actor_publicKey || !notification.tweet_signature) {
    return '';
  }

  return `like:${notification.actor_publicKey}:${notification.tweet_signature}`;
}

function getUnreadNotificationCount(mod) {
  return mod.notifications_unread_count || 0;
}

function incrementUnreadNotifications(mod, notification) {
  if (!notification || notification.unread === false) {
    return;
  }

  mod.notifications_unread_count += 1;
}

function markNotificationsViewed(mod) {
  mod.notifications_unread_count = 0;
  mod.notifications_last_viewed_ts = Date.now();

  for (const signature of mod.notifications_timeline) {
    const notification = getNotification(mod, signature);

    if (notification) {
      notification.unread = false;
    }
  }

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

function aggregateLikeNotification(mod, existing, incoming) {
  existing.count = (existing.count || 1) + 1;
  existing.created_at = Math.max(existing.created_at || 0, incoming.created_at || 0);
  existing.time = mod.app.browser.formatRelativeTime(existing.created_at);
  existing.refreshActionText();
  resortNotificationTimeline(mod);
  return existing;
}

function addNotification(mod, input) {
  const notification = normalizeNotificationInput(mod, input);

  if (!notification || !notification.signature || !notification.tweet_signature) {
    return null;
  }

  ensureNotificationTweet(mod, notification);

  if (!Tweets.hasTweet(mod, notification.tweet_signature)) {
    return null;
  }

  const aggregateKey = getNotificationAggregateKey(mod, notification);

  if (aggregateKey && mod.notifications_aggregate[aggregateKey]) {
    const existing = getNotification(mod, mod.notifications_aggregate[aggregateKey]);

    if (existing) {
      return aggregateLikeNotification(mod, existing, notification);
    }
  }

  if (hasNotification(mod, notification.signature)) {
    return updateNotification(mod, input);
  }

  mod.notifications[notification.signature] = notification;
  insertNotificationTimeline(mod, notification.signature);

  if (aggregateKey) {
    mod.notifications_aggregate[aggregateKey] = notification.signature;
  }

  incrementUnreadNotifications(mod, notification);
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

  if (notification?.unread) {
    mod.notifications_unread_count = Math.max(0, mod.notifications_unread_count - 1);
    updateNotificationBadge(mod);
  }

  removeFromNotificationTimeline(mod, signature);
  delete mod.notifications[signature];

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

  existing.parseFromData({
    signature: notification.signature,
    tweet_signature: notification.tweet_signature,
    type: notification.type,
    actor_publicKey: notification.actor_publicKey,
    actor_name: notification.actor_name,
    actor_avatar: notification.actor_avatar,
    text: notification.text,
    count: notification.count,
    created_at: notification.created_at,
    time: notification.time,
    unread: existing.unread
  });

  if (notification.tx) {
    existing.tx = notification.tx;
  }

  existing.refreshActionText();
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

function isAddressedToUser(mod, tx) {
  if (!tx || !mod.publicKey) {
    return false;
  }

  if (typeof tx.isTo === 'function') {
    return tx.isTo(mod.publicKey);
  }

  if (Array.isArray(tx.to)) {
    return tx.to.some((slip) => slip?.publicKey === mod.publicKey);
  }

  return false;
}

module.exports = {
  normalizeNotificationInput,
  getNotificationAggregateKey,
  getUnreadNotificationCount,
  incrementUnreadNotifications,
  markNotificationsViewed,
  updateNotificationBadge,
  ensureNotificationTweet,
  aggregateLikeNotification,
  addNotification,
  removeNotification,
  updateNotification,
  getNotification,
  hasNotification,
  insertNotificationTimeline,
  removeFromNotificationTimeline,
  resortNotificationTimeline,
  isAddressedToUser
};
