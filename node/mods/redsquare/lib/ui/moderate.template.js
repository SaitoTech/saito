module.exports = (moderate) => {
  const count = moderate.tweets?.length || 0;

  if (!count) {
    return '';
  }

  let items = '';

  for (const tweet of moderate.tweets) {
    const tweetHtml = typeof tweet.renderHTML === 'function' ? tweet.renderHTML('tweet') : '';

    items += `
      <div class="item" data-id="${tweet.signature}">
        ${tweetHtml}
        <div class="actions">
          <button type="button" class="saito-button-secondary small" data-action="approve" data-id="${tweet.signature}">
            Approve Tweet
          </button>
          <button type="button" class="saito-button-secondary small" data-action="delete" data-id="${tweet.signature}">
            Delete Tweet
          </button>
          <button type="button" class="saito-button-secondary small" data-action="ban" data-id="${tweet.signature}">
            Ban User
          </button>
        </div>
      </div>
    `;
  }

  return `
    <section class="moderate">
      <div class="header">
        <span class="title">Review Reports</span>
        <span class="count">${count}</span>
      </div>
      <div class="items">
        ${items}
      </div>
    </section>
  `;
};
