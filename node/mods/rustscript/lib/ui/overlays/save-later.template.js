const { buildSendPanelOverlay } = require('./send_panel.template');

module.exports = {
  saveOverlay({ scriptDisplay }) {
    const formFieldsHtml = `
      <div class="rs-save-later-copy">
        <p class="rs-save-later-lead">Please download this file to save your script.</p>
        <button type="button" class="rs-btn rs-btn-primary rs-save-later-download" data-action="save-later-download">
          Download Script
        </button>
        <p class="rs-save-later-note">Select Import Saved Script on the main page to use it.</p>
        <button type="button" class="saito-text-link rs-save-later-home" data-action="save-later-home">
          return to main page
        </button>
      </div>
    `;

    return buildSendPanelOverlay({
      extraRootClass: 'rs-save-later',
      scriptDisplay,
      formFieldsHtml,
      actionButtonHtml: ''
    });
  }
};
