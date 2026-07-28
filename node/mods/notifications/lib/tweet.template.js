module.exports = (tweet) => {
  const bridge_down = tweet.tx && tweet.tx.msg && tweet.tx.msg.bridge_down;
  const threadClasses = `${tweet.parent_id ? ' has_parent' : ''}${bridge_down ? ' has_child' : ''}`;
  const media_block =
    tweet.media.length > 0
      ? `<div class="media">${tweet.media
          .map((src) => `<img src="${src}" alt="" loading="lazy" />`)
          .join('')}</div>`
      : '';
  const link_block = tweet.link
    ? `<div class="link"><a href="${tweet.link}" target="_blank" rel="noreferrer noopener">${tweet.link}</a></div>`
    : '';

  return `
    <div class="tweet${threadClasses}" data-id="${tweet.signature}">
      <div class="header">
        <div class="avatar"></div>
        <div class="user">
          <div class="username">${tweet.username}</div>
          <div class="meta">${tweet.time}</div>
        </div>
      </div>

      <div class="body">
        <div class="text">${tweet.text}</div>
        ${media_block}
        ${link_block}
      </div>

      <div class="controls">
        <div class="reply" title="Reply/Comment">
          <span class="count">${tweet.num_replies}</span>
          <i class="far fa-comment" aria-hidden="true"></i>
        </div>
        <div class="repost" title="Retweet/Quote-tweet">
          <span class="count">0</span>
          <i class="fa fa-repeat" aria-hidden="true"></i>
        </div>
        <div class="like" title="Like tweet">
          <span class="count">${tweet.num_likes}</span>
          <div aria-hidden="true"></div>
        </div>
        <div class="share" title="Copy link to tweet">
          <i class="fa fa-arrow-up-from-bracket" aria-hidden="true"></i>
        </div>
        <div class="more" title="More options">
          <i class="fa-solid fa-ellipsis" aria-hidden="true"></i>
        </div>
      </div>
    </div>
  `;
};
