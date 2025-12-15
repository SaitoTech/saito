module.exports = (app, mod, tweet) => {
	let notice = tweet?.notice || '';

	// Extract hypertext-y mentions!
	let text = app.browser.markupMentions(tweet?.text || '');

	let identicon_src = app.keychain.returnIdenticon(tweet.tx.from[0].publicKey);
	let identicon_color = app.keychain.returnIdenticonColor(tweet.tx.from[0].publicKey);
	let curation_info = '';

	if (tweet.sources.length) {
		let source = tweet.sources[0];
		if (source?.type) {
			curation_info += ` data-source-type="${source.type}"`;
		}
		if (source?.node) {
			curation_info += ` data-source-node="${source.node}"`;
		}
	}
	curation_info += ` data-curated="${tweet.curated || 0}"`;

	if (app.modules.moderateAddress(mod.publicKey) && tweet.curation_check && tweet.curated == 0) {
		curation_info += ' data-check="1"';
	} else {
		tweet.curation_check = false;
	}

	if (!text && !notice && tweet.retweet_tx) {
		notice = 'retweeted by ' + app.browser.returnAddressHTML(tweet.tx.from[0].publicKey);
	}

	let is_liked_css = mod.liked_tweets.includes(tweet.tx.signature) ? 'liked' : '';

	let is_retweeted_css = mod.retweeted_tweets.includes(tweet.tx.signature) ? 'retweeted' : '';
	let is_replied_css = mod.replied_tweets.includes(tweet.tx.signature) ? 'replied' : '';

	let comment_count = tweet.num_replies;
	if (tweet.rethread) {
		comment_count = comment_count + tweet.tree_size - 1;
	}

	let controls = `
                <div class="tweet-tool tweet-tool-comment" title="Reply/Comment">
                  <span class="tweet-tool-comment-count ${is_replied_css}">${tweet.num_replies}</span>
                  <i class="far fa-comment ${is_replied_css}"></i>
                </div>
                <div class="tweet-tool tweet-tool-retweet" title="Retweet/Quote-tweet">
                	<span class="tweet-tool-retweet-count ${is_retweeted_css}">${tweet.num_retweets}</span>
                  <i class="fa fa-repeat ${is_retweeted_css}"></i>
                </div>
                <div class="tweet-tool tweet-tool-like" title="Like tweet">
		  						<span class="tweet-tool-like-count ${is_liked_css}">${tweet.num_likes}</span>
                  <div class="heart-bg">
                    <div class="heart-icon ${is_liked_css}"></div>
                  </div>
								</div>
                <div class="tweet-tool tweet-tool-share" title="Copy link to tweet">
                	<i class="fa fa-arrow-up-from-bracket"></i>
                </div>
								<div class="tweet-tool tweet-tool-more" title="More options">
									<i class="fa-solid fa-ellipsis"></i>
								</div>
	`;

	let html = `

	  <div class="tweet tweet-${tweet.tx.signature} ${tweet.reply_class}" data-id="${tweet.tx.signature}" ${curation_info}>
      <img class="tweet-avatar saito-add-user-menu" src="${identicon_src}" data-id="${tweet.tx.from[0].publicKey}" />
      <div class="tweet-body">
	      <div class="tweet-context">${notice}</div>
	      <div class="tweet-curation">${curation_info.replace(/data-/g, '<br>').substring(5)}</div>
        <div class="tweet-header"></div>
        <div class="tweet-text">${app.browser.sanitize(text, true)}</div>
	      <div class="tweet-image"></div>
	      <div class="tweet-retweet"></div>
	      <div class="tweet-preview"></div>

	`;
	if (tweet.youtube_id != null && tweet.youtube_id != 'null') {
		html += `<iframe class="youtube-embed" src="https://www.youtube.com/embed/${tweet.youtube_id}"></iframe>`;
	}

	if (tweet?.show_controls) {
		html += `<div class="tweet-controls saito-menu-select-subtle">${controls}</div>`;
	}

	if (tweet.curation_check) {
		controls = `
								<div class="tweet-tool saito-button-secondary" id="hide-spam" title="mark spam"><i class="fa-solid fa-xmark"></i></div>
								<div class="tweet-tool saito-button-secondary" id="approve-tweet" title="approve tweet"><i class="fa-solid fa-check"></i></div>
		`;

		html += `<div class="tweet-curation-controls">${controls}</div>`;
	}

	html += `
      </div>
    </div>
	`;

	return html;

	/****
	if (tweet.youtube_id != null && tweet.youtube_id != 'null') {
		html += `<iframe class="youtube-embed" src="https://www.youtube.com/embed/${tweet.youtube_id}"></iframe>`;
	} else {
		html += `<div class="tweet-preview tweet-preview-${tweet.tx.signature}"></div>`;
	}

	if (tweet?.show_controls) {
		html += controls;
	}

	html += `</div>
          </div>
        </div>
  `;
****/
};
