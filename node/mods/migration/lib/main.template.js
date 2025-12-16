module.exports = (mod) => {
	return `		<div class="main">
			<div class="saito-overlay-form withdraw-container">
				<div class="saito-overlay-form-header">
					<div class="saito-overlay-form-header-title withdraw-title">
						Convert ERC20 Saito
					</div>
				</div>

				<div class="withdraw-intro">
					To convert ERC20-wrapped SAITO tokens to the on-chain network, please provide an
					email address and on-chain Saito address.
				</div>

				<div class="withdraw-form-fields">
					<input type="text" id="email" name="email" placeholder="your email" style="font-size: 2.2rem;padding: 1rem;" />
					<input type="text" id="erc20" placeholder="ethereum/bsc address"  style="font-size: 2.2rem;padding: 1rem;" />
					<input type="text" id="publickey" placeholder="saito address" value="${mod.publicKey}" title="this is your saito publickey" style="font-size: 2.2rem;padding: 1rem;" />
					<div class="saito-button-row auto-size">
						<button id="withdraw-button" class="saito-button-secondary fat">manual migration</button>
						<button id="automatic" class="saito-button-primary fat" ${mod.can_auto ? '' : 'disabled'}>automated migration</button>
					</div>
				</div>

				<div class="withdraw-outtro">Any problems with migration? Write us anytime at migration@saito.io. </div>
			</div>
		</div>
	`;
};
