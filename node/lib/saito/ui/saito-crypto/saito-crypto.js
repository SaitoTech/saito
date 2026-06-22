const Deposit = require('./overlays/deposit');
const Withdraw = require('./overlays/withdraw');
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

    // Games: `saito-crypto-send-render-request` → Send (validate) → `saito-crypto-send-confirm-open-request` → Confirm + mycallback
    //        `saito-crypto-send-confirm` → result UI
    this.send_confirm_overlay = new Confirm(app, mod);

    //'saito-crypto-receive-render-request'
    this.receive_overlay = new Receive(app, mod);

    this.details_overlay = new Details(app, mod);
  }
}

module.exports = SaitoCrypto;
