module.exports = (app, mod) => {
	let curated_css = '';
	let uncurated_css = '';
	let parent_css = '';

	if (mod.curated == true) {
		curated_css = 'active';
		uncurated_css = 'active-left';
	} else {
		curated_css = '';
		uncurated_css = 'active';
		parent_css = 'active-right';
	}

	let html = `
		<div id="redsquare-settings" class="redsquare-settings saito-module-settings">
            		<fieldset class="saito-grid" style="margin-top:0">
            			<legend class="settings-label">Moderation:</legend>
				<div style="
    					grid-column: span 2;
    					padding: 2.4rem;
    					line-height: 3rem;
				">
					Blacklist users to remove their tweets. Whitelist users to 
					ensure their tweets show up. Unless you have whitelisted an 
					account, your browser will also respect the filtering-preferences of
					your friends on the network.
				</div>
		                <i class="fa-regular fa-circle-check"></i>
        		        
        		        <label>Redsquare Feed</label>
		        	<div id="curation-toggle" class="toggle-switch ${parent_css} saito-grid-extra-button">
          				<div class="toggle-option ${curated_css}" data-view="curated">Curated</div>
          				<div class="toggle-option ${uncurated_css}" data-view="unfiltered">Unfiltered</duv>
        			</div>
				
            		</fieldset>
	`;

	if (app.options.modtools.whitelist) {
		html += `
			<fieldset id="whitelisted-accounts" class="saito-grid settings-link">
		                <i class="fa-regular fa-face-smile-beam"></i>
        		        <label>Manage Whitelisted Accounts (${app.options.modtools.whitelist.length})</label>
                		<div id="add-whitelist" class="saito-grid-extra-button saito-button-secondary">Add</div>
               		</fieldset>
			`;
	}
	if (app.options.modtools.blacklist) {
		html += `
                	<fieldset id="blacklisted-accounts" class="saito-grid settings-link" style="margin-bottom:0">
                		<i class="fa-solid fa-ban"></i>
                		<label>Manage Blocked Accounts (${app.options.modtools.blacklist.length})</label>
                	</fieldset>
			`;
	}
	html += `
		</div>
	`;

	return html;
};
