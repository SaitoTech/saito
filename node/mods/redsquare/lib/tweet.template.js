
module.exports = (app, mod, tweet) => {

	
	let notice = tweet?.notice || '';
	let text = tweet?.text || '';
	    text = app.browser.markupMentions(text);

	let curation_info = '';
	if (tweet.sources.length){
		let source = tweet.sources[0];
		if (source?.type) {
			curation_info += ` data-source-type="${source.type}"`;
		}
		if (source?.node) {
			curation_info += ` data-source-node="${source.node}"`;
		}
	}
	curation_info += ` data-curated="${tweet.curated || 0}"`;	

	if (!text && !notice && tweet.retweet_tx) {
		notice =
			'retweeted by ' +
			app.browser.returnAddressHTML(tweet.tx.from[0].publicKey);
	}

	let is_liked_css = mod.liked_tweets.includes(tweet.tx.signature)
		? 'liked'
		: '';

	let is_retweeted_css = mod.retweeted_tweets.includes(tweet.tx.signature)
		? 'retweeted'
		: '';
	let is_replied_css = mod.replied_tweets.includes(tweet.tx.signature)
		? 'replied'
		: '';

	let controls = `
              <div class="tweet-controls">
                <div class="tweet-tool tweet-tool-comment" title="Reply/Comment">
                  <span class="tweet-tool-comment-count ${is_replied_css}">${tweet.num_replies}</span> <i class="far fa-comment ${is_replied_css}"></i>
                </div>
                <div class="tweet-tool tweet-tool-retweet" title="Retweet/Quote-tweet"><span class="tweet-tool-retweet-count ${is_retweeted_css}">${tweet.num_retweets}</span>
                  <i class="fa fa-repeat ${is_retweeted_css}"></i>
                </div>
                <div class="tweet-tool tweet-tool-like" title="Like tweet">
		  <span class="tweet-tool-like-count ${is_liked_css}">${tweet.num_likes}</span>
		  <div class="tweet-like-button">
                    <div class="heart-bg">
                      <div class="heart-icon ${is_liked_css}"></div>
                    </div>
                  </div>
		</div>
                <div class="tweet-tool tweet-tool-share" title="Copy link to tweet"><i class="fa fa-arrow-up-from-bracket"></i></div>
		<div class="tweet-tool tweet-tool-more" title="More options"><i class="fa-solid fa-ellipsis"></i></div>
	      </div>
	`;

	let html = `

	  <div class="tweet tweet-${tweet.tx.signature} data-id="${tweet.tx.signature}" ${curation_info}>
            <div class="tweet-curation">${curation_info.replace(/data-/g, "<br>")}</div>
            <div class="tweet-avatar"></div>
            <div class="tweet-body">
	      <div class="tweet-context">${notice}</div>
              <div class="tweet-header">Lin <span>@lin_dev · 5h</span></div>
              <div class="tweet-text">${app.browser.sanitize("The thing people forget about decentralization is that it's not just about censorship resistance. It's also about systemic robustness and designing systems that incentivize long-term cooperation among participants. When protocol-level economics break, users flee. What Saito is doing — shifting costs and incentives to the data layer — is a profound realignment of what it means to *build* something public. It's not about just running code. It's about structuring economic flows in a way that sustains the commons and punishes rent-seeking. We need more conversations like this in Web3, and fewer VC slides.", true)}</div>
              <div class="tweet-footer">
                <div>💬 9</div>
                <div>🔁 12</div>
                <div>❤️ 57</div>
              </div>
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
