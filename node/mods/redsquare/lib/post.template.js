module.exports = (app, mod, post) => {
	let placeholder = "What's happening";

	let html = `

		<div class="tweet-overlay" id="${post.id}">
  			<div class="tweet-overlay-content">
    			<div class="tweet-overlay-header"></div>
    			<div id="post-tweet-img-preview-container" class="post-tweet-img-preview-container"></div>
  		     	<div class="saito-button-primary post-tweet-button" id="post-tweet-button" title="Pro-tip: ctrl+enter to submit">${post.type}</div>  
		    </div>

	        <input type="hidden" id="parent_id" name="parent_id" value="${post.parent_id}" />
	        <input type="hidden" id="thread_id" name="thread_id" value="${post.thread_id}" />
	        <input type="hidden" id="type" name="type" value="${post.type}" />

	        <section id="post-tweet-loader" class="post-tweet-loader">
	        	<span class="loading__anim"></span>
	        </section>
    	</div>
    `;

	return html;
};
