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
 fetchPendingDeposits()

 sendInNetworkTransferRequest()
 sendExternalNetworkTransferRequest()

 returnNetworkInfo()
 checkWithdrawalFee()

 sendFetchUserTransaction()
 sendFetchUserByPublicKeyTransaction()
 sendFetchAddressByUserIdTransaction()

 deposit[]
 mixin.privatekey
 mixin.user_id


 **********************************************************************************/
const CryptoModule = require('./../../../lib/templates/cryptomodule');
const getUuid = require('uuid-by-string');
const WAValidator = require('multicoin-address-validator');

class MixinModule extends CryptoModule {
	constructor(app, mixin_mod, ticker, asset_id, chain_id) {
		super(app, ticker);

		this.mixin = mixin_mod;

		this.asset_id = asset_id;
		this.chain_id = chain_id;

		this.balance_timestamp_last_fetched = 0;
		this.minimum_delay_between_balance_queries = 4000;

		this.confirmations = 100;
	}

	async activate() {
		if (this.mixin.account_created == 0) {
			console.log('Create mixin account');
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
				console.log(`create deposit address for ${this.ticker}`);

				let rv = await this.mixin.createDepositAddress(this.asset_id, this.chain_id);
				if (!rv) {
					if (this.app.BROWSER) {
						salert('Having problem generating key for ' + ' ' + this.ticker);
					}
					await this.app.wallet.setPreferredCrypto('SAITO');
				} else {
					console.log(`Address for ${this.ticker}: ${this.address}`);
				}
			}

			await super.activate();
		}
	}

	/**
	 * Abstract method which should get balance from underlying crypto endpoint
	 * @abstract
	 * @return {Number}
	 */
	async checkBalance() {
		if (!this.address) {
			console.info("Don't query for crypto if we don't even have an address");
			return;
		}
		let now = new Date().getTime();
		if (now - this.balance_timestamp_last_fetched > this.minimum_delay_between_balance_queries) {
			this.balance_timestamp_last_fetched = now;

			let balance = await this.mixin.fetchSafeUtxoBalance(this.asset_id);

			if (balance !== false) {
				if (this.balance != balance) {
					console.debug(`Updated ${this.ticker} balance!`);
					this.balance = balance;
					this.save();
				}
			}
		}

		return this.balance;
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

		console.log('send sendPayment');
		console.log('Recipient: ' + recipient);

		// if address has |mixin| concat
		if (r.length >= 2) {
			if (r[2] === 'mixin') {
				console.log('Send to Mixin address');
				internal_transfer = true;
				destination = r[1];
			}
		}

		// check if address exists in local db
		if (internal_transfer == false) {
			await this.mixin.sendFetchUserTransaction(
				{
					address: recipient
				},
				function (res) {
					console.log('Cross network callback complete');
					if (res?.user_id) {
						internal_transfer = true;
						destination = res.user_id;
					}
				}
			);
		}

		console.log('Initiate mixin transfer, internally? ', internal_transfer);

		// internal mixin transfer
		if (internal_transfer) {
			res = await this.mixin.sendInNetworkTransferRequest(
				this.asset_id,
				destination,
				amount,
				unique_hash
			);
		} else {
			// address is external, send external withdrawl request
			res = await this.mixin.sendExternalNetworkTransferRequest(
				this.asset_id,
				destination,
				amount,
				unique_hash
			);
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
			console.log('utxo: ', d);

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

	returnNetworkInfo() {
		return this.mixin.returnNetworkInfo(this.asset_id);
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
		await this.mixin.sendFetchUserTransaction(
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
	async checkHistory(callback = null) {
		let this_self = this;

		let d = await this.mixin.fetchSafeSnapshots(
			this.asset_id,
			this.history_update_ts,
			async function (d) {
				console.log('mixin tx history:', d);

				for (let snap of d) {
					let amount = Number(snap.amount);

					const obj = {
						counter_party: { address: snap.opponent_id },
						timestamp: new Date(snap.created_at).getTime(),
						amount,
						trans_hash: transaction_hash
					};

					if (snap.deposit) {
						obj.type = 'deposit';
						obj.counter_party.address = snap.deposit.sender;
					} else if (snap.withdrawal) {
						obj.type = 'withdraw';
						obj.counter_party.address = snap.withdrawal.receiver;
					} else if (amount > 0) {
						obj.type = 'receive';
					} else {
						obj.type = 'send';
					}

					//
					// Check for associated Saito public key
					//
					if (snap?.opponent_id) {
						const user = await this_self.mixin.sendFetchAddressByUserIdTransaction(
							this_self.asset_id,
							snap.opponent_id
						);
						if (user.publickey) {
							obj.counter_party.publicKey = user.publickey;
						}
					}

					this_self.history.push(obj);
					this_self.history_update_ts = obj.timestamp + 1;
				}

				this_self.save();
				console.log('Formatted history: ', this_self.history);

				if (callback) {
					callback(d);
				}
			}
		);
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
				return;
			}

			// if it doesnt exist fetch it from node db
			return this.mixin.sendFetchUserByPublicKeyTransaction(
				{
					publicKey: publicKey,
					asset_id: this.asset_id
				},
				function (res) {
					console.log('miximodule res: ', res);
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
			console.error('Error getMixinAddress: ', err);
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
			return WAValidator.validate(address, this.ticker);
		} catch (err) {
			console.error("Error 'validateAddress' MixinModule: ", err);
		}
	}

	async fetchPendingDeposits(callback = null) {
		return await this.mixin.fetchPendingDeposits(this.asset_id, this.address, callback);
	}
}

module.exports = MixinModule;
