const SaitoInputControls = require('./saito-input-controls.template');

module.exports = (input_self) => {
  const activeWindow =
    !input_self.open_tab || input_self.open_tab == 'emoji-window'
      ? 'emoji-window'
      : input_self.open_tab;

  // Chat: selection box participates in `.chat-popup` grid (above the footer/input).
  // Height comes from available grid space — no magic fixed offsets.
  if (input_self.display == 'small' || input_self.display == 'medium') {
    return `
  <div id="saito-input-selection-box" class="saito-input-selection-box saito-overlay-panel compact chat-anchored">
    <div class="selection-box-header">
      <div class="selection-box-search-wrap${activeWindow === 'emoji-window' ? '' : ' hidden'}">
        <input type="search" class="selection-box-emoji-search" placeholder="search" autocomplete="off" spellcheck="false" enterkeyhint="search" />
      </div>
      ${SaitoInputControls(input_self, activeWindow, { showClose: true })}
    </div>
    <div class="selection-box-window">
      <div class="selection-box-pane ${
        activeWindow == 'emoji-window' ? 'active-tab' : ''
      }" id="emoji-window"></div>
      <div class="selection-box-pane photo-window ${
        activeWindow == 'photo-window' ? 'active-tab' : ''
      }" id="photo-window">drag and drop an image or click to select one to upload</div>
      <div class="selection-box-pane ${
        activeWindow == 'gif-window' ? 'active-tab' : ''
      }" id="gif-window"></div>
    </div>
  </div>`;
  }

  // Large / composer: keep the existing body-level float near the mode tabs.
  let position = {};
  let reference;

  let si = document.querySelector(`${input_self.container} .saito-input .selection-box-tabs`);
  reference = si.getBoundingClientRect();
  position.top = reference.top;
  position.left = reference.right;

  let top = position.top;
  let bottom = window.innerHeight - top;
  let left = position.left;

  if (left + 360 > window.innerWidth) {
    left = window.innerWidth - 360;
  }

  if (window.innerWidth < 600) {
    console.warn('Readjusting for mobile display!');
    bottom = 0;
    top = window.innerHeight - reference.bottom;
  }

  return `
  <div id="saito-input-selection-box" class="saito-input-selection-box saito-overlay-panel compact" style="bottom:${bottom}px; left:${left}px; max-height:${top}px;">
    <div class="selection-box-window">
      <div class="selection-box-pane ${
        activeWindow == 'emoji-window' ? 'active-tab' : ''
      }" id="emoji-window"></div>
      <div class="selection-box-pane photo-window ${
        activeWindow == 'photo-window' ? 'active-tab' : ''
      }" id="photo-window">drag and drop an image or click to select one to upload</div>
      <div class="selection-box-pane ${
        activeWindow == 'gif-window' ? 'active-tab' : ''
      }" id="gif-window"></div>
    </div>
  </div>`;
};
