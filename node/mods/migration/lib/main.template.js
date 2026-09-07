module.exports = (mod) => {
  const automatic_title = mod.can_auto
    ? `${mod.returnWrappedSaitoLabel()} available`
    : mod.auto_migration_error || 'Checking availability...';
  const escaped_automatic_title = String(automatic_title)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const automatic_content = mod.can_auto
    ? 'automated migration'
    : mod.auto_migration_error
      ? 'automated migration unavailable'
      : '<span class="migration-button-spinner" aria-hidden="true"></span><span>automated</span>';

  return `		<div class="main">
			<div class="saito-overlay-form withdraw-container">
				<div class="saito-overlay-form-header">
					<div class="saito-overlay-form-header-title withdraw-title">
						Migrate wrapped SAITO
					</div>
				</div>

				<div class="withdraw-intro">
					To convert ERC20-wrapped or BEP20-wrapped SAITO tokens to the on-chain network, please provide an
					email address and on-chain Saito address.
				</div>

				<div class="withdraw-form-fields">
					<input class="saito-input" type="text" id="email" name="email" placeholder="your email" style="font-size: 2.2rem;padding: 1rem;" />
					<input class="saito-input" type="text" id="erc20" placeholder="ethereum/bsc address"  style="font-size: 2.2rem;padding: 1rem;" />
					<input class="saito-input" type="text" id="publickey" placeholder="saito address" value="${mod.publicKey}" title="this is your saito publickey" style="font-size: 2.2rem;padding: 1rem;" />
					<select class="saito-select" id="wrapped-saito-ticker" aria-label="Wrapped SAITO network">
						<option value="ERC-SAITO" ${mod.wrapped_saito_ticker === 'ERC-SAITO' ? 'selected' : ''}>ERC20 SAITO (Ethereum)</option>
						<option value="BEP-SAITO" ${mod.wrapped_saito_ticker === 'BEP-SAITO' ? 'selected' : ''}>BEP20 SAITO (BNB Smart Chain)</option>
					</select>
					<div class="saito-button-row auto-size">
						<button id="withdraw-button" class="saito-button-secondary fat">manual</button>
						<button id="automatic" class="saito-button-primary fat" ${mod.can_auto ? '' : 'disabled'} title="${escaped_automatic_title}" aria-busy="${!mod.can_auto && !mod.auto_migration_error}">${automatic_content}</button>
					</div>
				</div>
				<div class="footer-note">Want to buy SAITO?<br>Visit our <a href="/buy">purchase portal</a>.</div>
				<div class="withdraw-outtro">Any problems? Write us any time at <a target="_blank" href="mailto:migration@saito.io" >migration@saito.io</a>. </div>
			</div>
		</div>
	`;
};
