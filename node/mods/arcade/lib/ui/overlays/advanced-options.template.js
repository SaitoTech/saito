module.exports = (content_html = '', title = 'Advanced Options') => {
  return `
    <div id="advanced-options-overlay-container" class="saito-overlay-form retain-surface">
      <div class="saito-overlay-form-header">
        <div class="saito-overlay-form-header-title">${title}</div>
      </div>
      <div class="advanced-options-body">
        ${content_html}
      </div>
      <div class="saito-button-row">
        <button type="button" id="game-wizard-advanced-return-btn" class="game-wizard-advanced-return-btn saito-button-primary">
          Submit
        </button>
      </div>
    </div>
  `;
};
