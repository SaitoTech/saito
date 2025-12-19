const PeerService = require('saito-js/lib/peer_service').default;
const Transaction = require('../../lib/saito/transaction').default;
const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const BuySaitoHome = require('./index');
const SaitoPurchaseOverlay = require('./lib/saito-purchase');

//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
//

class BuySaito extends ModTemplate {
	constructor(app) {
		super(app);

		this.name = 'BuySaito';
		this.slug = 'buy';

		this.dependencies = ['Mixin'];
		this.description = 'Testnet BuySaito for Testing and Application Development';
		this.categories = 'Utility Ecommerce NFTs';

		this.social = {
			twitter: '@SaitoOfficial',
			title: '🟥 Saito BuySaito',
			url: 'https://saito.io/buysaito/',
			description: 'Get Testnet Saito',
			image: 'https://saito.tech/wp-content/uploads/2023/11/buysaito-300x300.png'
		};

		this.purchase_overlay = new SaitoPurchaseOverlay(app, this);
	}

	async render() {
		//
		// browsers only!
		//
		if (!this.app.BROWSER || !this.browser_active) {
			return;
		}

		if (!this.header) {
			this.header = new SaitoHeader(this.app, this);
			await this.header.initialize(this.app);
			this.header.header_class = 'arcade';
			this.addComponent(this.header);
		}

		await super.render();

		this.attachEvents();
	}

	attachEvents() {
		let btn = document.getElementById('buysaito-button');
		if (btn) {
			btn.onclick = async (e) => {
				let amount = document.getElementById('purchase-saito-amount').value;

				console.log('Saito Amount to Quote...');

				let tx = await this.createBuySaitoTransaction();
				this.purchase_overlay.reset(); // reset previously used values
				this.purchase_overlay.tx = tx;
				this.purchase_overlay.saito_amount = amount;
				this.purchase_overlay.render();
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

		console.log('###############################');
		console.log('BuySaito onConfirmation: ', tx);
		console.log('###############################');

		//
		// Bound Transactions (monitor NFT transfers)
		//
		let txmsg = tx.returnMessage();

		if (txmsg.request === 'buysaito request') {
			if (!this.app.BROWSER) {
				await this.receiveBuySaitoRequestTransaction(tx, blk);
			} else {
				if (tx.isFrom(this.publicKey)) {
					siteMessage('BuySaito Token Request received by Server...', 5000);
				}
			}
			return;
		}

		if (txmsg.request === 'buysaito issuance') {
			if (tx.isTo(this.publicKey)) {
				siteMessage('BuySaito Payment Received...', 3000);
				try {
					let msg = document.querySelector('.saito-container p');
					msg.innerHTML = 'please check your wallet...';
				} catch (err) {}
			}
			return;
		}
	}

	async createBuySaitoTransaction() {
		//
		// create the wrapper transaction
		//
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		newtx.msg = {
			module: 'BuySaito',
			request: 'buysaito request'
		};
		newtx.type = 0;
		newtx.packData();
		await newtx.sign();
		return newtx;
	}

	async receiveBuySaitoRequestTransaction(tx = null, blk = null) {
		//
		// sanity check transaction is valid
		//
		if (tx == null || blk == null) {
			return;
		}

		let receiver = tx.from[0].publicKey;
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
			receiver,
			// uh... what!
			this.amount
		);
		newtx.msg = {
			module: 'BuySaito',
			request: 'buysaito issuance'
		};
		newtx.packData();
		await newtx.sign();
		this.app.network.propagateTransaction(newtx);
	}

	webServer(app, expressapp, express) {
		let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
		let buysaito_self = this;

		expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
			let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

			let updatedSocial = Object.assign({}, buysaito_self.social);

			let html = BuySaitoHome(app, buysaito_self, app.build_number, updatedSocial);
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

module.exports = BuySaito;
