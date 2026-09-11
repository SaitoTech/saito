/**
 * Seller-side Main Store submission.
 * One client path for create-overlay, auto-submit, and My Listings.
 *
 * app.options.store.auto_submit_listings — preference (default false)
 * app.options.store.auto_submit_listings_selected — listing-flow question already asked
 */

function ensureStoreOptions(app) {
  if (!app.options || typeof app.options !== 'object') {
    app.options = {};
  }
  if (!app.options.store || typeof app.options.store !== 'object') {
    app.options.store = {};
  }
  return app.options.store;
}

function isAutoSubmitListings(app) {
  return !!ensureStoreOptions(app).auto_submit_listings;
}

function hasAutoSubmitBeenSelected(app) {
  return !!ensureStoreOptions(app).auto_submit_listings_selected;
}

function setAutoSubmitListings(app, enabled) {
  ensureStoreOptions(app).auto_submit_listings = !!enabled;
  app.storage.saveOptions();
}

function isSubmitToMainStoreChecked(root) {
  const checkbox = root?.querySelector?.('[data-action="submit-main-store"]');
  return !!checkbox?.checked;
}

function attachSubmitToMainStoreCheckbox(root, app) {
  const checkbox = root?.querySelector?.('[data-action="submit-main-store"]');
  if (!checkbox) {
    return;
  }
  checkbox.addEventListener('change', () => {
    if (!checkbox.checked) {
      return;
    }
    void offerAutoSubmitOptInIfNeeded(app);
  });
}

let autoSubmitOptInPromise = null;

/**
 * One-time listing-flow question. Not shown when Settings already enabled
 * auto-submit, when the box is unchecked, or after the user has answered.
 * Cancel still submits the current listing; it only skips changing the default.
 */
async function offerAutoSubmitOptInIfNeeded(app) {
  if (isAutoSubmitListings(app) || hasAutoSubmitBeenSelected(app)) {
    return;
  }
  if (autoSubmitOptInPromise) {
    return autoSubmitOptInPromise;
  }

  autoSubmitOptInPromise = (async () => {
    const confirmed = await confirmAutoSubmitOptIn();
    const store = ensureStoreOptions(app);
    if (confirmed) {
      store.auto_submit_listings = true;
    }
    store.auto_submit_listings_selected = true;
    app.storage.saveOptions();
  })();

  try {
    await autoSubmitOptInPromise;
  } finally {
    autoSubmitOptInPromise = null;
  }
}

function confirmAutoSubmitOptIn() {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(false);
      return;
    }
    if (document.getElementById('store-auto-submit-prompt')) {
      resolve(false);
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'store-auto-submit-prompt';
    wrapper.className = 'saito-alert';
    wrapper.innerHTML = `<div id="saito-alert-shim">
      <div id="saito-alert-box" class="saito-overlay-panel compact">
        <div class="saito-alert-message">
          Submit all future listings automatically to the Main Store?
        </div>
        <div class="saito-button-row">
          <button type="button" class="saito-button-secondary" id="store-auto-submit-cancel">Cancel</button>
          <button type="button" class="saito-button-primary" id="store-auto-submit-confirm">Confirm</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(wrapper);

    // saito-alert.css parks #saito-alert-box at top: -100% until JS slides it in
    // (same as window.salert / window.sconfirm).
    const box = wrapper.querySelector('#saito-alert-box');
    if (box) {
      box.style.top = '1rem';
    }

    const finish = (value) => {
      wrapper.remove();
      resolve(value);
    };

    document.getElementById('store-auto-submit-confirm')?.addEventListener('click', (e) => {
      e.preventDefault();
      finish(true);
    });
    document.getElementById('store-auto-submit-cancel')?.addEventListener('click', (e) => {
      e.preventDefault();
      finish(false);
    });

    const confirmBtn = document.getElementById('store-auto-submit-confirm');
    if (confirmBtn) {
      confirmBtn.focus();
    }
  });
}

function refreshSellerListings(mod) {
  const storefront = mod?.main?.manager?.storefront;
  if (!storefront) {
    return;
  }
  if (storefront.isAdminActive?.()) {
    void storefront.loadAdminPage({ page: storefront.page || 1 });
    return;
  }
  if (typeof storefront.reloadInventory === 'function') {
    void storefront.reloadInventory();
  }
}

function submitListingForApproval(app, mod, signature) {
  const sig = String(signature || '').trim();
  return new Promise((resolve, reject) => {
    if (!sig) {
      reject(new Error('Listing signature required'));
      return;
    }

    const peerKey = mod.store_public_key;
    if (!peerKey || !app?.network?.sendRequestAsTransaction) {
      reject(new Error('Store peer unavailable'));
      return;
    }

    app.network.sendRequestAsTransaction(
      'submit-listing',
      { module: 'Store', signature: sig },
      (response) => {
        if (!response || response.err || response.ok === false) {
          reject(new Error(response?.err || 'Unable to submit listing'));
          return;
        }
        refreshSellerListings(mod);
        resolve(response);
      },
      peerKey
    );
  });
}

async function submitAfterListingRowReady(app, mod, signature) {
  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await submitListingForApproval(app, mod, signature);
    } catch (err) {
      lastErr = err;
      const missing = /not found/i.test(String(err?.message || ''));
      if (!missing || attempt === 4) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  throw lastErr;
}

function scheduleSubmitAfterListingConfirmed(app, mod, signature) {
  const sig = String(signature || '').trim();
  if (!sig || !app?.connection) {
    return;
  }

  const onLifecycle = (entry) => {
    if (String(entry?.listing_signature || '') !== sig) {
      return;
    }
    if (entry.phase !== 'complete') {
      return;
    }
    app.connection.off('store-listing-lifecycle', onLifecycle);
    submitAfterListingRowReady(app, mod, sig).catch((err) => {
      console.warn('Store: submit-listing after create failed', err?.message || err);
      if (typeof siteMessage === 'function') {
        siteMessage(
          'Your listing was created, but it could not be submitted for Store approval. You can submit it from My Listings.',
          5000
        );
      }
    });
  };

  app.connection.on('store-listing-lifecycle', onLifecycle);
}

module.exports = {
  ensureStoreOptions,
  isAutoSubmitListings,
  hasAutoSubmitBeenSelected,
  setAutoSubmitListings,
  isSubmitToMainStoreChecked,
  attachSubmitToMainStoreCheckbox,
  offerAutoSubmitOptInIfNeeded,
  submitListingForApproval,
  scheduleSubmitAfterListingConfirmed
};
