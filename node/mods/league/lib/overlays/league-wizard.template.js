module.exports = (app, mod, game_mod) => {
  let html = `

    <div class="league-wizard-overlay">
      <form>
        <div class="league-wizard-game-container">
          <div class="league-wizard-game-image"><img class="league-wizard-game-thumbnail" src="${
            game_mod.respondTo('arcade-games').image
          }"></div>
          <div class="leaguee-wizard-game-details  rs-create-game-desc-wrapper">
            <div class="league-wizard-game-name">
              <input type="text" class="saito-input" id="league-name" placeholder="Name your league..." />
            </div>
            <div class="league-wizard-game-description">
              <textarea class="saito-textarea" id="league-desc" placeholder="Describe your league..."></textarea>
            </div>
            <input type="text" class="saito-input" id="admin-contact" placeholder="contact info..."/>
          </div> 
        </div>

        <div class="league-wizard-game-controls">
  
          <div class="settings">
            <!--div class="overlay-input">
	             <select class="saito-form-select league-wizard-status-select" name="game-wizard-rankings-select">
              		<option value="public" selected="" default="">public</options>
              		<option value="private">private</options>
               </select>  
             </div-->
          </div>

          <div class="league-wizard-game-invite">
            <button type="submit" id="create-league-btn" class="saito-button-primary" data-type="public">Create New League</button>
	        </div>

       </div>
    </form>
  </div>
  `;

  return html;
};
