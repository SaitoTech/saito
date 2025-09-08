module.exports = (description) => {
	return `
		<form class="saito-overlay-form update-description-overlay"> 
	        <div class="saito-overlay-form-header">
	          <div class="saito-overlay-form-header-title">Update Description</div>
	        </div>
            <textarea id="saito-overlay-form-input" class="post-tweet-textarea text-input" placeholder="Tell us about yourself">${description}</textarea>  
	      	<div class="saito-button-row">
          		<button type="submit" class="saito-button-primary saito-overlay-form-submit" id="saito-overlay-submit">Update</button> 
        	</div>
		</form>
  `;
};
