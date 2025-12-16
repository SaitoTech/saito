var ModTemplate = require('../../lib/templates/modtemplate');
const MainUI = require('./lib/main');

class Tutorial03 extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'Tutorial03';
    this.slug = 'tutorial03';
    this.description = 'Receiving Transactions';
    this.categories = 'Educational Sample';
    this.ui = new MainUI(this.app, this);
  }

  async render() {
    this.addComponent(this.ui);
    await super.render();
  }

  async onConfirmation(blk, tx, conf) {
    let txmsg = tx.returnMessage();

    console.log('Tutorial 3: ', txmsg);

    if (Number(conf) == 0) {
      if (this.app.BROWSER) {
        this.ui.receiveTransaction(tx);
      }
    }
  }

  receiveTutorial03Transaction(tx) {}

  async sendTutorial03Transaction() {
    let address = await this.app.wallet.getPublicKey();

    let newtx = await this.app.wallet.createUnsignedTransaction(address);
    newtx.msg = {
      module: this.name,
      data: {
        random: Math.random()
      }
    };
    await newtx.sign();

    this.app.network.propagateTransaction(newtx);
  }
}

module.exports = Tutorial03;
