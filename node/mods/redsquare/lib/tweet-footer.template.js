module.exports = ({
  replies = 0,
  retweets = 0,
  likes = 0,
  liked = false,
  replied = false,
  retweeted = false
} = {}) => {
  const heart = 'M12 21S2 14.8 2 8.2C2 2.6 9 1.2 12 6C15 1.2 22 2.6 22 8.2C22 14.8 12 21 12 21Z';
  return `
    <footer class="footer">
      <div class="controls saito-menu-select-subtle">
        <div class="tool comment${replied ? ' replied' : ''}" title="Reply/Comment">
          <span class="count">${replies}</span>
          <i class="far fa-comment"></i>
        </div>
        <div class="tool retweet${retweeted ? ' retweeted' : ''}" title="Retweet/Quote-tweet">
          <span class="count">${retweets}</span>
          <i class="fa fa-repeat"></i>
        </div>
        <div class="tool like${liked ? ' liked' : ''}" title="Like tweet">
          <span class="count">${likes}</span>
          <span class="heart" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path class="fill" d="${heart}" />
              <path class="outline" d="${heart}" />
              <path class="pulse" d="${heart}" />
            </svg>
          </span>
        </div>
        <div class="tool share" title="Copy link to tweet">
          <i class="fa-solid fa-share-nodes"></i>
        </div>
        <div class="tool more" title="More options">
          <i class="fa-solid fa-ellipsis"></i>
        </div>
      </div>
      <div class="show-more" role="button" tabindex="0">Show more tweets</div>
    </footer>
  `;
};
