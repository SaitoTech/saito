module.exports = (mod) => `
  <div class="saito-modal videocall-setting-grid-item videocall-settings-modal">
    <div class="saito-modal-title">${mod.returnName()} Settings</div>
    <div class="saito-modal-content videocall-settings-content">
      <fieldset class="videocall-settings-group videocall-layout-options">
        <legend class="videocall-settings-heading">Video Call Layout</legend>
        ${[
          ['focus', 'users-viewfinder', 'Focus'],
          ['gallery', 'table-cells', 'Gallery'],
          ['speaker', 'user', 'Speaker']
        ]
          .map(
            ([value, icon, label]) => `
          <label class="videocall-settings-option">
            <input class="saito-radio videocall-option-input" type="radio"
              name="videocall-option-input" value="${value}" ${mod.layout === value ? 'checked' : ''}>
            <i class="fa-solid fa-${icon}" aria-hidden="true"></i>
            <span>${label}</span>
          </label>`
          )
          .join('')}
      </fieldset>
    </div>
  </div>`;
