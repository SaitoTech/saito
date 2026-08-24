module.exports = function gameCryptoSettingsTemplate(details) {
  return `
  <form class="saito-overlay-form game-crypto-settings-overlay" id="game-crypto-settings-root">
    <header class="saito-overlay-form-header">
      <h2 class="saito-overlay-form-header-title">Crypto Settings</h2>
    </header>

    <div class="game-crypto-settings-overlay__body">
      <div class="game-crypto-settings-overlay__setting-block">
        <label class="game-crypto-settings-overlay__setting" for="game_crypto_settings_outbound">
          <input
            type="checkbox"
            id="game_crypto_settings_outbound"
            class="saito-checkbox"
            ${details.outboundTrusted ? 'checked' : ''}
          />
          <span class="game-crypto-settings-overlay__setting-label">Fast Outbound Payments</span>
        </label>
        <p class="game-crypto-settings-overlay__hint">
          Automatically authorize future in-game transfers without showing the authorization overlay.
        </p>
      </div>

      <div class="game-crypto-settings-overlay__setting-block">
        <label class="game-crypto-settings-overlay__setting" for="game_crypto_settings_inbound">
          <input
            type="checkbox"
            id="game_crypto_settings_inbound"
            class="saito-checkbox"
            ${details.inboundTrusted ? 'checked' : ''}
          />
          <span class="game-crypto-settings-overlay__setting-label">Fast Inbound Payments</span>
        </label>
        <p class="game-crypto-settings-overlay__hint">
          Automatically accept future in-game transfers without requiring confirmation.
        </p>
      </div>
    </div>

    <div class="saito-button-row game-crypto-settings-overlay__actions">
      <button type="button" class="saito-button-primary" id="game_crypto_settings_save">
        Save
      </button>
    </div>
  </form>`;
};
