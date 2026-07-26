function parseListingUnitPrice(price = '') {
  const match = String(price).match(/[\d.]+/);
  return match ? match[0] : null;
}

/**
 * Purchase transaction orchestration — not a UI component.
 * Starts local lifecycle tracking and opens Transaction Monitor for live confirmation.
 */
async function startPurchase(app, mod, purchaseOverlay, summary, quantity = 1) {
  if (!summary?.nft_id) {
    salert('This item is not available for purchase.');
    return;
  }

  if (!mod.store_public_key) {
    salert('Store is not connected. Please wait for the Store service to come online.');
    return;
  }

  const unit_price = parseListingUnitPrice(summary.returnPrice?.() || summary.price);
  if (!unit_price || Number(unit_price) <= 0) {
    salert('This item does not have a valid price.');
    return;
  }

  quantity = Math.max(1, Math.min(Number(quantity) || 1, summary.returnQuantity?.() || 1));
  const fee = String(mod.fee || 0);
  const unit_nolan = BigInt(app.wallet.convertSaitoToNolan(unit_price) ?? 0);
  const fee_nolan = BigInt(app.wallet.convertSaitoToNolan(fee) ?? 0);
  const total_nolan = unit_nolan * BigInt(quantity) + fee_nolan;

  if (total_nolan <= 0n) {
    salert('Unable to calculate purchase total.');
    return;
  }

  const wallet_balance = await app.wallet.getBalance();
  const listingTitle = summary.returnTitle?.() || summary.title || 'this item';

  let newtx = null;
  try {
    newtx = await mod.createPurchaseAssetTransaction(
      summary,
      { price: unit_price, fee, quantity },
      total_nolan
    );
  } catch (err) {
    console.error('Store: createPurchaseAssetTransaction failed', err);
    salert(err?.message || 'Could not create purchase transaction.');
    return;
  }

  const pendingTxSignature = newtx.signature || '';
  if (!pendingTxSignature) {
    salert('Purchase transaction was not signed.');
    return;
  }

  // Close Buy NFT overlay immediately on successful submit.
  mod.main?.listing_detail?.overlay?.hide?.();
  mod.main?.product_overlay?.overlay?.hide?.();

  if (wallet_balance < total_nolan) {
    app.connection.emit(
      'saito-purchase-launch',
      app.wallet.convertNolanToSaito(total_nolan),
      mod.store_public_key,
      newtx.serialize_to_web(app),
      `Purchase ${summary.returnTitle?.() || 'Store item'}`
    );
    beginLocalPurchaseLifecycle(
      mod,
      purchaseOverlay,
      summary,
      pendingTxSignature,
      quantity,
      listingTitle,
      newtx
    );
    return;
  }

  try {
    await app.network.propagateTransaction(newtx);
  } catch (err) {
    salert(err?.message || 'Could not submit purchase transaction.');
    return;
  }

  beginLocalPurchaseLifecycle(
    mod,
    purchaseOverlay,
    summary,
    pendingTxSignature,
    quantity,
    listingTitle,
    newtx
  );
}

function beginLocalPurchaseLifecycle(
  mod,
  purchaseOverlay,
  summary,
  pendingTxSignature,
  quantity,
  listingTitle,
  tx = null
) {
  const lifecycle = mod.purchase_lifecycle;
  if (lifecycle) {
    lifecycle.begin({
      summary,
      purchaseTxSignature: pendingTxSignature,
      quantity
    });
  } else {
    // Fallback: still hide immediately if lifecycle is unavailable.
    mod.app.connection.emit('store-render-listings');
  }

  if (tx) {
    purchaseOverlay.watchPurchase(tx, listingTitle, {
      nft_id: summary.nft_id,
      quantity
    });
  }
}

module.exports = {
  startPurchase,
  parseListingUnitPrice
};
