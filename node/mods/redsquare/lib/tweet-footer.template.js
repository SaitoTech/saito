module.exports = ({ presentation = 'timeline', replies = 0, retweets = 0, likes = 0 } = {}) => {
  return `
    <footer class="tweet-footer ${presentation}">
      <div class="tweet-controls saito-menu-select-subtle">
        <div class="tweet-tool tweet-tool-comment" title="Reply/Comment">
          <span class="tweet-tool-comment-count">${replies}</span>
          <i class="far fa-comment"></i>
        </div>
        <div class="tweet-tool tweet-tool-retweet" title="Retweet/Quote-tweet">
          <span class="tweet-tool-retweet-count">${retweets}</span>
          <i class="fa fa-repeat"></i>
        </div>
        <div class="tweet-tool tweet-tool-like" title="Like tweet">
          <span class="tweet-tool-like-count">${likes}</span>
          <i class="far fa-heart"></i>
        </div>
        <div class="tweet-tool tweet-tool-share" title="Copy link to tweet">
          <i class="fa-solid fa-share-nodes"></i>
        </div>
        <div class="tweet-tool tweet-tool-more" title="More options">
          <i class="fa-solid fa-ellipsis"></i>
        </div>
      </div>
      <div class="tweet-show-more" role="button" tabindex="0">Show more posts</div>
    </footer>
  `;
};
