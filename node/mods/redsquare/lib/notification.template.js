module.exports = (notification, tweetHtml = '') => {
  let icon = 'fa-bell';

  if (notification.type === 'like') {
    icon = 'fa-heart';
  } else if (notification.type === 'reply') {
    icon = 'fa-comment';
  } else if (notification.type === 'retweet' || notification.type === 'quote') {
    icon = 'fa-repeat';
  }

  return `
    <article class="notification" data-id="${notification.signature}" data-tweet-id="${notification.tweet_signature}">
      <header class="meta">
        <span class="icon" aria-hidden="true">
          <i class="fa-solid ${icon}"></i>
        </span>
        <div class="summary">
          <span class="actor saito-address">${notification.actor_name}</span>
          <span class="text">${notification.text}</span>
          <span class="time saito-userline">${notification.time}</span>
        </div>
      </header>
      <div class="slot">
        ${tweetHtml}
      </div>
    </article>
  `;
};
