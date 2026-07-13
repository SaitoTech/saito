module.exports = (notification, tweetHtml = '') => {
  let icon = 'fa-bell';

  if (notification.type === 'like') {
    icon = 'fa-heart';
  } else if (notification.type === 'reply') {
    icon = 'fa-comment';
  } else if (notification.type === 'retweet') {
    icon = 'fa-repeat';
  } else if (notification.type === 'mention') {
    icon = 'fa-at';
  }

  return `
    <article class="notification" data-id="${notification.signature}" data-tweet-id="${notification.tweet_signature}">
      <header class="notification-meta">
        <span class="notification-icon" aria-hidden="true">
          <i class="fa-solid ${icon}"></i>
        </span>
        <div class="notification-summary">
          <span class="notification-actor saito-address">${notification.actor_name}</span>
          <span class="notification-text">${notification.text}</span>
          <span class="notification-time saito-userline">${notification.time}</span>
        </div>
      </header>
      <div class="notification-tweet">
        ${tweetHtml}
      </div>
    </article>
  `;
};
