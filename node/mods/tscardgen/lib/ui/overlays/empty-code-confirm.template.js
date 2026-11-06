module.exports = () => `
  <div class="tscardgen-empty-code saito-overlay-form retain-surface">
    <div class="saito-overlay-form-header">
      <div class="saito-overlay-form-header-title">No card code</div>
    </div>
    <p class="tscardgen-empty-code-lead">
      <strong>This card doesn't have any code or functionality, so it won't be playable in a real game.</strong>
    </p>
    <p class="tscardgen-empty-code-copy">
      Would you like to add the code that makes it work in a game?
    </p>
    <div class="tscardgen-empty-code-actions">
      <button type="button" class="saito-button-secondary" data-action="create-without-code">
        Create Without Code
      </button>
      <button type="button" class="saito-button-primary" data-action="add-code">
        Add Code
      </button>
    </div>
  </div>
`;
