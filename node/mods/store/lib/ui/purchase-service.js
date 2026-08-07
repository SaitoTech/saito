function parseListingUnitPrice(price = '') {
  const match = String(price).match(/[\d.]+/);
  return match ? match[0] : null;
}

/**
 * Yield until after the next paint so preparation UI can render before
 * wallet/WASM work stalls the main thread. Not an artificial delay.
 */
function yieldForPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

/**
 * Purchase transaction orchestration — not a UI component.
 * Shows Purchase Monitor during create/sign/broadcast, then hands off
 * to Transaction Monitor once the signed tx exists.
 */
async function startPurchase(app, mod, purchaseOverlay, summary, quantity = 1) {
  const monitor = mod.purchase_monitor;

  // Immediate UI transition — before any purchase preparation work.
  // Cheap title only; returnTitle()/price hydration happens after paint.
  const listingTitle = String(summary?.title || '').trim() || 'this item';
  mod.main?.listing_detail?.overlay?.hide?.();
  mod.main?.product_overlay?.overlay?.hide?.();
  monitor?.show({ listingTitle });
  monitor?.setStage('preparing');
  await yieldForPaint();

  if (!summary?.nft_id) {
    monitor?.hide();
    salert('This item is not available for purchase.');
    return;
  }

  if (!mod.store_public_key) {
    monitor?.hide();
    salert('Store is not connected. Please wait for the Store service to come online.');
    return;
  }

  const unit_price = parseListingUnitPrice(summary.returnPrice?.() || summary.price);
  if (!unit_price || Number(unit_price) <= 0) {
    monitor?.hide();
    salert('This item does not have a valid price.');
    return;
  }

  quantity = Math.max(1, Math.min(Number(quantity) || 1, summary.returnQuantity?.() || 1));
  const fee = String(mod.fee || 0);
  const unit_nolan = BigInt(app.wallet.convertSaitoToNolan(unit_price) ?? 0);
  const fee_nolan = BigInt(app.wallet.convertSaitoToNolan(fee) ?? 0);
  const total_nolan = unit_nolan * BigInt(quantity) + fee_nolan;

  if (total_nolan <= 0n) {
    monitor?.hide();
    salert('Unable to calculate purchase total.');
    return;
  }

  const resolvedTitle = summary.returnTitle?.() || summary.title || listingTitle;

  let newtx = null;
  try {
    monitor?.setStage('checking_wallet');
    const wallet_balance = await app.wallet.getBalance();

    monitor?.setStage('creating');
    try {
      newtx = await mod.createPurchaseAssetTransaction(
        summary,
        { price: unit_price, fee, quantity },
        total_nolan
      );
    } catch (err) {
      console.error('Store: createPurchaseAssetTransaction failed', err);
      monitor?.hide();
      salert(err?.message || 'Could not create purchase transaction.');
      return;
    }

    const pendingTxSignature = newtx.signature || '';
    if (!pendingTxSignature) {
      monitor?.hide();
      salert('Purchase transaction was not signed.');
      return;
    }

    if (wallet_balance < total_nolan) {
      monitor?.hide();
      app.connection.emit(
        'saito-purchase-launch',
        app.wallet.convertNolanToSaito(total_nolan),
        mod.store_public_key,
        newtx.serialize_to_web(app),
        `Purchase ${resolvedTitle || 'Store item'}`
      );
      beginLocalPurchaseLifecycle(
        mod,
        purchaseOverlay,
        summary,
        pendingTxSignature,
        quantity,
        resolvedTitle,
        newtx
      );
      return;
    }

    monitor?.setStage('sending');
    try {
      await app.network.propagateTransaction(newtx);
    } catch (err) {
      monitor?.hide();
      salert(err?.message || 'Could not submit purchase transaction.');
      return;
    }

    monitor?.hide();
    beginLocalPurchaseLifecycle(
      mod,
      purchaseOverlay,
      summary,
      pendingTxSignature,
      quantity,
      resolvedTitle,
      newtx
    );
  } catch (err) {
    monitor?.hide();
    console.error('Store: startPurchase failed', err);
    salert(err?.message || 'Could not start purchase.');
  }
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
