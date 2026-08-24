const Deposit = require('./overlays/deposit');
const Withdraw = require('./overlays/withdraw');
const Confirm = require('./overlays/confirm');
const GameSendAuth = require('./overlays/game-send-auth');
const Receive = require('./overlays/receive');
const WalletHistory = require('./overlays/wallet-history');

class SaitoCrypto {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;

    // Feature CSS lives in mods/crypto (not the design-system bundle).
    if (app?.browser?.addStylesheet) {
      app.browser.addStylesheet('/crypto/style.css');
    }

    //'saito-crypto-deposit-render-request'
    this.deposit_overlay = new Deposit(app, mod);

    //'saito-crypto-withdraw-render-request'
    this.withdrawal_overlay = new Withdraw(app, mod);

    // Games: `saito-crypto-send-render-request` → Send (validate) → `saito-crypto-send-confirm-open-request` → Confirm + mycallback
    //        `saito-crypto-send-confirm` → result UI
    this.send_confirm_overlay = new Confirm(app, mod);

    // Game-specific outbound payment authorization (saito-game-crypto-send-auth-open-request)
    this.game_send_auth_overlay = new GameSendAuth(app, mod);

    //'saito-crypto-receive-render-request'
    this.receive_overlay = new Receive(app, mod);

    this.wallet_history_overlay = new WalletHistory(app, mod);
  }
}

module.exports = SaitoCrypto;
