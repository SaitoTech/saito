module.exports = (app, mod, main) => {
  let publicKey = mod.publicKey;
  let privateKey = main.privateKey || '';
  let username = app.keychain.returnUsername(publicKey);
  let privateKeyMasked = privateKey ? '*'.repeat(privateKey.length) : '';
  let buildNumber = String(app.build_number);

  let modules_html = '';

  try {
    for (let i = 0; i < app.options.modules.length; i++) {
      let installed = app.modules.returnModule(app.options.modules[i].name);

      let shortName = app.options.modules[i].name;
      let fullName = installed ? installed.returnName() : shortName;

      let CHECKED = app.options.modules[i].active ? 'CHECKED' : '';

      modules_html += `
        <div class="settings-appspace-app" data-id="${shortName}">
            <div class="saito-switch">
              <input type="checkbox" id="${i}" class="saito-checkbox modules_mods_checkbox" name="modules_mods_${i}" ${CHECKED}>
            </div>
            <div>${fullName}</div>`;

      if (installed?.hasSettings()) {
        modules_html += `<i class="fas fa-cog" aria-hidden="true"></i>`;
      }

      modules_html += '</div>';
    }
  } catch (err) {
    console.error(err);
  }

  let html = `

  <div class="settings-appspace saito-overlay-size wide">

    <header class="saito-overlay-form-header">
      <h2 class="saito-overlay-form-header-title">Wallet Settings</h2>
    </header>

    <div class="settings-appspace-body">
      <div id="settings-appspace-warning-bar" class="settings-appspace-warning-bar" style="display: none;" role="alert" aria-live="polite"></div>

      <details class="settings-appspace-section" open>
        <summary class="settings-appspace-section-summary">
          <i class="fas fa-wallet settings-section-icon" aria-hidden="true"></i>
          <h6>Wallet</h6>
          <i class="fas fa-caret-right settings-section-caret" aria-hidden="true"></i>
        </summary>
        <div class="settings-appspace-user-details">
          <div class="settings-field-label">Username</div>
          <div class="settings-field-control">
            <div class="username" id="settings-username">${username}</div>
            <button type="button" id="register-identifier-btn" class="saito-icon-button" title="Edit or register username" aria-label="Edit or register username">
              <i class="fas fa-pen" aria-hidden="true"></i>
            </button>
          </div>

          <div class="settings-field-label">Public Key</div>
          <div class="settings-field-control pubkey-grid" data-id="${publicKey}" title="Copy public key">
            <div class="settings-field-value">${publicKey}</div>
            <button type="button" class="saito-icon-button" aria-label="Copy public key">
              <i class="fas fa-copy" aria-hidden="true"></i>
            </button>
          </div>

          <div class="settings-field-label">Private Key</div>
          <div class="settings-field-control pubkey-grid" data-id="${privateKey}" title="Copy private key">
            <div class="settings-field-value">${privateKeyMasked}</div>
            <button type="button" class="saito-icon-button" aria-label="Copy private key">
              <i class="fas fa-copy" aria-hidden="true"></i>
            </button>
          </div>

          <div class="settings-field-label">Seed Phrase</div>
          <div class="settings-field-control">
            <div
              class="settings-field-value settings-seed-phrase"
              id="settings-seed-phrase"
              role="button"
              tabindex="0"
              title="Reveal wallet seed phrase"
            >click here to view seed phrase</div>
            <div class="settings-seed-phrase-actions" id="settings-seed-phrase-actions" hidden>
              <button type="button" class="saito-icon-button" id="settings-copy-seed-phrase" title="Copy seed phrase" aria-label="Copy seed phrase">
                <i class="fas fa-copy" aria-hidden="true"></i>
              </button>
              <button type="button" class="saito-icon-button" id="settings-close-seed-phrase" title="Hide seed phrase" aria-label="Hide seed phrase">
                <i class="fas fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
          </div>

          <div class="settings-field-label">Default Fee</div>
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

        <div class="settings-wallet-actions" role="group" aria-label="Wallet actions">
          <div class="settings-actions-container">
            <button type="button" class="saito-button-secondary" id="backup-account-btn" title="Download json-file copy of wallet">
              <i class="fa-solid fa-download" aria-hidden="true"></i>
              <span>Backup Wallet</span>
            </button>
            <button type="button" class="saito-button-secondary" id="restore-account-btn" title="Restore account by uploading json-file of wallet">
              <i class="fa-solid fa-file-arrow-up" aria-hidden="true"></i>
              <span>Restore Wallet</span>
            </button>
            <button type="button" class="saito-button-secondary" id="restore-privatekey-btn" title="Wipe local data and restore account from private key or seed phrase">
              <i class="fa-solid fa-key" aria-hidden="true"></i>
              <span>Import Key</span>
            </button>
            <button type="button" class="saito-button-secondary" id="nuke-account-btn" title="Erase all local Saito data and reset this browser to a fresh installation">
              <i class="fa-solid fa-trash" aria-hidden="true"></i>
              <span>Nuke</span>
            </button>
          </div>
        </div>
      </details>

      <details class="settings-appspace-section settings-appspace-modules-container">
        <summary class="settings-appspace-section-summary">
          <i class="fas fa-cubes settings-section-icon" aria-hidden="true"></i>
          <h6>Applications</h6>
          <i class="fas fa-caret-right settings-section-caret" aria-hidden="true"></i>
        </summary>
        <div class="settings-appspace-modules saito-menu-select-subtle">
          ${modules_html}
        </div>
      </details>

      <details class="settings-appspace-section settings-appspace-advanced">
        <summary class="settings-appspace-section-summary">
          <i class="fas fa-gear settings-section-icon" aria-hidden="true"></i>
          <h6>Advanced</h6>
          <i class="fas fa-caret-right settings-section-caret" aria-hidden="true"></i>
        </summary>
        <div class="settings-appspace-advanced-content">
          <div class="settings-appspace-crypto-transfer-container">
            <div id="settings-appspace-crypto-transfer" class="settings-appspace-modules saito-menu-select-subtle">
            </div>
          </div>

          <div class="settings-section-note">ALT-select items to mark them (OPT-select in MacOS), then <span class="saito-text-link" id="delete_marked">click here to delete selected entries</span></div>
          <div class="settings-appspace-debug-content" id="settings-appspace-debug-content"></div>
        </div>
      </details>
    </div>

    <footer class="settings-appspace-footer">
      <div class="settings-footer-summary">
        <div class="settings-footer-item">
          <span class="settings-footer-label">Saito <span id="settings-footer-version">v${buildNumber}</span></span>
          <button
            type="button"
            class="settings-footer-info"
            id="settings-footer-version-info"
            title="Browser build ${buildNumber}"
            aria-label="Show version details"
            aria-expanded="false"
            aria-controls="settings-footer-version-detail"
          >
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          </button>
        </div>
        <div class="settings-footer-item">
          <span class="settings-footer-label">Storage: <span id="settings-footer-storage">—</span></span>
          <button
            type="button"
            class="settings-footer-info"
            id="settings-footer-storage-info"
            title="Storage details"
            aria-label="Show storage details"
            aria-expanded="false"
            aria-controls="settings-footer-storage-detail"
          >
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      <div
        id="settings-footer-version-detail"
        class="settings-footer-detail"
        hidden
      >
        <div class="settings-appspace-build-info-grid">
          <div class="settings-field-label">browser build</div>
          <div id="settings-browser-build-value" class="settings-appspace-build-value">${buildNumber}</div>
          <div class="settings-field-label">node peer build</div>
          <div id="settings-node-peer-build-value" class="settings-appspace-build-value">—</div>
        </div>
      </div>

      <div
        id="settings-footer-storage-detail"
        class="settings-footer-detail"
        hidden
      >
        <div class="settings-appspace-storage-content">
          <div class="settings-appspace-localstorage-info">
            <div class="title">Local Storage</div>
            <div>quota (bytes)</div><div class="quota"></div>
            <div>usage (bytes)</div><div class="usage"></div>
            <div>used (%)</div><div class="percent"></div>
          </div>

          <div class="settings-appspace-indexdb-info">
            <div class="title">IndexedDB</div>
            <div>quota (bytes)</div><div class="quota"></div>
            <div>usage (bytes)</div><div class="usage"></div>
            <div>used (%)</div><div class="percent"></div>
          </div>
        </div>
      </div>
    </footer>
  </div>

  `;

  return html;
};
