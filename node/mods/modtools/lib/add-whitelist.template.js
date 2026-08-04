module.exports = (mod) => {
  return `
		<form id="register-whitelist-key-template" class="saito-overlay-form"> 
	      	<div class="saito-overlay-form-header">
	        	<div class="saito-overlay-form-header-title">Add Key to Peer Whitelist</div>
	      	</div>
	      	<label for="saito-overlay-form-input">Public key:</label>
	        <input type="text" id="saito-overlay-form-input" class="saito-input" autocomplete="off" placeholder="${mod.publicKey}" value="${mod.publicKey}" />
	        <label for="saito-overlay-form-password">Admin password:</label>
	        <input type="password" id="saito-overlay-form-password" class="saito-input" autocomplete="off" value="" />
		    <div class="saito-button-row">
          		<button type="button" class="saito-button-primary fat saito-overlay-form-submit" id="saito-overlay-submit">Submit</button> 
    	    </div>
		</form>
  `;
};
