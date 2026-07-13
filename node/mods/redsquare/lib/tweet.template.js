module.exports = (tweet, className = 'tweet') => {
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
    <article class="${className}" data-id="${tweet.signature}">
      <img class="tweet-avatar saito-identicon" src="${tweet.avatar}" alt="${tweet.username}" />
      <div class="tweet-body">
        <div class="tweet-header">
          <span class="saito-address">${tweet.username}</span>
          <span class="saito-userline">${tweet.time}</span>
        </div>
        <div class="tweet-text">${tweet.text}</div>
        ${images}
        <div class="tweet-controls saito-menu-select-subtle">
          <div class="tweet-tool tweet-tool-comment" title="Reply/Comment">
            <span class="tweet-tool-comment-count">${tweet.replies}</span>
            <i class="far fa-comment"></i>
          </div>
          <div class="tweet-tool tweet-tool-retweet" title="Retweet/Quote-tweet">
            <span class="tweet-tool-retweet-count">${tweet.retweets}</span>
            <i class="fa fa-repeat"></i>
          </div>
          <div class="tweet-tool tweet-tool-like" title="Like tweet">
            <span class="tweet-tool-like-count">${tweet.likes}</span>
            <i class="far fa-heart"></i>
          </div>
          <div class="tweet-tool tweet-tool-share" title="Copy link to tweet">
            <i class="fa-solid fa-share-nodes"></i>
          </div>
          <div class="tweet-tool tweet-tool-more" title="More options">
            <i class="fa-solid fa-ellipsis"></i>
          </div>
        </div>
      </div>
    </article>
  `;
};
