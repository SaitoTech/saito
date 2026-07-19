const VideoCallSettingsTemplate = (mod, app) => {

  let display_mode = mod.layout;

	let html = `
            <div class="saito-modal saito-modal-menu videocall-setting-grid-item videocall-settings-modal" id="saito-user-menu">
               <div class="saito-modal-title">${mod.returnName()} Settings</div>
               <div class="saito-modal-content videocall-settings-content">

                <fieldset class="saito-grid videocall-layout-options">
                  <legend class="settings-label videocall-settings-heading">Video Call Layout</legend>
                    <input id="videocall-option-input-focus" ${
                        display_mode === 'focus' ? `checked` : ``
                      } type="radio" value="focus"
                      name="videocall-option-input" class="saito-radio videocall-option-input">

                    <label class="videocall-option-label ${display_mode === 'focus' ? `active` : ``}" for="videocall-option-input-focus">
                      <i class="fa-solid fa-users-viewfinder"></i>
                      <div>Focus</div>
                    </label>

                    <input id="videocall-option-input-gallery" ${
                        display_mode === 'gallery' ? `checked` : ``
                      } type="radio" value="gallery"
                      name="videocall-option-input" class="saito-radio videocall-option-input">

                    <label class="videocall-option-label ${
                      display_mode === 'gallery' ? `active` : ``
                    }" for="videocall-option-input-gallery">

                      <i class="fa-solid fa-table-cells"></i>
                      <div>Gallery</div>
                    </label>

                    <input id="videocall-option-input-speaker" ${
                        display_mode === 'speaker' ? `checked` : ``
                      } type="radio" value="speaker"
                      name="videocall-option-input" class="saito-radio videocall-option-input">
                    <label class="videocall-option-label ${
                      display_mode === 'speaker' ? `active` : ``
                    }" for="videocall-option-input-speaker">

                      <i class="fa-solid fa-user"></i>
                      <div>Speaker</div>
                    </label>
                </fieldset>  
                
               </div>
             </div>
         
      `;

	return html;
};

module.exports = VideoCallSettingsTemplate;
