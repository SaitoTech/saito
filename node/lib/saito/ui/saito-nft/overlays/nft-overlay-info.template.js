module.exports = (app, mod, nft_overlay) => {
  let can_merge = false;
  let all_slips = nft_overlay.nft.returnAllSlips() || [];
  let nft = nft_overlay.nft;

  nft_overlay.all_slips = all_slips;

  if (nft.getSlipCount() > 1 && mod.publicKey == nft.slip2.public_key) {
    can_merge = true;
  }

  const isPresent = (v) => {
    if (v == null) {
      return false;
    }
    const s = String(v).trim();
    return s !== '' && s !== 'N/A';
  };

  const escapeHtml = (v) =>
    String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const infoRow = (label, value, { mono = true, prose = false } = {}) => {
    if (!isPresent(value)) {
      return '';
    }
    const valueClass = [
      'nft-info-value',
      mono ? 'nft-info-value-mono' : '',
      prose ? 'nft-info-value-prose' : ''
    ]
      .filter(Boolean)
      .join(' ');
    return `
      <div class="nft-info-row">
        <div class="nft-info-label">${escapeHtml(label)}</div>
        <div class="${valueClass}">${escapeHtml(value)}</div>
      </div>
    `;
  };

  let nft_id = nft?.id || '';
  let creator = nft?.creator || nft?.slip1?.public_key || '';

  let creationInfo = nft_overlay.decodeSlip3CreationInfo();
  let block_id = creationInfo.block_id;
  let tx_ordinal = creationInfo.tx_ordinal;
  let createdInDisplay =
    isPresent(block_id) && isPresent(tx_ordinal)
      ? `Block ${block_id} · Transaction ${tx_ordinal}`
      : '';

  let metadata = nft_overlay.extractMetadata();
  let metadataRows = '';
  for (let key in metadata) {
    let value = metadata[key];
    if (value == null || value === '') {
      continue;
    }
    if (typeof value === 'object') {
      value = JSON.stringify(value, null, 2);
    }
    if (!isPresent(value)) {
      continue;
    }
    metadataRows += infoRow(key, value, { mono: true, prose: String(value).includes('\n') });
  }

  let infoTableHtml = `
    <div class="nft-info-table">
      ${infoRow('NFT ID', nft_id)}
      ${infoRow('Created By', creator)}
      ${infoRow('Created In', createdInDisplay, { mono: false })}
      ${infoRow('Description', nft.description, { mono: false, prose: true })}
      ${metadataRows}
    </div>
  `;

  let mergeButtonHtml = can_merge
    ? `<button class="saito-button-primary saito-nft-footer-btn merge">Merge</button>`
    : '';

  if (!all_slips.length) {
    all_slips.push(nft_overlay.nft);
  }

  let canDeleteFooter = all_slips.some((slip) => mod.publicKey == slip.slip2?.public_key);
  let deleteFooterHtml = canDeleteFooter
    ? `<button type="button" class="saito-button-secondary saito-nft-footer-btn nft-info-delete-nft">disolve</button>`
    : '';
  let footerSpacerHtml = `<span class="saito-nft-footer-spacer"></span>`;

  let splitUtxosHtml = '';
  let splitSlidersHtml = '';

  if (all_slips.length > 0) {
    for (let z = 0; z < all_slips.length; z++) {
      let utxoIdx = z + 1;
      let slip = all_slips[z];

      let uuid = '';
      if (slip.slip1) {
        let blockId = slip.slip1.block_id;
        let txOrdinal = slip.slip1.tx_ordinal;
        let slipIndex = slip.slip1.slip_index;
        if (isPresent(blockId) && isPresent(txOrdinal) && slipIndex !== undefined) {
          uuid = `${blockId}-${txOrdinal}-${slipIndex}`;
        }
      }

      let amount = Number(slip.slip1.amount) || 0;
      let deposit = app.wallet.convertNolanToSaito(slip.slip2.amount);
      let splitButtonHtml = '',
        depositButtonHtml = '',
        deleteButtonHtml = '';

      if (mod.publicKey == slip.slip2.public_key) {
        deleteButtonHtml = `<button type="button" class="utxo-delete-btn" data-utxo-idx="${utxoIdx}">disolve</button>`;
      }

      if (amount > 1 && mod.publicKey == slip.slip2.public_key) {
        splitButtonHtml = `<button type="button" class="utxo-split-btn" data-utxo-idx="${utxoIdx}">split</button>`;
      }

      if (false && slip.slip2.public_key) {
        depositButtonHtml = `<button type="button" class="utxo-deposit-btn" data-utxo-idx="${utxoIdx}">deposit</button>`;
      }

      const slipRows = [
        isPresent(uuid)
          ? `<div class="nft-slip-box-row">
              <div class="nft-slip-box-label">UUID</div>
              <div class="nft-slip-box-value nft-slip-box-value-mono">${escapeHtml(uuid)}</div>
            </div>`
          : '',
        `<div class="nft-slip-box-row">
            <div class="nft-slip-box-label">Units</div>
            <div class="nft-slip-box-value">${escapeHtml(slip.slip1.amount)}</div>
          </div>`,
        `<div class="nft-slip-box-row">
            <div class="nft-slip-box-label">Deposit</div>
            <div class="nft-slip-box-value">${escapeHtml(deposit)} SAITO</div>
          </div>`
      ].join('');

      const actionsHtml =
        deleteButtonHtml || depositButtonHtml || splitButtonHtml
          ? `<div class="nft-slip-box-actions">
              ${deleteButtonHtml}
              ${depositButtonHtml}
              ${splitButtonHtml}
            </div>`
          : '';

      splitUtxosHtml += `
        <div class="nft-slip-box utxo-${utxoIdx}" id="utxo_${utxoIdx}">
          <div class="nft-slip-box-index">Slip ${utxoIdx}</div>
          ${slipRows}
          ${actionsHtml}
        </div>
      `;

      splitSlidersHtml += `
        <div class="saito-nft-split-overlay split-container-utxo-${utxoIdx}" data-utxo-idx="${utxoIdx}">
          <div class="split-instructions">
            Adjust this slider to manually split your NFT into two parts. When you are happy with the new allocation, click the "split" button to make the transaction that divides it.
          </div>
          <div class="split-slider-wrapper">
            <div class="split-number-box split-number-left-utxo-${utxoIdx}" id="split-number-left-utxo-${utxoIdx}">0</div>
            <div class="fancy-slider-bar" id="split-slider-utxo-${utxoIdx}">
              <div class="split-half split-half-left split-left-utxo-${utxoIdx}" id="split-left-utxo-${utxoIdx}"></div>
              <div class="split-bar split-bar-utxo-${utxoIdx}" id="split-bar-utxo-${utxoIdx}"></div>
              <div class="split-half split-half-right split-right-utxo-${utxoIdx}" id="split-right-utxo-${utxoIdx}"></div>
            </div>
            <div class="split-number-box split-number-right-utxo-${utxoIdx}" id="split-number-right-utxo-${utxoIdx}">0</div>
          </div>
          <div class="split-buttons-container">
            <button class="split-button split-return-button split-return-button-utxo-${utxoIdx}">Cancel</button>
            <div class="split-buttons-right">
              <button class="split-button split-button-utxo-${utxoIdx}">split</button>
            </div>
          </div>
        </div>
      `;
    }
  }

  let slipsContainerHtml = '';
  if (all_slips.length > 0) {
    slipsContainerHtml = `
      <div class="nft-slips-container">
        <div class="nft-slips-title">UTXO / Slips</div>
        <div class="nft-slips-flex">
          ${splitUtxosHtml}
        </div>
      </div>
    `;
  }

  return `
    <div class="saito-nft-panel saito-nft-panel-info">
      <div class="saito-nft-panel-body">
        ${infoTableHtml}
        ${slipsContainerHtml}
        ${splitSlidersHtml}
      </div>
      <div class="saito-nft-split-utxo"></div>
      <footer class="saito-nft-panel-footer">
        <button type="button" class="saito-button-square saito-nft-info-back" aria-label="Back">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
        </button>
        ${footerSpacerHtml}
        ${deleteFooterHtml}
        ${mergeButtonHtml}
      </footer>
    </div>
  `;
};
