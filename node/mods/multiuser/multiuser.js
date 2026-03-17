const PeerService = require('saito-js/lib/peer_service').default;
const Transaction = require('../../lib/saito/transaction').default;
const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');

//
// This application provides the ability for accounts to "handover"
// write-access to the blockchain / wallet to each other based on 
// which device has last published a message permitting it to take
// control.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
// INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
// PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
class MultiUser extends ModTemplate {

	constructor(app) {
		super(app);
		this.name = 'MultiUser';
		this.slug = 'multiuser';
		this.description = 'Adds support for read/write handover access';
		this.categories = 'Utility';

		this.networkPropagateTransactionFunction = null;
		this.walletGenerateSlipsFunction = null;

	}

	initialize() {

		this.load();

		this.networkPropagateTransactionFunction 	= this.app.network.propagateTransaction;
		this.walletGenerateSlipsFunction 		= this.app.network.propagateTransaction;

		if (!this.app.options.multiuser.control) {
			this.loseControl();
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

                console.log('################');
                console.log('MultiUser Module');
                console.log('################');

		//
		//
		//
		let txmsg = tx.returnMessage();

		if (tx.isFrom(this.publicKey)) {
			if (txmsg.request === "multiuser take control") {
				if (this.app.options.multiuser.random = txmsg.random) {
					this.takeControl();
				} else {
					this.loseControl();
				}
			}

		}

		return 1;
	}

	async createTakeControlTransaction() {

		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		newtx.msg = {
			module: 'MultiUser',
			request: 'multiuser take control' ,
			random: this.app.options.multiuser.random ,
		};
		newtx.type = 0;
		newtx.packData();
		await newtx.sign();
		return newtx;
	}

	takeControl() {

		this.app.network.propagateTransaction = this.networkPropagateTransactionFunction;

	}

	loseControl() {

		this.app.network.propagateTransaction = () => {};

	}

	load() {
		if (!this.app.options.multiuser) {
			this.app.options.multiuser = {
				random : Math.random() ,
				control : false;
			}
		}
	}



}

module.exports = MultiUser;
