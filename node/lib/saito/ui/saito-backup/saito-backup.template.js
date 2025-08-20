module.exports = (app, mod, this_self) => {
	return `
			<div id="saito-backup-overylay" class="saito-overlay-form saito-backup-container saito-overlay-backup-reminder">
		    <div class="saito-overlay-form-header">
		      <div class="saito-overlay-form-header-title">${this_self.title}</div>
		    </div>
	      <div class="saito-overlay-form-text">
	      	${this_self.msg}
	      </div>
              
	      <div class="saito-button-row">
	    		<div class="saito-anchor" id="saito-backup-manual"><span>no. backup manually</span></div>
	    		<div class="saito-button-primary" id="saito-backup-auto">yes, make it easy</div>
	    	</div>
	    </div>`;
};
