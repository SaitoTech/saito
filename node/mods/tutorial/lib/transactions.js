const Transaction = require('../../../lib/saito/transaction').default;


module.exports = {

  async createRequestTutorialDataTransaction() {
    const newtx = await this.app.wallet.createUnsignedTransaction();
    newtx.msg = {
      module: this.name,
      request: 'request tutorial data',
      data: { msg : 'data goes here' }
    };
    return newtx;
  },

  async receiveRequestTutorialDataTransaction(blk, tx) {

    //
    // unpack tx and process data
    //
    const txmsg = tx?.returnMessage?.() || {};

    if (txmsg?.msg?.data) {
      //
      // process any submitted fields
      //
      console.log(`tutorial module -- we received ${txmsg.msg.data}`);
    }
  }

};
