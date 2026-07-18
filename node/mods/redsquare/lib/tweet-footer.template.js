module.exports = ({ replies = 0, retweets = 0, likes = 0 } = {}) => {
  return `
    <footer class="footer">
      <div class="controls saito-menu-select-subtle">
        <div class="tool comment" title="Reply/Comment">
          <span class="count">${replies}</span>
          <i class="far fa-comment"></i>
        </div>
        <div class="tool retweet" title="Retweet/Quote-tweet">
          <span class="count">${retweets}</span>
          <i class="fa fa-repeat"></i>
        </div>
        <div class="tool like" title="Like tweet">
          <span class="count">${likes}</span>
          <i class="far fa-heart"></i>
        </div>
        <div class="tool share" title="Copy link to tweet">
          <i class="fa-solid fa-share-nodes"></i>
        </div>
        <div class="tool more" title="More options">
          <i class="fa-solid fa-ellipsis"></i>
        </div>
      </div>
      <div class="show-more" role="button" tabindex="0">Show more posts</div>
    </footer>
  `;
};
