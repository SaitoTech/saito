module.exports = (app, mod, data = {}) => {
	const username = data.username ?? 'User';
	const timestamp = data.time ?? data.timestamp ?? 'time';
	const text = data.text ?? data.body ?? 'Message content goes here';
	const media = data.media ?? null;
	const link = data.link ?? null;
	const hasParent = data.hasParent ? 'has-parent' : '';
	const hasChild = data.hasChild ? 'has-child' : '';
	const isParentFocus = data.isParentFocus ? 'is-parent-focus' : '';
	const stateClasses = [hasParent, hasChild, isParentFocus].filter(Boolean).join(' ');

	let mediaHtml = '';
	if (media) {
		mediaHtml = `<img class="media-item" src="${media}" alt="" loading="lazy" />`;
	}

	let linkHtml = '';
	if (link) {
		const safeUrl = ('' + link).replace(/"/g, '&quot;');
		linkHtml = `
      <a class="link-card" href="${safeUrl}" target="_blank" rel="noreferrer noopener">
        <div class="link-title">${safeUrl}</div>
      </a>
    `;
	}

	return `
<div class="saito-tweet ${stateClasses}" data-id="${(data.id ?? '').replace(/"/g, '&quot;')}">

  <div class="header">
    <div class="avatar"></div>
    <div class="user-block">
      <div class="username">${username}</div>
      <div class="meta">${timestamp}</div>
    </div>
  </div>

  <div class="body">
    <div class="text">${text}</div>
    <div class="media">
      ${mediaHtml}
    </div>
    <div class="link-preview">
      ${linkHtml}
    </div>
    <div class="quoted"></div>
  </div>

  <div class="tweet-controls saito-menu-select-subtle">
                <div class="tweet-tool tweet-tool-comment" title="Reply/Comment">
                  <span class="tweet-tool-comment-count">${data.numReplies ?? 0}</span>
                  <i class="far fa-comment"></i>
                </div>
                <div class="tweet-tool tweet-tool-retweet" title="Retweet/Quote-tweet">
                	<span class="tweet-tool-retweet-count">${data.numRetweets ?? 0}</span>
                  <i class="fa fa-repeat"></i>
                </div>
                <div class="tweet-tool tweet-tool-like" title="Like tweet">
		  						<span class="tweet-tool-like-count">${data.numLikes ?? 0}</span>
                  <div class="heart-bg">
                    <div class="heart-icon"></div>
                  </div>
								</div>
                <div class="tweet-tool tweet-tool-share" title="Copy link to tweet">
                	<i class="fa fa-arrow-up-from-bracket"></i>
                </div>
								<div class="tweet-tool tweet-tool-more" title="More options">
									<i class="fa-solid fa-ellipsis"></i>
								</div>
  </div>

</div>
  `;
};
