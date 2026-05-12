const Deposit = require('./overlays/deposit');
const Withdraw = require('./overlays/withdraw');
const History = require('./overlays/history');
const Send = require('./overlays/send');
const Confirm = require('./overlays/confirm');
const Receive = require('./overlays/receive');
const Details = require('./overlays/details');

class SaitoCrypto {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;

    //'saito-crypto-deposit-render-request'
    this.deposit_overlay = new Deposit(app, mod);

    //'saito-crypto-withdraw-render-request'
    this.withdrawal_overlay = new Withdraw(app, mod);

    //'saito-crypto-history-render-request'
    this.history_overlay = new History(app, mod);

    //'saito-crypto-send-render-request' / 'saito-crypto-send-confirm' (games / modules)
    this.send_confirm_overlay = new Confirm(app, mod);

    // Wallet send form (future); not wired to game events
    this.send_overlay = new Send(app, mod);

    //'saito-crypto-receive-render-request'
    this.receive_overlay = new Receive(app, mod);

    this.details_overlay = new Details(app, mod);
  }
}

module.exports = SaitoCrypto;
