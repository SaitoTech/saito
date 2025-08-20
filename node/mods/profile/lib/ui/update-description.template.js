module.exports = (description) => {
	return `
		<form > 
      	    <div class="saito-overlay-form update-description-overlay">
		        <div class="saito-overlay-form-header">
		          <div class="saito-overlay-form-header-title">Update Description</div>
		        </div>
	            <textarea id="saito-overlay-form-input" class="post-tweet-textarea text-input" placeholder="Tell us about yourself">${description}</textarea>  
                <!--input type="text" id="saito-overlay-form-input" class="saito-overlay-form-input" autocomplete="off" placeholder="" value="${description}" /-->
	      <div class="saito-button-row">
          <button type="submit" class="saito-button-primary fat saito-overlay-form-submit" id="saito-overlay-submit">Update</button> 
        </div>
      </div>
		</form>
  `;
};
