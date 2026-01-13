const MigrationMainTemplate = require('./main.template');
const SaitoUser = require('./../../../lib/saito/ui/saito-user/saito-user');
const SaitoOverlay = require('../../../lib/saito/ui/saito-overlay/saito-overlay');

class MigrationMain {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(this.app, this, false);
	}

	/**
	 * First render -- manual form / disabled automated migration button
	 * Second render -- enables button
	 * #automatic.onclick -> launch an overlay form
	 *
	 */
	async render() {
		if (document.querySelector('.main')) {
			this.app.browser.replaceElementBySelector(MigrationMainTemplate(this.mod), '.main');
		} else {
			this.app.browser.addElementToDom(MigrationMainTemplate(this.mod));
		}

		this.attachEvents();
	}

	attachEvents() {
		let pk = this.app.browser.returnURLParameter('publickey');
		let erc20 = this.app.browser.returnURLParameter('erc20');
		let email = this.app.browser.returnURLParameter('email');

		let el = document.querySelector('#withdraw-button');

		if (pk && erc20) {
			document.querySelector('.withdraw-title').innerHTML = 'Confirm Transfer';
			document.querySelector('.withdraw-intro').innerHTML =
				`Please confirm your ERC20/BEP20 transfer is complete`;
			document.querySelector('#withdraw-button').innerHTML = `confirm`;
			document.querySelector('#email').style.display = 'none';
			document.querySelector('#publickey').style.display = 'none';
			document.querySelector('#erc20').style.display = 'none';

			el.onclick = (e) => {
				let mailrelay_mod = this.app.modules.returnModule('MailRelay');
				if (!mailrelay_mod) {
					salert(
						'Your Saito install does not contain email support, please write the project manually to complete token withdrawal'
					);
					return;
				}

				let emailtext = `
			      <div>
				    <p>Dear Saitozen,</p>
			     	<p>Token withdrawal requested:</p>
					<p>From: ${erc20}</p>
					<p>To: ${pk}</p>
					<p>Email: ${email}</p>
					<p>Token transfer should be recorded at:</p>
					<p>0x24F10EA2827717770270e3cc97F015Ba58fcB9b6</p>
			 	    <p>-- Saito Migration Transfer Service</p>
				`;

				// to, from, subject, text, ishtml, attachments, bcc
				mailrelay_mod.sendMailRelayTransaction({
					to: email,
					from: 'Saito Token Migration <info@saito.tech>',
					subject: 'Saito Token Withdrawal Request (action required)',
					html: emailtext,
					ishtml: true,
					bcc: 'migration@saito.io'
				});
				mailrelay_mod.sendMailRelayTransaction({
					to: 'migration@saito.tech',
					from: 'Saito Token Migration <info@saito.tech>',
					subject: 'Saito Token Withdrawal Request (action required)',
					html: emailtext,
					ishtml: true,
					bcc: 'migration@saito.io'
				});

				document.querySelector('.withdraw-intro').innerHTML =
					'Your request is now processing. Please contact us by email if you do not receive confirmation of token issuance within 24 hours.';
				document.querySelector('.withdraw-title').innerHTML = 'Request in Process';
				document.querySelector('#withdraw-button').style.display = 'none';

				this.mod.sendStoreMigrationTransaction(this.app, this.mod, {
					pk: pk,
					erc20: erc20,
					email: email
				});
			};

			return;
		}

		el.onclick = (e) => {
			let email = document.querySelector('#email').value;
			let erc20 = document.querySelector('#erc20').value;
			let publickey = document.querySelector('#publickey').value;

			let mailrelay_mod = this.app.modules.returnModule('MailRelay');
			if (!mailrelay_mod) {
				salert(
					'Your Saito install does not contain email support, please write the project manually to process token withdrawal'
				);
				return;
			}

			//
			//
			//
			if (publickey !== this.mod.publicKey) {
				salert(
					'The publickey provided is not the publickey of this wallet. To avoid problems please request token withdrawal from the wallet which will receive the tokens'
				);
				return;
			}

			let emailtext = `
				<div>
			      <p>Dear Saitozen,</p>
			      <p>You have provided the following ERC20/BEP20 address:</p>
			      <p>${erc20}</p>
			      <p>And the following Saito address / publickey:</p>
			      <p>${publickey}</p>
			      <p>If this information is correct, complete your withdrawal by sending your ERC20 or BEP20 tokens to our monitored multisig address:</p>
			      <p>0x24F10EA2827717770270e3cc97F015Ba58fcB9b6</p>
				  <p>(Note, the address is the same on both networks.)</b>
			      <p>Once the transfer is complete, please click on the following link and confirm the submission - our team will complete the transfer within 24 hours:</p>
			      <p>http://saito.io/migration?publickey=${publickey}&erc20=${erc20}&email=${email}</p>
			      <p>Please reach out by email if you do not hear from us in a day.</p>
			      <p>-- The Saito Team</p> 
			    </div>
			`;

			mailrelay_mod.sendMailRelayTransaction({
				to: email,
				from: 'Saito Token Migration <info@saito.tech>',
				subject: 'Saito Token Withdrawal (migration)',
				html: emailtext,
				ishtml: true
			});
			mailrelay_mod.sendMailRelayTransaction({
				to: 'migration@saito.io',
				from: 'Saito Token Migration <info@saito.tech>',
				subject: 'Saito Token Withdrawal (migration)',
				html: emailtext,
				ishtml: true
			});

			document.querySelector('.withdraw-title').innerHTML = 'Email Sent';
			document.querySelector('.withdraw-intro').innerHTML =
				`<p>We have emailed you instructions on transferring your ERC20/BEP20 tokens and a link to report the transfer when complete.</p>
			 <p>In the event of problems please reach out directly at <i>info@saito.tech</i>.</p>`;
			document.querySelector('#email').style.display = 'none';
			document.querySelector('#publickey').style.display = 'none';
			document.querySelector('#erc20').style.display = 'none';
			document.querySelector('#automatic').style.display = 'none';
			document.querySelector('#withdraw-button').style.display = 'none';
		};

		if (document.getElementById('automatic')) {
			document.getElementById('automatic').onclick = async () => {
				if (this.mod.balance) {
					this.processDepositedSaito(this.mod.balance);
					return;
				}

				this.app.connection.emit('saito-backup-render-request', {
					msg: 'Backup your wallet before initiating automated ERC-20 to mainnet token migration',
					success_callback: () => {
						this.app.connection.emit('saito-crypto-deposit-render-request', {
							title: 'My Deposit Address',
							ticker: this.mod.wrapped_saito_ticker,
							warning: `<div>Reminder: send only ERC-20 SAITO</div><div>Max Deposit: ${this.mod.max_deposit}</div><div>Click <em>'Done'</em> to check on deposit.</div>`,
							migration: true,
							callback: () => {
								//
								// Double check the Migration bot can handle our transfer
								//
								this.mod.sendMigrationPingTransaction(
									{
										mixin_address: this.mod.ercMod.formatAddress(),
										double_check: true
									},
									true
								);
							}
						});
					}
				});
			};
		}
	}

	/***
	 * Final step of Automated Migration
	 * */
	processDepositedSaito(new_balance) {
		let html = `
	        <div id="saito-deposit-form" class="saito-overlay-form saito-crypto-deposit-container saito-overlay-size narrow">
	            <div class="saito-overlay-form-header">
	                <div class="saito-overlay-form-header-title">Deposited</div>
	            </div>
	            <div class="saito-crypto-deposit-content"><div>`;

		if (this.mod.balance) {
			html += `<div>${this.mod.balance} ERC20 SAITO pending conversion into </div>`;
		} else {
			html += `<div>Deposited ${new_balance} ERC20 SAITO into </div>`;
		}
		html += `<div class=""> ${this.mod.publicKey.slice(0, 8)}...${this.mod.publicKey.slice(-8)} </div>`;

		if (new_balance > this.mod.max_deposit) {
			html += `<div>Click to convert the maximum of ${this.mod.max_deposit} into on chain SAITO. The remaining ${new_balance - this.mod.max_deposit} SAITO will be safe on your wallet (please back it up!!!), 
					let omskian@saito [Richard] know that the migration bot is out of money. 
					When it is refilled, you'll be able to convert the rest just be revisiting this page.</div>`;
		} else {
			html += `<div>Click next to convert to on chain SAITO</div></div>`;
		}

		html += `</div>

	        <div class="saito-button-row">
	           <button type="button" class="saito-button-primary" id='submit'>Convert</button> 
	        </div>

			`;

		this.overlay.show(html);

		const sendCallback = (robj) => {
			if (robj?.err) {
				salert('Migration Error: <br> ' + robj.err);
				return;
			}

			try {
				this.overlay.remove();
				document.querySelector('.withdraw-title').innerHTML = 'Converting saito';
				this.app.browser.addElementToSelectorOrDom(
					'<div class="saito-overlay-form-header-content">2 of 2</div>',
					'.saito-overlay-form-header'
				);
				document.querySelector('.withdraw-intro').innerHTML =
					'Check your wallet in the side bar ->';
				document.querySelector('.withdraw-form-fields').remove();
			} catch (err) {
				console.warn('UI errors...', err);
			}
		};

		if (document.getElementById('submit')) {
			document.getElementById('submit').onclick = (e) => {
				e.currentTarget.remove();
				let sender = this.mod.ercMod.formatAddress();

				let amount = Math.min(new_balance, this.mod.max_deposit).toFixed(8);

				if (document.querySelector('.saito-overlay-form-header-title')) {
					document.querySelector('.saito-overlay-form-header-title').innerHTML =
						`Converting ${new_balance > this.mod.max_deposit ? 'only' : ''} ${amount} ERC20 SAITO...`;
				}

				let unique_hash = this.app.crypto.hash(
					Buffer.from(sender + this.mod.migration_mixin_address + amount + 'ERC-SAITO', 'utf-8')
				);

				if (this.mod.local_dev) {
					//Fake payment
					this.mod.ercMod.sendPaymentTransaction(
						this.mod.migration_publickey,
						this.mod.ercMod.formatAddress(),
						this.mod.migration_mixin_address,
						amount,
						unique_hash
					);
					sendCallback({});
					return;
				}

				this.app.wallet.sendPayment(
					this.mod.wrapped_saito_ticker,
					[this.mod.ercMod.formatAddress()],
					[this.mod.migration_mixin_address],
					[amount],
					unique_hash,
					sendCallback,
					this.mod.migration_publickey
				);
			};
		}
	}
}

module.exports = MigrationMain;
