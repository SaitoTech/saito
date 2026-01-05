const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const SaitoOverlay = require('./../../lib/saito/ui/saito-overlay/saito-overlay');
const FaucetHome = require('./index');

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

		this.amount = BigInt(10000000000);
		this.overlay = new SaitoOverlay(app, this);

		this.payouts = {};

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

		this.app.browser.addElementToDom(this.template());

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
					this.overlay.show(this.template());
					this.attachEvents();
				};
			}, 50);
		}
	}

	template() {
		return `      
		<div class='faucet saito-overlay-size'>
        		<h2>SAITO Faucet</h2>
        	        <p>click on the button to receive 100 SAITO from the testnet faucet</p>
		        <button class="saito-primary faucet-button" id="faucet-button" >Request Testnet SAITO</button>
      			<div class="faucet-spinner"><img class="spinner" src="/saito/img/spinner.svg"></div>
      		</div>`;
	}

	attachEvents() {
		let btn = document.querySelector('.faucet-button');
		if (btn) {
			btn.onclick = async (e) => {
				siteMessage('Creating Faucet Request...', 3000);

				try {
					let btn = document.querySelector('.faucet-button');
					let spinner = document.querySelector('.faucet-spinner');
					btn.style.display = 'none';
					spinner.style.display = 'block';
				} catch (err) {}

				let tx = await this.createFaucetTransaction();
				this.app.network.propagateTransaction(tx);

				siteMessage('Broadcasting Faucet Request to Server...', 5000);
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
		if (this.hasSeenTransaction(tx, Number(blk.id))) {
			return;
		}

		//
		// Bound Transactions (monitor NFT transfers)
		//
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
			if (tx.isTo(this.publicKey)) {
				siteMessage('Faucet Payment Received...', 3000);
				try {
					let msg = document.querySelector('.saito-container p');
					let spinner = document.querySelector('.faucet-spinner');
					spinner.style.display = 'none';
					msg.innerHTML = 'please check your wallet...';
				} catch (err) {}
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
		newtx.type = 0;
		newtx.packData();
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
		newtx.packData();
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
