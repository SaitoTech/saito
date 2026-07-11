module.exports = (tweet) => {
  let images = '';

  if (tweet.images && tweet.images.length > 0) {
    let count = tweet.images.length > 1 ? ' tweet-images-grid' : '';
    images = `
      <div class="tweet-images${count}">
        ${tweet.images.map((img) => `<img src="${img}" alt="" />`).join('')}
      </div>
    `;
  }

  return `
    <article class="tweet">
      <img class="tweet-avatar" src="${tweet.user.avatar}" alt="${tweet.user.name}" />
      <div class="tweet-content">
        <div class="tweet-header">
          <span class="tweet-name">${tweet.user.name}</span>
          <span class="tweet-handle">@${tweet.user.handle}</span>
          <span class="tweet-dot">·</span>
          <span class="tweet-time">${tweet.time}</span>
        </div>
        <div class="tweet-body">
          <p class="tweet-text">${tweet.text}</p>
          ${images}
        </div>
        <div class="tweet-controls">
          <button class="tweet-control tweet-control-reply" type="button">
            <i class="fa-regular fa-comment"></i>
            <span>${tweet.replies}</span>
          </button>
          <button class="tweet-control tweet-control-retweet" type="button">
            <i class="fa-solid fa-retweet"></i>
            <span>${tweet.retweets}</span>
          </button>
          <button class="tweet-control tweet-control-like" type="button">
            <i class="fa-regular fa-heart"></i>
            <span>${tweet.likes}</span>
          </button>
          <button class="tweet-control tweet-control-share" type="button">
            <i class="fa-solid fa-arrow-up-from-bracket"></i>
          </button>
        </div>
      </div>
    </article>
  `;
};
