/*********************************************************************************

 WEB3 CRYPTO MODULE v.2 - Mixin

 Extends the generic web3 crypto module to add auto-support for cryptos that are
 supported by the Mixin module.

 returnPrivateKey()
 async sendPayment(amount="", recipient="", unique_hash="")
 async receivePayment(amount="", sender="", recipient="", timestamp=0, unique_hash="")


 Uses Mixin API:
 ----------------
 createAccount()
 createDepositAddress()
 fetchSafeUtxoBalance()
 fetchUtxo()
 fetchSafeSnapshots()
 fetchSnapshots()
 fetchPendingDeposits()
 sendInNetworkTransferRequest()
 sendExternalNetworkTransferRequest()
 returnMixinNetworkInfo()
 returnWithdrawalFee()
 sendFetchUserByAddressTransaction()
 sendFetchUserByPublicKeyByAssetIdTransaction()
 sendFetchAddressByUserIdTransaction()
 deposit[]
 mixin.privatekey
 mixin.user_id


 **********************************************************************************/
const CryptoModule = require('./../../../lib/templates/cryptomodule');
const getUuid = require('uuid-by-string');
//
// TODO - this is old and deprecated and doesn't compile well with ().default bundled
// code as we require. so we should be updating address validation if we need it, but
// this should not be blocking us.
//
//const WAValidator = require("multicoin-address-validator");

class MixinModule extends CryptoModule {
	constructor(app, mixin_mod, ticker, asset_id, chain_id) {
		super(app, ticker);

		this.mixin = mixin_mod;

		this.asset_id = asset_id;
		this.chain_id = chain_id;

		this.polling_active = 0;
		this.polling_last_request = 0;
		this.polling_timeout = 0;
		this.polling_intervals = [0, 15000, 45000, 100000, 300000, 600000];
		this.polling_interval_current = 0;

		this.confirmations = 100;
		this.latest_snapshot_ts = 0;
	}

	async load() {
		await super.load();
		if (this.options?.latest_snapshot_ts) {
			this.latest_snapshot_ts = Number(this.options.latest_snapshot_ts);
		}
	}

	save() {
		this.options.latest_snapshot_ts = this.latest_snapshot_ts;
		super.save();
	}

	async activate() {
		if (this.mixin.account_created == 0) {
			console.info('Create Mixin account');
			await this.mixin.createAccount((res) => {
				if (res.err || Object.keys(res).length < 1) {
					if (this.app.BROWSER) {
						salert('Having problem generating key for ' + ' ' + this.ticker);
					}
					this.app.wallet.setPreferredCrypto('SAITO');
					return null;
				}

				return this.activate();
			});
		} else {
			if (!this.address) {
				console.info(`Create Mixin deposit address -- ${this.ticker}`);

				let rv = await this.mixin.createDepositAddress(this.asset_id, this.chain_id);
				if (!rv) {
					if (this.app.BROWSER) {
						salert('Having problem generating key for ' + ' ' + this.ticker);
					}
					await this.app.wallet.setPreferredCrypto('SAITO');
				} else {
					console.info(`Address for ${this.ticker}: ${this.address}`);
				}
			}

			await super.activate();
		}
	}

	//
	// Critical Balance Check Functions
	//

	//
	// these functions are defined as such in the parent module
	//
	//async getAvailableBalance() {
	//	return this.checkBalance();
	//}
	//
	//async getPendingBalance() {
	//	return this.checkBalance();
	//}
	//async checkBalance() {
	//	return this.balance;
	//}
	//async checkPendingBalance() {
	//	return await this.checkBalance();
	//}

	//
	// queries the latest balance
	//
	async fetchBalance() {
		if (!this.address) {
			console.info('Mixin Error: no address - terminating fetch balance');
			return;
		}

		let balance = await this.mixin.fetchSafeUtxoBalance(this.asset_id);
		if (balance !== false) {
			if (this.balance != balance) {
				this.balance = balance;
				this.save();
			}
		}

		return this.balance;
	}

	//
	// queries the latest pending balance
	//
	async fetchPendingBalance() {
		let pending_balance = 0;

		this.pending_deposits = await this.fetchPendingDeposits();

		for (let pd of this.pending_deposits) {
			if (pd.state === 'pending' || Number(pd.confirmations) < Number(this.confirmations)) {
				pending_balance += Number(pd.amount || 0);
			}
		}

		this.pending_balance = pending_balance.toString() || '0.0';
	}

	/*
	 *
	 * PENDING DEPOSITS are returned from MIXIN in this fashion
	 *
	 * this.pending_deposits = [
	 *   {
	 *     deposit_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
	 *     destination: "0xDepositAddressForThisAsset...",
	 *     tag: "",
	 *     chain_id: "b7938390-ff6d-4be9-aa99-1a7ede2b7276",
	 *     asset_id: "c6d0c728-2624-429b-8e0d-d563e5f5ee48",
	 *     asset_key: "ETH",
	 *     amount: "0.125",              // string; use Number() in UI
	 *     transaction_hash: "0xabc...",
	 *     output_index: 0,
	 *     block_hash: "0xdef...",
	 *     block_number: 19876543,
	 *     confirmations: 5,             // used by saito-header / deposit overlay
	 *     threshold: 100,             // network confirmation target (often matches module.confirmations)
	 *     state: "pending",             // e.g. "pending" | "confirmed"
	 *     created_at: "2024-02-12T16:31:44.123456789Z",
	 *     updated_at: "2024-02-12T16:32:01.987654321Z"
	 *   }
	 * ];
	 */
	async fetchPendingDeposits(callback = null) {
		if (!this.address) {
			this.pending_deposits = [];
			if (callback) callback([]);
			return [];
		}

		this.pending_deposits = await new Promise((resolve) => {
			this.mixin.fetchPendingDeposits(this.asset_id, this.address, (res) => {
				if (res === false) {
					resolve(this.pending_deposits || []);
					return;
				}
				resolve(res || []);
			});
		});

		if (callback) {
			callback(this.pending_deposits);
		}

		return this.pending_deposits;
	}

	/**
	 * Incremental history / snapshot sync: fetch new Safe ledger events, append to history,
	 * emit semantic payment events, and advance latest_snapshot_ts.
	 * Independent of checkHistory() / history_update_ts.
	 */
	async fetchHistory(mycallback = null) {
		// We should not be making API calls on Mixin if we haven't installed this crypto
		// (let alone set up a mixin account)
		if (!this.isActivated()) {
			return;
		}

		let fetched_updates = [];

		if (!this.asset_id) {
			return [];
		}

		let snapshots = await new Promise((resolve) => {
			this.mixin.fetchSafeSnapshots(this.asset_id, this.latest_snapshot_ts, (d) => {
				resolve(d === false || d == null ? [] : d);
			});
		});

		let start_ts = this.latest_snapshot_ts;

		for (let snap of snapshots) {
			//
			// Snapshot object returned by Mixin Safe API (via mixin.js fetchSafeSnapshots):
			//
			// {
			//   snapshot_id: "6049b6c2-3f9e-3627-b671-c81f4f6a88fa",
			//   user_id: "95b8a0a4-1032-33e7-9154-5f48ebe00a14",
			//   opponent_id: "dac46e33-fdd2-3453-b77a-73ffadba1ff1",
			//   transaction_hash: "1db6dc53df33bfc7dd38afa86eb83454b5b71bc178da653431ddc9af025a7487",
			//   asset_id: "43d61dcd-e413-450d-80b8-101d5e903357",
			//   kernel_asset_id: "8dd50817c082cdcdd6f167514928767a4b52426997bd6d4930eca101c5ff8a27",
			//   amount: "0.005",
			//   memo: "746573742d6d656d6f",
			//   request_id: "bfb05bb6-03e5-4b5c-a7ab-2ad5a4ed56a7",
			//   created_at: "2025-08-25T03:23:17.657426Z",
			//   level: 11,
			//   type: "snapshot",
			//   inscription_hash: "INSCRIPTION-HASH",
			//   deposit: {
			//     deposit_hash: "DEPOSIT-HASH",
			//     deposit_index: 1,
			//     sender: "SOME-STRING",
			//     destination: "DEPOSIT-DESTINATION",
			//     tag: "DEPOSIT-TAG"
			//   },
			//   withdrawal: {
			//     withdrawal_hash: "WITHDRAWAL-HASH",
			//     receiver: "SOME-STRING"
			//   }
			// }
			//

			const obj = {
				snapshot_id: snap.snapshot_id,
				counter_party: { address: snap.opponent_id || '' },
				timestamp: new Date(snap.created_at).getTime(),
				amount: Number(snap.amount),
				trans_hash: snap.transaction_hash || ''
			};

			if (obj.timestamp < this.latest_snapshot_ts) {
				continue;
			}

			if (snap.deposit) {
				//obj.type = 'deposit';
				obj.type = 'receive';
				obj.counter_party.address = snap.deposit.sender || '';
			} else if (snap.withdrawal) {
				//obj.type = 'withdraw';
				obj.type = 'send';
				obj.counter_party.address = snap.withdrawal.receiver || '';
			} else if (obj.amount > 0) {
				obj.type = 'receive';
			} else {
				obj.type = 'send';
			}

			if (snap?.opponent_id) {
				const user = await this.mixin.sendFetchAddressByUserIdTransaction(
					this.asset_id,
					snap.opponent_id
				);
				if (user?.publickey) {
					obj.counter_party.publicKey = user.publickey;
				}
			}

			this.history.push(obj);
			fetched_updates.push(obj);

			if (obj.type === 'deposit' || obj.type === 'receive') {
				//
				// Broadcast object shape (mixin-payment-received):
				//
				// {
				//   direction: "receive",
				//   type: "deposit",
				//   amount: "0.005",
				//   sender: "0xabc... or mixin-opponent-id",
				//   receiver: "mixin-deposit-address",
				//   timestamp: 1710000000000,
				//   ticker: "SAITO",
				//   transaction_hash: "1db6dc53...",
				//   snapshot_id: "6049b6c2-...",
				//   opponent_id: "dac46e33-...",
				//   request_id: "bfb05bb6-...",
				//   memo: "746573742d6d656d6f",
				//   module: "Mixin SAITO",
				//   counter_party: { address: "...", publicKey: "..." }
				// }
				//
				this.app.connection.emit('on-payment-received', {
					direction: obj.type,
					amount: String(Math.abs(obj.amount)),
					sender: obj.sender,
					receiver: this.returnAddress() || '',
					timestamp: obj.timestamp,
					block_id: '',
					ticker: this.ticker || '',
					transaction_signature: '',
					signature: '',
					memo: snap.memo || '',
					confirmation: 1,
					module: this.name || '',
					request: 'crypto payment',
					hash: ''
				});
			} else if (obj.type === 'send' || obj.type === 'withdraw') {
				//
				// Broadcast object shape (mixin-payment-sent):
				//
				// {
				//   direction: "send",
				//   type: "withdraw",
				//   amount: "0.005",
				//   sender: "mixin-deposit-address",
				//   receiver: "0xabc... or mixin-opponent-id",
				//   timestamp: 1710000000000,
				//   ticker: "SAITO",
				//   transaction_hash: "1db6dc53...",
				//   snapshot_id: "6049b6c2-...",
				//   opponent_id: "dac46e33-...",
				//   request_id: "bfb05bb6-...",
				//   memo: "746573742d6d656d6f",
				//   module: "Mixin SAITO",
				//   counter_party: { address: "...", publicKey: "..." }
				// }
				//
				this.app.connection.emit('on-payment-sent', {
					direction: obj.type,
					amount: String(Math.abs(obj.amount)),
					receiver: obj.receiver,
					sender: this.returnAddress() || '',
					timestamp: obj.timestamp,
					block_id: '',
					ticker: this.ticker || '',
					transaction_signature: '',
					signature: '',
					memo: snap.memo || '',
					confirmation: 1,
					module: this.name || '',
					request: 'crypto payment',
					hash: ''
				});
			}

			this.latest_snapshot_ts = Math.max(this.latest_snapshot_ts, obj.timestamp);
		}

		if (this.latest_snapshot_ts > start_ts) {
			this.latest_snapshot_ts++;
			this.save();
		}

		if (mycallback != null) {
			mycallback(fetched_updates);
		}

		return fetched_updates;
	}

	startPolling() {
		//
		// if we are already polling, increase urgency by reducing interval index
		//
		if (this.polling_active) {
			if (this.polling_interval_current > 0) {
				this.polling_interval_current--;
			}
			return;
		}

		//
		// record that we are polling
		//
		this.polling_active = 1;
		this.polling_interval_current = 0;

		const poll = async () => {
			//
			// polling stopped externally
			//
			if (!this.polling_active) {
				return;
			}

			let wallet_updates = await this.fetchHistory();

			//
			// if something has happened....
			//
			if (wallet_updates.length > 0) {
				//
				// disable polling, change found...
				//
				this.polling_active = 0;
				this.polling_last_request = Date.now();
				this.polling_timeout = 0;
				this.polling_interval_current = 0;
			} else {
				//
				// decay polling frequency
				//
				if (this.polling_interval_current < this.polling_intervals.length - 1) {
					this.polling_interval_current++;
				}
			}

			//
			// update timestamp
			//
			this.polling_last_request = Date.now();

			//
			// schedule next poll
			//
			let delay = this.polling_intervals[this.polling_interval_current];
			this.polling_timeout = setTimeout(poll, delay);
		};

		//
		// now start!
		//
		poll();

		return;
	}

	/**
	 * Abstract method which should transfer tokens via the crypto endpoint
	 * @abstract
	 * @param {Number} howMuch - How much of the token to transfer
	 * @param {String} to - Pubkey/address to send to
	 * @abstract
	 * @return {Number}
	 */
	async sendPayment(amount = '', recipient = '', unique_hash = '') {
		let r = recipient.split('|');

		let internal_transfer = false;
		let destination = recipient;

		let res = {};

		console.info('Mixin sendPayment to ' + recipient);

		// if address has |mixin| concat
		if (r.length >= 2) {
			if (r[2] === 'mixin') {
				console.info('Send to Mixin address');
				internal_transfer = true;
				destination = r[1];
			}
		}

		// check if address exists in local db
		if (internal_transfer == false) {
			await this.mixin.sendFetchUserByAddressTransaction(
				{
					address: recipient
				},
				function (res) {
					console.info('Cross network callback complete');
					if (res?.user_id) {
						internal_transfer = true;
						destination = res.user_id;
					}
				}
			);
		}

		// internal mixin transfer
		if (internal_transfer) {
			res = await this.mixin.sendInNetworkTransferRequest(this.asset_id, destination, amount);
		} else {
			// address is external, send external withdrawl request
			res = await this.mixin.sendExternalNetworkTransferRequest(this.asset_id, destination, amount);
		}

		if (res.status == 200) {
			return unique_hash;
		} else {
			throw new Error('MixinModule: ' + res.message);
			return '';
		}
	}

	//
	// Reference for how we used to package the mixin address bar...
	//
	formatAddress() {
		return this.address + '|' + this.mixin.mixin.user_id + '|' + 'mixin';
	}

	/**
	 * Abstract method which should get private key
	 * @abstract
	 * @return {String} Private Key
	 */
	returnPrivateKey() {
		return this.mixin.mixin.privatekey;
	}

	/**
	 * Searches for a payment which matches the criteria specified in the parameters.
	 * @abstract
	 * @param {Number} howMuch - How much of the token was transferred
	 * @param {String} from - Pubkey/address the transasction was sent from
	 * @param {String} to - Pubkey/address the transasction was sent to
	 * @param {timestamp} to - timestamp after which the transaction was sent
	 * @return {Boolean}
	 */
	async receivePayment(amount = '', sender = '', recipient = '', timestamp = 0, unique_hash = '') {
		let this_self = this;
		let received_status = 0;
		let split = sender.split('|');

		console.log('split: ', split);

		let opponent_id = split[1];
		sender = split[0];

		//
		// the mixin module might have a record of this already stored locally
		//
		console.log('////////////////////////////////////////////////////');
		console.log('inside receivePayment ///');
		console.log('amount, sender, timestamp');
		console.log(amount, sender, timestamp);

		//snapshot_datetime:  Mon Feb 12 2024 16:31:44 GMT+0500 (Pakistan Standard Time)
		//mixinmodule.js:454 received_datetime:  Sun Sep 20 56111 06:01:14 GMT+0500 (Pakistan Standard Time)

		let status = await this.mixin.fetchUtxo('unspent', 100000, 'DESC', (d) => {
			if (d.length > 0) {
				for (let i = d.length - 1; i >= 0; i--) {
					let row = d[i];

					//compare timestamps
					let snapshot_date = new Date(row.created_at);
					let received_date = new Date(timestamp);

					console.log(
						'received_datetime - snapshot_datetime - diff : ',
						received_date,
						snapshot_date,
						snapshot_date - received_date
					);

					if (snapshot_date - received_date > 0) {
						let snapshot_asset_id = row.asset_id;

						console.log('*************************************');
						console.log('snapshot response ///');

						// filter out specific asset
						if (snapshot_asset_id == this_self.asset_id) {
							console.log('assets matched ///');

							let senders = row.senders;

							console.log('snapshot_opponent_id: ', senders);
							console.log('opponent_id: ', opponent_id);
							console.log('oponnent id exists:', senders.includes(opponent_id));

							// filter out opponents
							if (senders.includes(opponent_id)) {
								console.log('opponent_id matched ////');

								let snapshot_amount = Number(row.amount);
								console.log('row.amount: ', row.amount);
								console.log('snapshot_amount: ', snapshot_amount);

								if (snapshot_amount == amount) {
									console.log('match found ///');

									return 1;
								}
							}
						}
					}
				}

				return 0;
			}
		});

		console.log('status / ////////////////////////////');
		console.log(status);
		return status;
	}

	async returnMixinNetworkInfo() {
		let info = await this.mixin.returnMixinNetworkInfo(this.asset_id);
		this.confirmations = info.confirmations || 0;
		this.price_usd = Number(info.price_usd);
		this.last_update = Date.now();
		this.icon_url = info.icon_url;
		return info;
	}

	//
	// this function creates a Mixin address associated with the account in order to check
	// if it can offer zero-fee in-network transfers or requires a network fee to be paid
	// in order to process the payment.
	//
	async checkWithdrawalFeeForAddress(recipient = '', mycallback) {
		if (recipient == '') {
			return mycallback(0);
		}

		let r = recipient.split('|');
		let ts = new Date().getTime();

		//
		// internal MIXIN transfer
		//
		if (r.length >= 2) {
			if (r[2] === 'mixin') {
				return mycallback(0);
			}
		}

		//
		// check if address exists in local db
		//
		let user_data = null;
		await this.mixin.sendFetchUserByAddressTransaction(
			{
				address: recipient
			},
			function (res) {
				user_data = res;
			}
		);

		//
		// return 0 fee if in-network address, or estimate if external
		//
		if (typeof user_data.user_id != 'undefined') {
			return mycallback(0);
		} else {
			let fee = await this.mixin.returnWithdrawalFee(this.asset_id, recipient);
			if (fee !== false) {
				return mycallback(fee);
			}

			return mycallback(0);
		}
	}

	/**
	 * Abstract method which returns snapshot of asset withdrawls, deposits
	 * @abstract
	 * @return {Function} Callback function
	 */
	async checkHistory(mycallback = null) {
		if (mycallback != null) {
			mycallback(this.history);
		}
		return this.history;
	}

	async returnUtxo(state = 'unspent', limit = 500, order = 'DESC', callback = null) {
		return await this.mixin.fetchUtxo(state, limit, order, callback);
	}

	async returnAddressFromPublicKey(publicKey) {
		this_self = this;
		try {
			//check if key exists in keychain
			let address = await super.returnAddressFromPublicKey(publicKey);

			if (address) {
				return address;
			}

			// if it doesnt exist fetch it from node db
			return this.mixin.sendFetchUserByPublicKeyByAssetIdTransaction(
				{
					publicKey: publicKey,
					asset_id: this.asset_id
				},
				function (res) {
					// console.log('miximodule res: ', res);
					// this.address + '|' + this.mixin.mixin.user_id + '|' + 'mixin';
					if (res.length > 0) {
						for (let i = 0; i < res.length; i++) {
							console.log(
								res[i].asset_id,
								' - ',
								this_self.asset_id,
								' - ',
								res[i].asset_id == this_self.asset_id
							);
							if (res[i].asset_id == this_self.asset_id) {
								let address = res[i].address;
								if (res[i]?.user_id) {
									address += '|' + res[i].user_id + '|mixin';
								}
								// save address to keychain if publickey exists in keychain
								this_self.app.keychain.addCryptoAddress(publicKey, this_self.ticker, address);
								return address;
							}
						}
					}
				}
			);
		} catch (err) {
			// console.error('Error getMixinAddress: ', err);
			return null;
		}
	}

	validateAddress(address) {
		if (address.includes('|')) {
			let r = address.split('|');
			address = r[0];
		}

		// suported cryptos by validator package
		//https://www.npmjs.com/package/multicoin-address-validator?activeTab=readme
		try {
			//
			// see above
			//
			return true;

			//			return WAValidator.validate(address, this.ticker);
		} catch (err) {
			// console.error("Error 'validateAddress' MixinModule: ", err);
		}
	}
}

module.exports = MixinModule;
