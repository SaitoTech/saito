module.exports = function gameCryptoSettingsTemplate(details) {
  return `
  <div class="saito-crypto-transfer game-crypto-settings-overlay" id="game-crypto-settings-root">
    <header class="game-crypto-settings-overlay__header">
      <h2 class="game-crypto-settings-overlay__title">Crypto Settings</h2>
    </header>

    <div class="game-crypto-settings-overlay__body">
      <div class="game-crypto-settings-overlay__setting-block">
        <label class="game-crypto-settings-overlay__setting">
          <input
            type="checkbox"
            id="game_crypto_settings_outbound"
            class="saito-checkbox"
            ${details.outboundTrusted ? 'checked' : ''}
          />
          <span class="game-crypto-settings-overlay__setting-label">Fast Outbound Payments</span>
        </label>
        <p class="game-crypto-settings-overlay__hint">
          Automatically authorize future in-game payments without showing the authorization overlay.
        </p>
      </div>

      <div class="game-crypto-settings-overlay__setting-block">
        <label class="game-crypto-settings-overlay__setting">
          <input
            type="checkbox"
            id="game_crypto_settings_inbound"
            class="saito-checkbox"
            ${details.inboundTrusted ? 'checked' : ''}
          />
          <span class="game-crypto-settings-overlay__setting-label">Fast Inbound Payments</span>
        </label>
        <p class="game-crypto-settings-overlay__hint">
          Automatically accept future in-game payments without requiring confirmation.
        </p>
      </div>
    </div>

    <footer class="game-crypto-settings-overlay__footer">
      <button type="button" class="saito-button-primary" id="game_crypto_settings_save">
        Save
      </button>
    </footer>
  </div>`;
};
