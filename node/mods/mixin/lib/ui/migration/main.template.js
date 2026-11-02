function migrationTitle(ticker) {
  return ticker === 'BEP-SAITO' ? 'Migrate BEP20 SAITO' : 'Migrate ERC20 SAITO';
}

function wrappedLabel(ticker) {
  return ticker === 'BEP-SAITO' ? 'BEP-20' : 'ERC-20';
}

module.exports = (mod) => {
  const instructions = mod.migration_instructions;
  const ticker =
    instructions?.ticker === 'BEP-SAITO' || mod.wrapped_saito_ticker === 'BEP-SAITO'
      ? 'BEP-SAITO'
      : 'ERC-SAITO';
  const status = String(instructions?.status || '');
  const uiStatus = instructions?.ui_status || '';
  const showStatus = Boolean(uiStatus) && status !== 'inbound_awaiting';
  const reservedUntil = Number(instructions?.reserved_until || 0);
  const reservedLabel =
    reservedUntil > 0
      ? new Date(reservedUntil).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short'
        })
      : '';
  const canExtend = instructions?.address && status === 'inbound_awaiting';

  let body;
  if (instructions?.address) {
    body = `
				<div class="migration-qrcode qrcode" id="migration-qrcode"></div>
				<div class="migration-deposit-address pubkey-container" id="migration-deposit-address" title="${instructions.address}">
					<span class="profile-public-key">${instructions.address}</span>
					<i class="fas fa-copy" aria-hidden="true"></i>
				</div>
				<div class="saito-overlay-form-text migration-instructions" id="migration-instructions">
					Send any amount of ${wrappedLabel(ticker)} SAITO to the address above.${
            reservedLabel
              ? ` Deposit address reserved until ${reservedLabel}.${
                  canExtend
                    ? ` <a href="#" id="migration-extend-reservation">Click here</a> to extend if you need more time.`
                    : ''
                }`
              : ''
          }
				</div>
				${
          showStatus
            ? `<div class="migration-status" id="migration-status" role="status">${uiStatus}</div>`
            : ''
        }
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
					<div class="saito-overlay-form-header-title withdraw-title" id="migration-title">
						${migrationTitle(ticker)}
					</div>
				</div>
				${body}
				<div class="saito-overlay-form-text withdraw-outtro">email <a target="_blank" href="mailto:migration@saito.io">migration@saito.io</a> for support</div>
			</div>
		</div>
	`;
};
