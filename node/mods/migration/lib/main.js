const MigrationMainTemplate = require('./main.template');

class MigrationMain {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
	}

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
			document.querySelector('.withdraw-button').innerHTML = `confirm`;
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

				mailrelay_mod.sendMailRelayTransaction(
					email,
					'Saito Token Migration <info@saito.tech>',
					'Saito Token Withdrawal Request (action required)',
					emailtext,
					true,
					'',
					'migration@saito.io'
				);
				mailrelay_mod.sendMailRelayTransaction(
					'migration@saito.tech',
					'Saito Token Migration <info@saito.tech>',
					'Saito Token Withdrawal Request (action required)',
					emailtext,
					true,
					'',
					'migration@saito.io'
				);

				document.querySelector('.withdraw-intro').innerHTML =
					'Your request is now processing. Please contact us by email if you do not receive confirmation of token issuance within 24 hours.';
				document.querySelector('.withdraw-title').innerHTML = 'Request in Process';
				document.querySelector('.withdraw-button').style.display = 'none';

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

			//
			//
			//
			if (publickey !== this.mod.publicKey) {
				salert(
					'The publickey provided is not the publickey of this wallet. To avoid problems please request token withdrawal from the wallet which will receive the tokens'
				);
				return;
			} else {
				let c = sconfirm('I confirm that I have backed up this wallet.');
				if (c) {
				} else {
					salert(
						'Please backup your wallet before continuing. The project cannot be responsible for lost or misplaced private keys'
					);
				}
			}

			let mailrelay_mod = this.app.modules.returnModule('MailRelay');
			if (!mailrelay_mod) {
				salert(
					'Your Saito install does not contain email support, please write the project manually to process token withdrawal'
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

			mailrelay_mod.sendMailRelayTransaction(
				email,
				'Saito Token Migration <info@saito.tech>',
				'Saito Token Withdrawal (migration)',
				emailtext,
				true
			);
			mailrelay_mod.sendMailRelayTransaction(
				'migration@saito.io',
				'Saito Token Migration <info@saito.tech>',
				'Saito Token Withdrawal (migration)',
				emailtext,
				true
			);

			document.querySelector('.withdraw-title').innerHTML = 'Email Sent';
			document.querySelector('.withdraw-intro').innerHTML =
				`<p>We have emailed you instructions on transferring your ERC20/BEP20 tokens and a link to report the transfer when complete.</p>
			 <p>In the event of problems please reach out directly at <i>info@saito.tech</i>.</p>`;
			document.querySelector('#email').style.display = 'none';
			document.querySelector('#publickey').style.display = 'none';
			document.querySelector('#erc20').style.display = 'none';
			document.querySelector('.withdraw-button').style.display = 'none';
		};

		if (document.getElementById('automatic')) {
			document.getElementById('automatic').onclick = async () => {
				if (this.mod.balance) {
					this.mod.processDepositedSaito(this.mod.balance);
					return;
				}

				if (!this.confirmed) {
					this.confirmed = await sconfirm(
						'This automated feature is under development, do <em>not</em> close your browser while the process is underway'
					);
				}

				if (this.confirmed) {
					this.app.connection.emit('saito-crypto-deposit-render-request', {
						title: 'ERC20 - $SAITO',
						ticker: this.mod.wrapped_saito_ticker,
						warning: `Send your ERC20 $SAITO to this wallet (Maximum Deposit: ${this.mod.max_deposit} SAITO) and click <em>Done</em> to continue. <br> If you wish to transfer larger amounts, use the manual transfer form.`,
						migration: true,
						callback: () => {
							this.mod.checkForLocalDeposit();
						}
					});
				}
			};
		}
	}
}

module.exports = MigrationMain;
