/**
 * Game-specific outbound crypto payment authorization overlay.
 *
 * Listens for: saito-game-crypto-send-auth-open-request
 *
 * If `details.trusted` is true, mycallback is invoked immediately (no UI).
 * Otherwise the overlay appears and waits for explicit user authorization.
 *
 * This component deliberately has NO close/dismiss/cancel controls.
 * The game remains halted until the player authorizes the payment.
 */

const GameSendAuthTemplate = require('./game-send-auth.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');
const SaitoUser = require('./../../saito-user/saito-user');

class GameSendAuth {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);

    this.app.connection.on('saito-game-crypto-send-auth-open-request', (details) => {
      this.handleRequest(details);
    });
  }

  handleRequest(details) {
    if (!details?.ticker || !details?.amount || !details?.mycallback) {
      console.error('GameSendAuth: missing required fields', details);
      return;
    }

    if (details.trusted) {
      details.mycallback();
      return;
    }

    this.render(details);
  }

  render(details) {
    // Determine checkbox default: checked for first encounter (absent preference),
    // reflects stored preference thereafter
    let pref = this.app.options?.gameprefs?.crypto_transfers_outbound_trusted;
    // absent/undefined → first encounter → checked by default
    // explicitly 0/false → user previously unchecked → unchecked
    let checkboxDefault = (pref === undefined || pref === null) ? true : !!pref;
    details.trusted = checkboxDefault;

    this.overlay.show(GameSendAuthTemplate(details));
    this.overlay.blockClose();

    const counterParty = new SaitoUser(
      this.app,
      this.mod,
      '#game-send-auth-root .counterparty-details'
    );
    if (details.publicKey) {
      counterParty.publicKey = details.publicKey;
      counterParty.render();
      counterParty.updateUserlineAddress(details.publicKey);
    }

    const btn = document.getElementById('game_send_auth_authorize');
    if (btn) {
      btn.onclick = () => {
        const checkbox = document.getElementById('game_send_auth_auto_issue');
        this.app.options.gameprefs = this.app.options.gameprefs || {};
        if (checkbox && checkbox.checked) {
          this.app.options.gameprefs['crypto_transfers_outbound_trusted'] = 1;
        } else {
          this.app.options.gameprefs['crypto_transfers_outbound_trusted'] = 0;
        }
        this.app.storage.saveOptions();

        this.overlay.remove();
        details.mycallback();
      };
    }
  }
}

module.exports = GameSendAuth;
