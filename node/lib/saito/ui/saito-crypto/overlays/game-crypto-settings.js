/**
 * In-game crypto payment preferences — opened from GameMenu on crypto-staked games.
 *
 * Reads/writes wallet preferences in app.options.gameprefs.
 * Absent preferences are treated as disabled (unchecked) in this UI.
 */

const GameCryptoSettingsTemplate = require('./game-crypto-settings.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class GameCryptoSettings {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
  }

  /**
   * Explicit wallet preference only. Missing / null → false (unchecked).
   */
  readWalletPref(key) {
    const pref = this.app.options?.gameprefs?.[key];
    if (pref === undefined || pref === null) {
      return false;
    }
    return !!pref;
  }

  render() {
    if (this.app?.browser?.addStylesheet) {
      this.app.browser.addStylesheet('/crypto/style.css');
    }

    this.overlay.show(
      GameCryptoSettingsTemplate({
        outboundTrusted: this.readWalletPref('crypto_transfers_outbound_trusted'),
        inboundTrusted: this.readWalletPref('crypto_transfers_inbound_trusted')
      })
    );

    const saveBtn = document.getElementById('game_crypto_settings_save');
    if (saveBtn) {
      saveBtn.onclick = () => {
        const outbound = document.getElementById('game_crypto_settings_outbound');
        const inbound = document.getElementById('game_crypto_settings_inbound');
        this.app.options.gameprefs = this.app.options.gameprefs || {};
        this.app.options.gameprefs.crypto_transfers_outbound_trusted = outbound?.checked ? 1 : 0;
        this.app.options.gameprefs.crypto_transfers_inbound_trusted = inbound?.checked ? 1 : 0;
        this.app.storage.saveOptions();
        this.overlay.close();
      };
    }
  }
}

module.exports = GameCryptoSettings;
