module.exports = (mod) => {
	return `		<div class="main">
			<div class="saito-overlay-form withdraw-container">
				<div class="saito-overlay-form-header">
					<div class="saito-overlay-form-header-title withdraw-title">
						Convert ERC20 or BEP20 Saito
					</div>
				</div>

				<div class="withdraw-intro">
					To convert ERC20/BEP20 wrapped SAITO tokens to the on-chain network, please provide an
					email address and on-chain Saito address.
					<br /><br />
					We will email the address provided with instructions on completing the token transfer.
				</div>

				<div class="withdraw-form-fields">
					<input type="text" id="email" name="email" placeholder="your email" />
					<input type="text" id="erc20" placeholder="ethereum/bsc address" />
					<input type="text" id="publickey" placeholder="saito address" value="${mod.publicKey}" title="this is your saito publickey"/>
					<div class="saito-button-row">
						<div id="automatic" class="saito-anchor ${mod.can_auto ? '' : 'hideme'}"><span>automated migration</span></div>
						<button id="withdraw-button" class="saito-button-primary">submit</button>
					</div>
				</div>

				<!--div class="withdraw-outtro">
					Given the current
					<a href="https://wiki.saito.io/en/tokenomics" target="_blank"
						>Token Persistence Threshold</a
					>, transfers of less than 5,500 Tokens will be rejected.
				</div>
			</div>
		</div>

	`;
};
