module.exports = (mod) => {
  const instructions = mod.migration_instructions;
  const ticker = mod.wrapped_saito_ticker === 'BEP-SAITO' ? 'BEP-SAITO' : 'ERC-SAITO';
  const networkLabel =
    instructions?.ticker === 'BEP-SAITO' || ticker === 'BEP-SAITO'
      ? 'BEP20 SAITO (BNB Smart Chain)'
      : 'ERC20 SAITO (Ethereum)';
  const status = instructions?.ui_status || '';
  const reservedUntil = Number(instructions?.reserved_until || 0);
  const reservedLabel =
    reservedUntil > 0
      ? new Date(reservedUntil).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short'
        })
      : '';

  let body;
  if (instructions?.address) {
    body = `
				<div class="saito-overlay-form-text withdraw-intro">
					Send any amount of ${instructions.ticker || ticker} to the reserved deposit address below. The amount you send is issued 1:1 as native SAITO.
				</div>
				<div class="migration-network" id="migration-network">${networkLabel}</div>
				<div class="migration-deposit-address" id="migration-deposit-address">${instructions.address}</div>
				${
          reservedLabel
            ? `<div class="migration-reservation-expiry" id="migration-reservation-expiry">Address reserved until ${reservedLabel}</div>`
            : ''
        }
				<div class="migration-status" id="migration-status" role="status">${status || 'Waiting for your deposit...'}</div>
			`;
  } else {
    body = `
				<div class="saito-overlay-form-text withdraw-intro">
					Select the wrapped SAITO network to migrate to mainnet
				</div>
				<div class="withdraw-form-fields">
					<input class="saito-input" type="text" id="publickey" placeholder="saito address" value="${mod.publicKey || ''}" title="this is your saito publickey" readonly />
					<select class="saito-form-select" id="wrapped-saito-ticker" aria-label="Wrapped SAITO network">
						<option value="ERC-SAITO" ${ticker === 'ERC-SAITO' ? 'selected' : ''}>ERC20 SAITO (Ethereum)</option>
						<option value="BEP-SAITO" ${ticker === 'BEP-SAITO' ? 'selected' : ''}>BEP20 SAITO (BNB Smart Chain)</option>
					</select>
					<div class="saito-button-row">
						<button id="migrate" class="saito-button-primary fat" type="button">Migrate</button>
					</div>
				</div>
			`;
  }

  return `		<div class="main migration-page">
			<div class="saito-overlay-form saito-overlay-panel withdraw-container">
				<div class="saito-overlay-form-header">
					<div class="saito-overlay-form-header-title withdraw-title">
						Migrate wrapped SAITO
					</div>
				</div>
				${body}
				<div class="saito-overlay-form-text footer-note"><a href="/buy">or purchase SAITO online</a></div>
				<div class="saito-overlay-form-text withdraw-outtro">Any problems? Write us any time at <a target="_blank" href="mailto:migration@saito.io" >migration@saito.io</a>. </div>
			</div>
		</div>
	`;
};
