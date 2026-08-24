module.exports = (app, mod) => {
  let html = `
			<div id="modtools-settings" class="saito-module-settings">
	`;

  let server_c = '';
  let friends_c = '';
  let custom_c = '';
  let none_c = '';

  if (mod.permissions.mode == 'none') {
    none_c = 'checked';
  }
  if (mod.permissions.mode == 'server' || mod.permissions.mode == 'public') {
    server_c = 'checked';
  }
  if (mod.permissions.mode == 'friends') {
    friends_c = 'checked';
  }
  if (mod.permissions.mode == 'custom') {
    custom_c = 'checked';
  }

  html += `

            <fieldset class="saito-grid">
            	<legend class="settings-label">Who Moderates:</legend>

            	<input class="saito-radio" type="radio" id="none_mod" name="who_moderates" value="none_mod" ${none_c}>
            	<label for="none_mod">Me <span class="note">- I handle my own moderation</span></label>

            	<input class="saito-radio" type="radio" id="custom_mod" name="who_moderates" value="custom_mod" ${custom_c}>
            	<label for="custom_mod">Custom <span class="note">- selected accounts from my friends and contacts</span></label>

            	<input class="saito-radio" type="radio" id="friends_mod" name="who_moderates" value="friends_mod" ${friends_c}>
            	<label for="friends_mod">Friends <span class="note">- my friends and contacts</span></label>

            	<input class="saito-radio" type="radio" id="server_mod" name="who_moderates" value="server_mod" ${server_c}>
            	<label for="server_mod">Server <span class="note">- accept moderation lists from the server I am connected to</span></label>

            </fieldset>

	`;

  //        if (app.options.modtools.whitelist.length > 0){
  html += `<fieldset id="whitelisted-accounts" class="saito-grid settings-link">
                <i class="fa-regular fa-face-smile-beam"></i>
                <label>Manage Whitelisted Accounts (${app.options.modtools.whitelist.length})</label>
                <div id="add-whitelist" class="saito-grid-extra-button saito-button-secondary">Add</div>
                </fieldset>`;
  //        }

  //        if (app.options.modtools.blacklist.length > 0){
  html += `<fieldset id="blacklisted-accounts" class="saito-grid settings-link">
                <i class="fa-solid fa-ban"></i>
                <label>Manage Blocked Accounts (${app.options.modtools.blacklist.length})</label>
                </fieldset>`;

  /*html += `
                <fieldset id="modtools-apps" class="saito-grid">
	            	<legend class="settings-label">App Permissions:</legend>
	            	<div class="modtools-app-permissions" id="modtools-app-permissions">
					</div>

					<div class="add-new-permission-box" id="add-new-permission-box"></div>
					<div class="saito-button-primary small" id="modtools-apps-add-new">+</div>
                </fieldset>`;
                */
  //        }

  html += `
			</div>
	`;

  return html;
};
