const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const SaitoOverlay = require('./../../lib/saito/ui/saito-overlay/saito-overlay');
const FaucetHome = require('./index');
const FaucetMainTemplate = require('./lib/faucet-main.template');
const FaucetOverlayTemplate = require('./lib/faucet-overlay.template');

//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
//
class Faucet extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'Faucet';
    this.slug = 'faucet';

    this.description = 'Testnet Faucet for Testing and Application Development';
    this.categories = 'Utility Ecommerce NFTs';

    this.icon_fa = 'fa-solid fa-faucet';
    this.styles = ['/faucet/style.css'];

    this.amount = BigInt(10000000000);
    this.overlay = new SaitoOverlay(app, this, false);

    this.payouts = {};
    this.closePurchaseOverlay = null;

    if (app.BROWSER) {
      app.connection.on('saito-purchase-overlay-open', (closeOverlay) => {
        this.closePurchaseOverlay = closeOverlay;
      });

      app.connection.on('saito-purchase-launch', () => {
        // Let the purchase module open first so this optional overlay sits above it.
        setTimeout(() => {
          const closePurchaseOverlay = this.closePurchaseOverlay;
          this.closePurchaseOverlay = null;
          this.openFaucetOverlay(closePurchaseOverlay);
        }, 0);
      });
    }

    this.social = {
      twitter: '@SaitoOfficial',
      title: '🟥 Saito Faucet',
      url: 'https://saito.io/faucet/',
      description: 'Get Testnet Saito',
      image: 'https://saito.tech/wp-content/uploads/2023/11/faucet-300x300.png'
    };
  }

  async render() {
    //
    // browsers only!
    //
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    this.header = new SaitoHeader(this.app, this);
    await this.header.initialize(this.app);
    this.header.header_class = 'arcade';
    this.addComponent(this.header);

    await super.render();

    this.app.browser.addElementToDom(FaucetMainTemplate(this.app, this));

    this.setFaucetState('idle');
    this.attachEvents();
  }

  canRenderInto(querySelector = '') {
    console.log('Faucet: canRenderInto -- ', querySelector);
    if (!this.browser_active) {
      if (querySelector == '.get-saito-tokens') {
        return true;
      }
    }

    return false;
  }

  async renderInto(querySelector = '') {
    if (querySelector == '.get-saito-tokens') {
      this.styles = ['/faucet/style.css'];
      this.attachStyleSheets();
      this.app.browser.addElementToSelector(
        `<div class='saito-faucet-button saito-button-secondary'><i class='${this.icon_fa}'></i></div>`,
        querySelector
      );

      setTimeout(() => {
        document.querySelector('.saito-faucet-button').onclick = (e) => {
          this.openFaucetOverlay();
        };
      }, 50);
    }
  }

  openFaucetOverlay(closePurchaseOverlay = null) {
    this.attachStyleSheets();
    this.overlay.show(FaucetOverlayTemplate(this.app, this), () => {
      if (typeof closePurchaseOverlay === 'function') {
        closePurchaseOverlay();
      }
    });
    this.setFaucetState('idle');
    this.attachEvents();
  }

  setFaucetState(state = 'idle') {
    const root = document.getElementById('faucet-request-container');
    if (!root) {
      return;
    }

    root.dataset.faucetState = state;

    const title = document.getElementById('faucet_title');
    const closeBtn = document.getElementById('faucet-close-btn');
    const logo = document.getElementById('faucet_saito_logo');
    const spinner = document.getElementById('faucet_spinner');
    const successIcon = document.getElementById('faucet_success_icon');

    const titles = {
      idle: 'Testnet Faucet',
      pending: 'Requesting Tokens',
      success: 'Tokens Received'
    };

    const closeLabels = {
      idle: 'Close',
      pending: 'Close',
      success: 'Continue'
    };

    if (title) {
      title.textContent = titles[state] || titles.idle;
    }
    if (closeBtn) {
      closeBtn.textContent = closeLabels[state] || closeLabels.idle;
    }
    if (logo) {
      logo.hidden = state !== 'idle';
      logo.style.display = state === 'idle' ? 'block' : 'none';
    }
    if (spinner) {
      spinner.hidden = state !== 'pending';
      spinner.style.display = state === 'pending' ? 'block' : 'none';
    }
    if (successIcon) {
      successIcon.hidden = state !== 'success';
      successIcon.style.display = state === 'success' ? 'block' : 'none';
    }
  }

  closeFaucetOverlay() {
    if (document.querySelector('.saito-overlay #faucet-request-container')) {
      this.overlay.close();
    }
  }

  attachEvents() {
    let btn = document.getElementById('faucet-button');
    if (btn) {
      btn.onclick = async (e) => {
        siteMessage('Creating Faucet Request...', 3000);
        this.setFaucetState('pending');

        let tx = await this.createFaucetTransaction();
        this.app.network.propagateTransaction(tx);

        siteMessage('Broadcasting Faucet Request to Server...', 5000);
      };
    }

    let closeBtn = document.getElementById('faucet-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        this.closeFaucetOverlay();
      };
    }
  }

  async onConfirmation(blk, tx, conf = 0) {
    //
    // only process the first conf
    //
    if (conf != 0) {
      return;
    }

    //
    // sanity check
    //
    if (this.hasSeenTransaction(tx, blk)) {
      return;
    }

    let txmsg = tx.returnMessage();

    if (txmsg.request === 'faucet request') {
      if (!this.app.BROWSER) {
        await this.receiveFaucetRequestTransaction(tx, blk);
      } else {
        if (tx.isFrom(this.publicKey)) {
          siteMessage('Faucet Token Request on chain...', 5000);
        }
      }
      return;
    }

    if (txmsg.request === 'faucet issuance') {
      if (tx.isTo(this.publicKey) && this.app.BROWSER) {
        siteMessage('Faucet Payment Received...', 3000);
        this.setFaucetState('success');
      }
      return;
    }
  }

  async createFaucetTransaction() {
    //
    // create the wrapper transaction
    //
    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
    newtx.msg = {
      module: 'Faucet',
      request: 'faucet request'
    };
    await newtx.sign();
    return newtx;
  }

  async receiveFaucetRequestTransaction(tx = null, blk = null) {
    //
    // sanity check transaction is valid
    //
    if (tx == null || blk == null) {
      return;
    }

    let receiver = tx.from[0].publicKey;

    let ts = Date.now();
    if (this.payouts[receiver]) {
      if (ts - this.payouts[receiver] < 3600000) {
        return;
      }
    }

    this.payouts[receiver] = ts;

    let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      receiver,
      this.amount
    );
    newtx.msg = {
      module: 'Faucet',
      request: 'faucet issuance'
    };
    await newtx.sign();
    this.app.network.propagateTransaction(newtx);
  }

  webServer(app, expressapp, express) {
    let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    let faucet_self = this;

    expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
      let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

      let updatedSocial = Object.assign({}, faucet_self.social);

      let html = FaucetHome(app, faucet_self, app.build_number, updatedSocial);
      if (!res.finished) {
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        return res.send(html);
      }
      return;
    });

    expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
  }
}

module.exports = Faucet;
