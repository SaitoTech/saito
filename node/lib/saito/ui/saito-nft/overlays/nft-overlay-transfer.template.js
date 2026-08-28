module.exports = (app, mod, nft_overlay) => {
  const allSlips = nft_overlay.nft.returnAllSlips() || [];
  let availableAmount = 0n;
  for (const slip of allSlips) {
    try {
      availableAmount += BigInt(slip?.slip1?.amount || 0);
    } catch (err) {
      console.warn('Invalid NFT amount in transfer form:', slip?.slip1?.amount);
    }
  }
  let availableDisplay = availableAmount.toString();
  if (app.browser?.formatLocaleAmount) {
    availableDisplay = app.browser.formatLocaleAmount(availableAmount.toString(), {
      maxFractionDigits: 0,
      strictLocaleSeparators: false
    });
  }

  let html = `
    <div class="saito-nft-panel saito-nft-panel-send">
      <div class="saito-nft-panel-body">
        <section id='transfer-info-panel'>
          <h2 class="saito-nft-mode-title">Send NFT</h2>
          <label class="saito-nft-input-label" for="nft-receiver-address">Recipient Address</label>
          <div class="nft-send-input-row nft-recipient-input-row">
            <input
              type="text"
              autocomplete="off"
              spellcheck="false"
              class="saito-input"
              id="nft-receiver-address"
              aria-describedby="nft-recipient-status"
              required
            />
            <div class="nft-send-input-actions">
              <button type="button" class="saito-icon-button" id="nft-paste-address" title="Paste address" aria-label="Paste recipient address">
                <i class="fa-solid fa-paste" aria-hidden="true"></i>
              </button>
              <button type="button" class="saito-icon-button" id="nft-scan-address" title="Scan QR code" aria-label="Scan recipient QR code">
                <i class="fa-solid fa-qrcode" aria-hidden="true"></i>
              </button>
              <button type="button" class="saito-icon-button" id="nft-address-book" title="Contacts" aria-label="Open contacts">
                <i class="fa-solid fa-users" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div class="nft-recipient-preview hide-element" id="nft-recipient-status" aria-live="polite"></div>
          <div class="nft-send-label-row">
            <label class="saito-nft-input-label" for="nft-send-amount">Amount</label>
            <span class="nft-send-balance">Balance: <strong id="nft-send-balance">${availableDisplay}</strong></span>
          </div>
          <div class="nft-send-amount-row">
            <input
              type="text"
              autocomplete="off"
              inputmode="numeric"
              pattern="[0-9]*"
              class="saito-input"
              id="nft-send-amount"
              value=""
              required
            />
            <div class="nft-send-amount-actions">
              <button type="button" class="nft-send-max-btn" title="Use maximum amount">MAX</button>
              <span
                class="nft-amount-status hide-element"
                id="nft-amount-status"
                role="status"
                aria-label=""
                tabindex="-1"
              >
                <i class="fa-solid fa-check" aria-hidden="true"></i>
              </span>
            </div>
            <div class="nft-amount-tooltip" id="nft-amount-tooltip" role="tooltip"></div>
          </div>
        </section>
  `;

  let splitUtxosHtml = '';
  let utxoIdx = 0;
  for (let slip of allSlips) {
    utxoIdx++;

    let uuid = 'N/A';
    if (slip.slip1) {
      let blockId = slip.slip1.block_id || 'N/A';
      let txOrdinal = slip.slip1.tx_ordinal || 'N/A';
      let slipIndex = slip.slip1.slip_index !== undefined ? slip.slip1.slip_index : 'N/A';
      uuid = `${blockId}-${txOrdinal}-${slipIndex}`;
    }

    splitUtxosHtml += `
        <div class="${utxoIdx == 1 ? 'selected-shard' : ''} nft-slip-box utxo-${utxoIdx}" data-utxo-idx="${utxoIdx}">
          <div class="nft-slip-box-row">
            <div class="nft-slip-box-label">UUID:</div>
            <div class="nft-slip-box-value">${uuid}</div>
          </div>
          <div class="nft-slip-box-row">
            <div class="nft-slip-box-label">amount:</div>
            <div class="nft-slip-box-value">${slip.slip1.amount}</div>
          </div>
          <div class="nft-slip-box-row">
            <div class="nft-slip-box-label">deposit:</div>
            <div class="nft-slip-box-value">${app.wallet.convertNolanToSaito(slip.slip2.amount)} SAITO</div>
          </div>
        </div>
      `;
  }

  html += `
        <div class="nft-advanced-options collapsed">
          <button type="button" class="nft-advanced-toggle" aria-expanded="false">
            <i class="fa-solid fa-caret-right nft-advanced-caret"></i>
            <span>Advanced Options</span>
          </button>
          <div class="nft-advanced-content">
            <div class="nft-slips-container">
              <div class="nft-slips-title">AVAILABLE SHARDS</div>
              <div class="nft-slips-flex">
                ${splitUtxosHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <footer class="saito-nft-panel-footer">
        <button type="button" class="saito-button-square saito-nft-send-back" aria-label="Back">
          <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
        </button>
        <span class="saito-nft-footer-spacer"></span>
        <button type="button" class="saito-button-primary saito-nft-footer-btn saito-nft-confirm-btn" disabled>Send</button>
      </footer>
    </div>
    `;

  return html;
};
