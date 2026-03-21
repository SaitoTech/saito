module.exports = (app, mod, data = {}) => {
	const escapeAttr = (value) =>
		('' + (value ?? ''))
			.replace(/"/g, '&quot;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');

	/**
	 * Renders the tweet component recursively.
	 *
	 * Depth rules:
	 * - depth 0: allow rendering ONE embedded tweet attachment from `tweetData.quoted`
	 * - depth 1+: do NOT recursively embed more tweets (prevent nesting explosions)
	 */
	const renderTweet = (tweetData, depth, opts = {}) => {
		const isEmbedded = !!opts.isEmbedded;

		const username = tweetData.username ?? 'User';
		const timestamp = tweetData.time ?? tweetData.timestamp ?? 'time';
		const text = tweetData.text ?? tweetData.body ?? 'Message content goes here';
		const media = tweetData.media ?? null;
		const link = tweetData.link ?? null;

		const hasParent = !isEmbedded && tweetData.hasParent ? 'has-parent' : '';
		const hasChild = !isEmbedded && tweetData.hasChild ? 'has-child' : '';
		const isParentFocus = !isEmbedded && tweetData.isParentFocus ? 'is-parent-focus' : '';
		const stateClasses = [hasParent, hasChild, isParentFocus].filter(Boolean).join(' ');

		let mediaHtml = '';
		if (media) {
			const safeMediaSrc = ('' + media).replace(/"/g, '&quot;');
			mediaHtml = `<img class="media-item" src="${safeMediaSrc}" alt="" loading="lazy" />`;
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

		// Embedded tweet attachment: use `tweetData.quoted` as payload.
		// Only render it at depth 0 to keep recursion bounded to 1.
		const quotedPayload = tweetData.quoted;
		const canRenderTweetAttachment =
			depth < 1 && quotedPayload && typeof quotedPayload === 'object';

		// Retweet meta:
		// - outer tweet only
		// - shown when this tweet is a retweet (has a quoted tweet payload)
		// - embedded tweets must NOT render their own retweet meta
		const retweetMetaUser = !isEmbedded && canRenderTweetAttachment ? quotedPayload?.username ?? null : null;

		let embeddedAttachmentHtml = '';
		if (canRenderTweetAttachment) {
			embeddedAttachmentHtml = `
        <div class="tweet__attachment tweet__attachment--tweet">
          ${renderTweet(quotedPayload, depth + 1, { isEmbedded: true })}
        </div>
      `;
		}

		const retweetMetaHtml =
			retweetMetaUser != null && retweetMetaUser !== ''
				? `<div class="tweet__retweet-meta">Retweeted by ${retweetMetaUser}</div>`
				: '';

		// Keep legacy classnames (`header`, `body`, `tweet-controls`) to prevent
		// top-level CSS regressions. New BEM classes provide the composable structure.
		const actionsHtml = isEmbedded
			? ''
			: `
  <div class="tweet__actions tweet-controls saito-menu-select-subtle">
    <div class="tweet-tool tweet-tool-comment" title="Reply/Comment">
      <span class="tweet-tool-comment-count">${tweetData.numReplies ?? 0}</span>
      <i class="far fa-comment"></i>
    </div>
    <div class="tweet-tool tweet-tool-retweet" title="Retweet/Quote-tweet">
      <span class="tweet-tool-retweet-count">${tweetData.numRetweets ?? 0}</span>
      <i class="fa fa-repeat"></i>
    </div>
    <div class="tweet-tool tweet-tool-like" title="Like tweet">
      <span class="tweet-tool-like-count">${tweetData.numLikes ?? 0}</span>
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
`;

		return `
<div class="saito-tweet tweet ${isEmbedded ? 'tweet--embedded' : ''} ${stateClasses}" data-id="${escapeAttr(tweetData.id)}">${retweetMetaHtml}<div class="tweet__header header">
    <div class="avatar"></div>
    <div class="user-block">
      <div class="username">${username}</div>
      <div class="meta">${timestamp}</div>
    </div>
  </div>

  <div class="tweet__body body">
    <div class="text">${text}</div>
    <div class="media">
      ${mediaHtml}
    </div>
    <div class="link-preview">
      ${linkHtml}
    </div>
    <div class="tweet__attachments ${embeddedAttachmentHtml ? 'tweet__attachments--tweet' : ''}">
      ${embeddedAttachmentHtml}
    </div>
  </div>

  ${actionsHtml}

</div>
`;
	};

	return renderTweet(data, 0, { isEmbedded: false, retweetMetaUser: null });
};
