module.exports = () => {
	return `
    <form id="backup-template" class="saito-overlay-auto-backup saito-overlay-form">
        <div class="saito-overlay-form-header">
          <div class="saito-overlay-form-header-title" id="saito-overlay-form-header-title">EASY ACCOUNT RECOVERY</div>
        </div>
        <!--div class="saito-overlay-form-text"></div-->
        <div class="saito-overlay-subform">
         
          <div class="saito-overlay-form-subtext">
          	Provide an email address and password to enable Account Recovery. 
          	Your browser will use this information to encrypt your wallet, and email you an encrypted copy.
          </div>
         
          <div class="saito-overlay-subform-inputs">
            <input type="email" id="saito-overlay-form-input" class="saito-input saito-overlay-form-email" placeholder="address@domain.com" value="" />
            <input type="text" id="saito-overlay-form-input" class="saito-input saito-overlay-form-password saito-password" placeholder="password" value="" />
          </div>
      	
      		<div class="saito-overlay-form-checkbox-container">	
	      		<input type="checkbox" class="saito-checkbox saito-overlay-subform-checkbox" checked />
	      		<div class="saito-overlay-subform-text">
	      			save an encrypted copy on-chain, 
	      			so I can recover my account quickly and easily on any device
	      		</div>
      		</div>
	        <div class="saito-button-row">
	          <div class="saito-anchor" id="saito-backup-manual"><span>download my wallet</span></div>
	          <button type="submit" class="saito-button-primary saito-overlay-form-submit" id="saito-overlay-submit">Encrypt & Backup</button>
	        </div>
	      </div>
    </form>
  `;
};
