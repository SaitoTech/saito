/**
 * Presentational helpers for the unlock transaction panel.
 * Display-only — does not construct or mutate transactions.
 * Shows imported inputs + user outputs only (fee funding is hidden).
 */

const {
  escapeHtml,
  formatNolanAmount,
  remainingSaitoNolan,
  remainingNftUnits,
  unlockBaseOutputs,
  isNftSlip
} = require('./unlock_tx_edit');
const { hasUnlockFee } = require('./unlock_tx_fee');

function controllingPublicKey(ctx) {
  if (!ctx) {
    return '';
  }
  if (ctx.p2shAddress) {
    return String(ctx.p2shAddress);
  }
  if (ctx.assetType === 'nft' && ctx.lockedNftSlips?.[1]) {
    return String(ctx.lockedNftSlips[1].publicKey || ctx.lockedNftSlips[1].public_key || '');
  }
  return String(ctx.lockedSlip?.publicKey || ctx.lockedSlip?.public_key || '');
}

/**
 * Locked asset inputs from unlockContext only (no wallet fee inputs).
 */
function unlockInputRows(app, mod) {
  const ctx = mod?.unlockContext;
  const rows = [];

  if (ctx) {
    const pubkey = controllingPublicKey(ctx);

    if (ctx.assetType === 'nft') {
      const remaining = remainingNftUnits(mod);
      const locked = (() => {
        try {
          return BigInt(
            ctx.nftAmount ||
              (ctx.lockedNftSlips?.[1] ? String(ctx.lockedNftSlips[1].amount || 1) : '1')
          );
        } catch (_err) {
          return BigInt(1);
        }
      })();
      const spent = remaining < locked;
      const unitsText = `${remaining.toString()} unit${remaining === BigInt(1) ? '' : 's'}`;
      rows.push({
        kind: 'nft',
        role: 'locked',
        title: 'NFT',
        meta: pubkey,
        value: spent ? `${escapeHtml(unitsText)} remaining` : escapeHtml(unitsText),
        selectable: true
      });
    } else {
      const remaining = remainingSaitoNolan(mod);
      const locked = (() => {
        try {
          return BigInt(ctx.lockedSlip?.amount || 0);
        } catch (_err) {
          return BigInt(0);
        }
      })();
      const saito = formatNolanAmount(app, remaining);
      const spent = remaining < locked;
      rows.push({
        kind: 'saito',
        role: 'locked',
        title: 'SAITO',
        meta: pubkey,
        value: spent
          ? `${escapeHtml(saito)} SAITO remaining`
          : `${escapeHtml(saito)} SAITO`,
        selectable: true
      });
    }
  }

  return rows;
}

/**
 * User outputs from unlock_transaction_base only.
 */
function unlockOutputRows(app, mod) {
  return unlockBaseOutputs(mod).map((slip, index) => {
    const kind = isNftSlip(slip) ? 'nft' : 'saito';
    const title = kind === 'nft' ? 'NFT' : 'SAITO';
    const destination = String(slip?.publicKey || slip?.public_key || '');
    let value = '';
    try {
      const amount = BigInt(slip?.amount || 0);
      if (kind === 'saito') {
        value = `${formatNolanAmount(app, amount)} SAITO`;
      } else {
        value = `${amount.toString()} unit${amount === BigInt(1) ? '' : 's'}`;
      }
    } catch (_err) {
      value = String(slip?.amount || '');
    }
    return {
      kind,
      role: 'user',
      title,
      meta: destination,
      value: escapeHtml(value),
      index,
      deletable: true
    };
  });
}

function inputRowMarkup(row, index, selectedIndex = null) {
  const selectable = row.selectable !== false;
  const selected = selectable && selectedIndex != null && Number(selectedIndex) === index;
  const meta = row.meta
    ? `<div class="rs-tx-asset-meta" title="${escapeHtml(row.meta)}">${escapeHtml(row.meta)}</div>`
    : '';

  return `
    <article
      class="rs-tx-asset rs-tx-input${selected ? ' is-selected' : ''}"
      data-kind="${escapeHtml(row.kind || '')}"
      data-role="${escapeHtml(row.role || 'locked')}"
      data-input-index="${index}"
      tabindex="0"
      role="button"
      aria-pressed="${selected ? 'true' : 'false'}"
    >
      <div class="rs-tx-asset-main">
        <div class="rs-tx-asset-row">
          <span class="rs-tx-asset-title">${escapeHtml(row.title)}</span>
          <span class="rs-tx-asset-value">${row.value || ''}</span>
        </div>
        ${meta}
      </div>
    </article>`;
}

function outputRowMarkup(row) {
  const meta = row.meta
    ? `<div class="rs-tx-asset-meta" title="${escapeHtml(row.meta)}">${escapeHtml(row.meta)}</div>`
    : `<div class="rs-tx-asset-meta">Destination pending</div>`;
  const deleteAttrs = row.deletable
    ? `tabindex="0" role="button" aria-label="Delete output" data-output-index="${row.index}"`
    : `data-output-index="${row.index}"`;

  return `
    <article
      class="rs-tx-asset rs-tx-output"
      data-kind="${escapeHtml(row.kind || '')}"
      data-role="${escapeHtml(row.role || 'user')}"
      ${deleteAttrs}
    >
      <div class="rs-tx-asset-main">
        <div class="rs-tx-asset-row">
          <span class="rs-tx-asset-title">${escapeHtml(row.title)}</span>
          <span class="rs-tx-asset-value">${row.value || ''}</span>
        </div>
        ${meta}
      </div>
    </article>`;
}

function feeActionMarkup(mod) {
  if (hasUnlockFee(mod)) {
    const label = String(mod.unlock_fee.feeSaito || '').trim() || '0';
    return `<span class="rs-tx-fee-status" title="Fee is locked for this unlock">Fee: ${escapeHtml(label)} SAITO <span class="rs-tx-fee-check" aria-hidden="true">✓</span></span>`;
  }
  return `<button type="button" class="saito-text-link rs-tx-fee-action" data-action="set-fee">+ set transaction fee</button>`;
}

function unlockTransactionPanelMarkup({
  inputs = [],
  outputs = [],
  selectedInputIndex = null,
  mod = null
} = {}) {
  const inputsHtml = inputs.length
    ? inputs
        .map((row, index) => inputRowMarkup(row, index, selectedInputIndex))
        .join('')
    : `<p class="rs-tx-empty">No inputs loaded.</p>`;

  const outputsBlock =
    outputs.length > 0
      ? `
        <section class="rs-tx-section rs-tx-outputs">
          <h3 class="rs-tx-section-title">Outputs</h3>
          <div class="rs-tx-asset-list">
            ${outputs.map(outputRowMarkup).join('')}
          </div>
        </section>`
      : '';

  return `
    <div class="rs-panel-ref rs-panel-ref-unlock-tx">
      <div class="rs-tx-panel">
        <section class="rs-tx-section rs-tx-inputs">
          <div class="rs-tx-section-head">
            <h3 class="rs-tx-section-title">Inputs</h3>
            ${feeActionMarkup(mod)}
          </div>
          <div class="rs-tx-asset-list">
            ${inputsHtml}
          </div>
          ${
            outputs.length > 0
              ? ''
              : `<p class="rs-tx-hint">click an input to create an output.</p>`
          }
        </section>

        ${outputsBlock}
      </div>
    </div>`;
}

module.exports = {
  unlockInputRows,
  unlockOutputRows,
  unlockTransactionPanelMarkup
};
