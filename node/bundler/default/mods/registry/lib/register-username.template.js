module.exports = (app, mod, msg) => {
	if (!msg) {
		msg = `Registering a username is free and makes it easier to engage socially on the network. You are currently being displayed as <em>${app.keychain.returnUsername(mod.publicKey)}</em>`;
	}
	return `
		<form id="register-username-template" class="saito-overlay-form"> 
      		<div class="saito-overlay-form-header">
        		<div class="saito-overlay-form-header-title">Register Username</div>
      		</div>
      		<div class="saito-overlay-form-text">${msg}</div>
          	<input type="text" id="saito-overlay-form-input" class="saito-overlay-form-input" autocomplete="off" placeholder="username@saito" value="" />
      		<div class="saito-button-row">
	   			<div id="login" class="saito-anchor"><span>or login/recover</span></div>
      			<button type="submit" class="saito-button-primary saito-overlay-form-submit" id="saito-overlay-submit">Register Username</button> 
    		</div>
		</form>
  `;
};
