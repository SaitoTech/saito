var ModTemplate = require('../../lib/templates/modtemplate');
const Transaction = require('../../lib/saito/transaction').default;

class Tutorial04 extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'Tutorial04';
    this.slug = 'tutorial04';
    this.description = 'Building a Simple Chat message monitor';
    this.categories = 'Educational Sample';
  }

  shouldAffixCallbackToModule(modname) {
    if (modname == 'Chat') {
      return 1;
    }
    return 0;
  }

  //
  // receive on-chain transactions
  //
  async onConfirmation(blk, tx, conf) {
    let txmsg = tx.returnMessage();
    if (conf == 0) {
      this.processChatTransaction(txmsg, 'on chain');
    }
  }

  //
  // receive peer-to-peer transactions
  //
  async handlePeerTransaction(app, tx, peer, mycallback = null) {
    let txmsg = tx.returnMessage();

    if (txmsg.request == 'chat relay') {
      let inner_tx = new Transaction(undefined, txmsg.data);
      await inner_tx.decryptMessage(app);
      let inner_txmsg = inner_tx.returnMessage();
      this.processChatTransaction(inner_txmsg, 'relayed');
    }
  }

  processChatTransaction(txmsg, source = '') {
    //
    // am I a browser?
    //
    if (this.app.BROWSER) {
      //
      // is there a chat message here?
      //
      if (txmsg.message) {
        //
        // examine the message and...
        //
        if (txmsg.message.indexOf('huzzah') > -1) {
          //
          // do something !
          //
          console.log('Huzzah! -- ' + source);
          alert('Huzzah! -- ' + source);
        }
      }
    }
  }
}

module.exports = Tutorial04;
