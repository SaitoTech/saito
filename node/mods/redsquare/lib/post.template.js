module.exports = (app, mod, post) => {
	let placeholder = "What's happening";

	let html = `

		<div class="tweet-overlay" id="${post.id}">
  			<div class="tweet-overlay-content">
    			<div class="tweet-overlay-header"></div>
    			<div id="post-tweet-img-preview-container" class="post-tweet-img-preview-container"></div>
				<button type="button" class="saito-button-primary fat post-tweet-button" id="post-tweet-button" title="Pro-tip: ctrl+enter to submit">${post.type}</button>
		    </div>

	        <section id="post-tweet-loader" class="post-tweet-loader">
	        	<span class="loading__anim"></span>
	        </section>
    	</div>
    `;

	return html;
};
