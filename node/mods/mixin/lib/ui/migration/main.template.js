function migrationTitle(ticker) {
  return ticker === 'BEP-SAITO' ? 'Migrate BEP20 SAITO' : 'Migrate ERC20 SAITO';
}

module.exports = (mod) => {
  const instructions = mod.migration_instructions;
  const ticker =
    instructions?.ticker === 'BEP-SAITO' || mod.wrapped_saito_ticker === 'BEP-SAITO'
      ? 'BEP-SAITO'
      : 'ERC-SAITO';
  const status = String(instructions?.status || '');
  const uiStatus = instructions?.ui_status || '';
  const isComplete = status === 'outbound_confirmed' || status === 'succeeded';
  const receivedAmount = instructions?.outbound_amount || instructions?.inbound_amount || '';
  const isIssuing = [
    'outbound_awaiting',
    'outbound_broadcast',
    'treasury_submitted',
    'treasury_accepted'
  ].includes(status);
  const showStatus = Boolean(uiStatus) && status !== 'inbound_awaiting';
  const reservedUntil = Number(instructions?.reserved_until || 0);
  const canExtend = instructions?.address && status === 'inbound_awaiting';

  let body;
  if (isComplete) {
    body = `
      <div class="migration-complete" role="status">
        <img class="migration-complete-logo" src="/saito/img/logo-color.svg" alt="Saito" />
        <div class="saito-overlay-form-text">Migration complete.${receivedAmount ? ` ${receivedAmount} SAITO issued.` : ''}</div>
      </div>
    `;
  } else if (isIssuing) {
    body = '<div class="saito-spinner migration-issuing-spinner" aria-hidden="true"></div>';
  } else if (instructions?.address) {
    body = `
				<div class="saito-overlay-form-text migration-instructions" id="migration-instructions">
          <h2 class="migration-reserved-title">Deposit Address Reserved</h2>
          <div>Send ${ticker === 'BEP-SAITO' ? 'BEP20' : 'ERC20'} SAITO to:</div>
        </div>
        <div class="migration-qrcode qrcode" id="migration-qrcode"></div>
				<div class="migration-deposit-address pubkey-container" id="migration-deposit-address" title="${instructions.address}">
					<span class="profile-public-key">${instructions.address}</span>
					<i class="fas fa-copy" aria-hidden="true"></i>
				</div>
        ${reservedUntil > 0 ? `<div class="saito-overlay-form-text migration-reservation">
          <div>Address reserved for: <span id="migration-time-left">00:00:00</span></div>
          ${canExtend ? `<div class="saito-button-row migration-reservation-actions">
            <button type="button" class="saito-button-secondary" id="migration-extend-reservation">Extend Reservation</button>
          </div>` : ''}
        </div>` : ''}
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
				${!isComplete ? `<div class="saito-overlay-form-header">
					<div class="saito-overlay-form-header-title withdraw-title" id="migration-title" role="status">
						${isIssuing ? (uiStatus || 'Issuing SAITO to your wallet...') : migrationTitle(ticker)}
					</div>
				</div>` : ''}
				${body}
				${!isComplete ? '<div class="saito-overlay-form-text withdraw-outtro"><em>Contact <a href="mailto:migration@saito.io">migration@saito.io</a> for support.</em></div>' : ''}
			</div>
		</div>
	`;
};
