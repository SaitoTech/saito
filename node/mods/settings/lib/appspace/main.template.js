module.exports = (app, mod, main) => {
  let publicKey = mod.publicKey;
  let key = app.keychain.returnKey({ publicKey: publicKey });
  let identifier = key?.identifier || app.keychain.returnIdentifierByPublicKey(publicKey) || '';
  let username_cell;

  if (identifier) {
    username_cell = `<div class="username" id="settings-username">${identifier}</div>`;
  } else if (key?.has_registered_username) {
    username_cell = `<div class="username" id="settings-username">registering…</div>`;
  } else {
    username_cell = `<button type="button" id="register-identifier-btn" class="saito-button-secondary small">register username <i class="fas fa-pen" aria-hidden="true"></i></button>`;
  }

  let modules_html = '';

  try {
    for (let i = 0; i < app.options.modules.length; i++) {
      let mod = app.modules.returnModule(app.options.modules[i].name);

      let shortName = app.options.modules[i].name;
      let fullName = mod ? mod.returnName() : shortName;

      let CHECKED = app.options.modules[i].active ? 'CHECKED' : '';

      modules_html += `
        <div class="settings-appspace-app" data-id="${shortName}">
            <div class="saito-switch">
              <input type="checkbox" id="${i}" class="saito-checkbox modules_mods_checkbox" name="modules_mods_${i}" ${CHECKED}>
            </div>
            <div>${fullName}</div>`;

      if (mod?.hasSettings()) {
        modules_html += `<i class="fas fa-cog" aria-hidden="true"></i>`;
      }

      modules_html += '</div>';
    }
  } catch (err) {
    console.error(err);
  }

  let html = `

  <div class="settings-appspace saito-overlay-size wide">

    <div id="settings-appspace-warning-bar" class="settings-appspace-warning-bar" style="display: none;" role="alert" aria-live="polite"></div>

    <div class="settings-appspace-header">
      <div class="settings-actions-container">
        <div class="saito-button-secondary" id="restore-privatekey-btn" title="Restore account from private key or seed phrase">Import Key</div>
        <div class="saito-button-secondary" id="show-phrase" title="View wallet seed phrase">Seed Phrase</div>
        <div class="saito-button-secondary" id="restore-account-btn" title="Restore account by uploading json-file of wallet">Restore Wallet</div>
        <div class="saito-button-secondary" id="backup-account-btn" title="Download json-file copy of wallet">Backup Wallet</div>
        <div class="saito-button-secondary" id="clear-storage-btn" title="Removes local data storage, but keeps wallet intact">Clear Cache</div>
        <div class="saito-button-secondary" id="nuke-account-btn" title="Wipe local storage and reload site with new key pair">Nuke Account</div>
      </div>
    </div>

    <div class="settings-appspace-body">
      <details class="settings-appspace-section" open>
        <summary class="settings-appspace-section-summary">
          <i class="fas fa-caret-right settings-section-caret" aria-hidden="true"></i>
          <h6>wallet</h6>
        </summary>
        <div class="settings-appspace-user-details">
          <div class="settings-field-label">username</div>
          ${username_cell}

          <div class="settings-field-label">public key</div>
          <div class="pubkey-grid" data-id="${publicKey}" title="Copy public key">
            <div>${publicKey}</div>
            <i class="fas fa-copy" aria-hidden="true"></i>
          </div>

          <div class="settings-field-label">private key</div>
          <div class="pubkey-grid" data-id="${main.privateKey || ''}" title="Copy private key">
            <div>************</div>
            <i class="fas fa-copy" aria-hidden="true"></i>
          </div>

          <div class="settings-field-label">default fee</div>
          <div class="settings-fee-control">
            <input type="number"
                   id="profile-default-fee-input"
                   class="saito-input"
                   step="0.000000001"
                   min="0"
                   value="${app.wallet.convertNolanToSaito(app.wallet.default_fee)}"
            />
          </div>
        </div>
      </details>

      <details class="settings-appspace-section settings-appspace-modules-container">
        <summary class="settings-appspace-section-summary settings-installed-mod-header">
          <i class="fas fa-caret-right settings-section-caret" aria-hidden="true"></i>
          <h6>installed modules</h6>
          <button type="button" id="settings-add-app" class="saito-button-square" aria-label="Add application">
            <i class="fa-solid fa-plus" aria-hidden="true"></i>
          </button>
        </summary>
        <div class="settings-appspace-modules saito-menu-select-subtle">
          ${modules_html}
        </div>
      </details>

      <details class="settings-appspace-section settings-appspace-crypto-transfer-container">
        <summary class="settings-appspace-section-summary">
          <i class="fas fa-caret-right settings-section-caret" aria-hidden="true"></i>
          <h6>in-game crypto transfers</h6>
        </summary>
        <div id="settings-appspace-crypto-transfer" class="settings-appspace-modules saito-menu-select-subtle">
        </div>
      </details>

      <details class="settings-appspace-section settings-appspace-debug">
        <summary class="settings-appspace-section-summary">
          <i class="fas fa-caret-right settings-section-caret" aria-hidden="true"></i>
          <h6>debug info</h6>
        </summary>
        <div class="settings-section-note">Advanced: ALT-select items to mark them (OPT-select in MacOS), then <span class="saito-text-link" id="delete_marked">click here to delete selected entries</span></div>
        <div class="settings-appspace-debug-content" id="settings-appspace-debug-content"></div>
      </details>

      <details class="settings-appspace-section settings-storage-info">
        <summary class="settings-appspace-section-summary">
          <i class="fas fa-caret-right settings-section-caret" aria-hidden="true"></i>
          <h6>storage info</h6>
        </summary>
        <div class="settings-appspace-storage-content">

          <div class="settings-appspace-localstorage-info">
            <div class="title">local storage</div>
            <div>quota (bytes)</div><div class="quota"></div>
            <div>usage (bytes)</div><div class="usage"></div>
            <div>used (%)</div><div class="percent"></div>
          </div>

          <div class="settings-appspace-indexdb-info">
            <div class="title">indexedDB</div>
            <div>quota (bytes)</div><div class="quota"></div>
            <div>usage (bytes)</div><div class="usage"></div>
            <div>used (%)</div><div class="percent"></div>
          </div>

        </div>
      </details>

      <details class="settings-appspace-section settings-appspace-build-info">
        <summary class="settings-appspace-section-summary">
          <i class="fas fa-caret-right settings-section-caret" aria-hidden="true"></i>
          <h6>build information</h6>
        </summary>
        <div class="settings-appspace-build-info-grid">
          <div class="settings-field-label">browser build</div>
          <div id="settings-browser-build-value" class="settings-appspace-build-value">${String(app.build_number)}</div>
          <div class="settings-field-label">node peer build</div>
          <div id="settings-node-peer-build-value" class="settings-appspace-build-value">—</div>
        </div>
      </details>
    </div>
  </div>

  `;

  return html;
};
