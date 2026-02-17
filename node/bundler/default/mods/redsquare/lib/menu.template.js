module.exports = (app, mod) => {
	let html = `

 	    <ul class="redsquare-menu saito-menu-select-subtle">
		<li class="item redsquare-menu-home">
	            <i class="fas fa-house"></i>
	            <span>Home</span>
		</li>
		<li class="item redsquare-menu-notifications">
	            <i class="fas fa-bell"></i>
	            <span>Notifications</span>
		</li>
		<li class="item redsquare-menu-profile">
	            <i class="fas fa-user"></i>
	            <span>Profile</span>
		</li>
	`;
	if (app.modules.returnModulesRespondingTo('saito-moderation-core')?.length) {
		html += `
		<li class="item redsquare-menu-settings">
        	    <i class="fas fa-cog"></i>
        	    <span>Settings</span>
        	  </li>
	  `;
	}
	if (mod.debug) {
		html += ` 
		<li class="item redsquare-menu-help">
        	    <i class="fa-solid fa-question"></i>
        	    <span>Debug</span>
        	  </li>

		`;
	}

	html += `
          </ul>
          <button class="tweet-button">
          	<i class="redsquare-tweet-icon fa-solid fa-pen"></i>
			<span>Post</span>
		  </button>
  	`;

	return html;
};
