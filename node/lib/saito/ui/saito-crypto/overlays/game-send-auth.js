/**
 * Game-specific outbound crypto payment authorization overlay.
 *
 * Listens for: saito-game-crypto-send-auth-open-request
 *
 * If `details.trusted` is true, mycallback is invoked immediately (no UI).
 * Otherwise the overlay appears and waits for explicit user authorization.
 *
 * After a successful payment (`saito-crypto-send-confirm` with hash), opens a
 * UI-only SaitoTransactionMonitor hosted on wallet.saitoCrypto. Does not touch
 * the game queue, halted, or restartQueue.
 *
 * This component deliberately has NO close/dismiss/cancel controls.
 * The game remains halted until the player authorizes the payment.
 */

const GameSendAuthTemplate = require('./game-send-auth.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class GameSendAuth {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);

    this.app.connection.on('saito-game-crypto-send-auth-open-request', (details) => {
      this.handleRequest(details);
    });
  }

  /**
   * First-time / absent preference → checked (opt-in invitation).
   * After the user has saved a value → reflect that stored preference.
   */
  readOutboundCheckboxDefault() {
    const pref = this.app.options?.gameprefs?.crypto_transfers_outbound_trusted;
    if (pref === undefined || pref === null) {
      return true;
    }
    return !!pref;
  }

  /**
   * Lazy-create a single monitor hosted on the SAITO crypto module (not the game).
   */
  ensureTransactionMonitor() {
    const host = this.app.wallet?.saitoCrypto;
    if (!host) {
      console.error('GameSendAuth: wallet.saitoCrypto is not available');
      return null;
    }
    if (!host.transaction_monitor) {
      const SaitoTransactionMonitor = require('../../saito-transaction-monitor/saito-transaction-monitor');
      host.transaction_monitor = new SaitoTransactionMonitor(this.app, host);
    }
    return host.transaction_monitor;
  }

  /**
   * Register one-shot success listener, then invoke the existing payment callback.
   * Payment hash comes from saito-crypto-send-confirm (emitted by the SEND path).
   */
  invokePaymentCallback(mycallback) {
    const onConfirm = (robj) => {
      if (robj?.err || !robj?.hash) {
        return;
      }
      try {
        const monitor = this.ensureTransactionMonitor();
        if (!monitor) {
          return;
        }
        monitor.render({
          tx: { signature: robj.hash },
          title: 'Payment Sent',
          lead: 'Waiting for opponent to acknowledge receipt...',
          subtitle: '',
          auto_continue_on_confirm: true,
          callback: () => {}
        });
      } catch (err) {
        console.error('GameSendAuth: failed to open transaction monitor', err);
      }
    };

    this.app.connection.once('saito-crypto-send-confirm', onConfirm);
    mycallback();
  }

  handleRequest(details) {
    if (!details?.ticker || !details?.amount || !details?.mycallback) {
      console.error('GameSendAuth: missing required fields', details);
      return;
    }

    if (details.trusted) {
      this.invokePaymentCallback(details.mycallback);
      return;
    }

    this.render(details);
  }

  render(details) {
    const publicKey = details.publicKey || details.address || '';
    details.trusted = this.readOutboundCheckboxDefault();
    details.partyName = escapeHtml(this.app.keychain.returnUsername(publicKey));
    details.partyKey = escapeHtml(publicKey);

    this.overlay.show(GameSendAuthTemplate(details));
    this.overlay.blockClose();

    const btn = document.getElementById('game_send_auth_authorize');
    if (btn) {
      btn.onclick = () => {
        const checkbox = document.getElementById('game_send_auth_auto_issue');

        this.app.options.gameprefs = this.app.options.gameprefs || {};
        this.app.options.gameprefs.crypto_transfers_outbound_trusted = checkbox?.checked ? 1 : 0;
        this.app.storage.saveOptions();

        this.overlay.remove();
        this.invokePaymentCallback(details.mycallback);
      };
    }
  }
}

module.exports = GameSendAuth;
