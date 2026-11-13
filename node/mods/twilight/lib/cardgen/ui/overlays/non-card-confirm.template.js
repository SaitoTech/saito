module.exports = () => `
  <div class="tscardgen-non-card-confirm saito-overlay-form retain-surface">
    <div class="saito-overlay-form-header">
      <div class="saito-overlay-form-header-title">Programmable Event</div>
    </div>
    <p class="tscardgen-modal-copy">
      This card won't be added to the deck. However, its code will remain available for other cards to call, as if this card had been evented.
    </p>
    <div class="tscardgen-modal-actions">
      <button type="button" class="saito-button-secondary" data-action="cancel">Cancel</button>
      <button type="button" class="saito-button-primary" data-action="confirm">Confirm</button>
    </div>
  </div>
`;
