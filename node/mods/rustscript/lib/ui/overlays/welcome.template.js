const optionIcon = (type) => {
  const icons = {
    create: `<svg class="rs-onboard-option-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
    import: `<svg class="rs-onboard-option-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
    unlock: `<svg class="rs-onboard-option-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,
    expert: `<svg class="rs-onboard-option-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
    multisig: `<svg class="rs-onboard-option-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    lock: `<svg class="rs-onboard-option-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    custom: `<svg class="rs-onboard-option-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`
  };
  return icons[type] || '';
};

const WelcomeSplashTemplate = () => {
  return `
    <div class="rs-onboard-appspace" data-step="splash">
      <div class="rs-onboard-panel">
        <header class="rs-onboard-hero">
          <div class="rs-onboard-mark" aria-hidden="true">◈</div>
          <h1 class="rs-onboard-title">Saito Advanced Scripting</h1>
          <p class="rs-onboard-lead">
            Build advanced scripts for multisig wallets, programmable payments, and more....
          </p>
        </header>

        <div class="rs-onboard-options">
          <button type="button" class="rs-onboard-option rs-onboard-option-primary" data-path="create">
            <span class="rs-onboard-option-icon">${optionIcon('create')}</span>
            <span class="rs-onboard-option-body">
              <span class="rs-onboard-option-kicker">Start here</span>
              <span class="rs-onboard-option-title">Create New Script</span>
              <span class="rs-onboard-option-desc">Launch the guided wizard to build a script from scratch or modify a template.</span>
            </span>
            <span class="rs-onboard-option-chevron" aria-hidden="true">›</span>
          </button>

          <button type="button" class="rs-onboard-option" data-path="interact">
            <span class="rs-onboard-option-icon">${optionIcon('import')}</span>
            <span class="rs-onboard-option-body">
              <span class="rs-onboard-option-title">Import Existing Script or Transaction</span>
              <span class="rs-onboard-option-desc">import an existing script or unlock and spend an on-chain transaction</span>
            </span>
            <span class="rs-onboard-option-chevron" aria-hidden="true">›</span>
          </button>

          <button type="button" class="rs-onboard-option" data-path="expert">
            <span class="rs-onboard-option-icon">${optionIcon('expert')}</span>
            <span class="rs-onboard-option-body">
              <span class="rs-onboard-option-title">Expert Mode</span>
              <span class="rs-onboard-option-desc">Direct access to the full scripting workstation.</span>
            </span>
            <span class="rs-onboard-option-chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </div>
    </div>
  `;
};

const WelcomeBuildChoiceTemplate = () => {
  return `
    <div class="rs-onboard-appspace" data-step="create-build">
      <div class="rs-onboard-panel">
        <header class="rs-onboard-page-header">
          <button type="button" class="saito-button-square rs-onboard-back" data-action="back-splash" aria-label="Back">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          </button>
          <h2 class="rs-onboard-prompt">What would you like to build?</h2>
        </header>

        <div class="rs-onboard-options">
          <button type="button" class="rs-onboard-option" data-build="multisig">
            <span class="rs-onboard-option-icon">${optionIcon('multisig')}</span>
            <span class="rs-onboard-option-body">
              <span class="rs-onboard-option-title">Multisig Wallet</span>
              <span class="rs-onboard-option-desc">Require approval from multiple public keys before funds can be spent.</span>
            </span>
            <span class="rs-onboard-option-chevron" aria-hidden="true">›</span>
          </button>

          <button type="button" class="rs-onboard-option" data-build="password-protected">
            <span class="rs-onboard-option-icon">${optionIcon('lock')}</span>
            <span class="rs-onboard-option-body">
              <span class="rs-onboard-option-title">Password Protected</span>
              <span class="rs-onboard-option-desc">Prove knowledge of a secret before funds can be spent.</span>
            </span>
            <span class="rs-onboard-option-chevron" aria-hidden="true">›</span>
          </button>

          <button type="button" class="rs-onboard-option" data-build="custom">
            <span class="rs-onboard-option-icon">${optionIcon('custom')}</span>
            <span class="rs-onboard-option-body">
              <span class="rs-onboard-option-title">Custom Script</span>
              <span class="rs-onboard-option-desc">Design something new from scratch using RustScript.</span>
            </span>
            <span class="rs-onboard-option-chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </div>
    </div>
  `;
};

const WelcomeImportChoiceTemplate = () => {
  return `
    <div class="rs-onboard-appspace" data-step="import-choice">
      <div class="rs-onboard-panel">
        <header class="rs-onboard-page-header">
          <button type="button" class="saito-button-square rs-onboard-back" data-action="back-splash" aria-label="Back">
            <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
          </button>
          <div class="rs-onboard-page-heading">
            <h2 class="rs-onboard-prompt">Import Existing</h2>
            <p class="rs-onboard-page-intro">Choose what you want to import.</p>
          </div>
        </header>

        <div class="rs-onboard-options">
          <button type="button" class="rs-onboard-option" data-import="unlock-tx">
            <span class="rs-onboard-option-icon">${optionIcon('unlock')}</span>
            <span class="rs-onboard-option-body">
              <span class="rs-onboard-option-title">Unlock Transaction</span>
              <span class="rs-onboard-option-desc">Import a transaction or P2SH link to unlock and spend assets that already exist on the network.</span>
            </span>
            <span class="rs-onboard-option-chevron" aria-hidden="true">›</span>
          </button>

          <button type="button" class="rs-onboard-option" data-import="continue-unlock">
            <span class="rs-onboard-option-icon">${optionIcon('import')}</span>
            <span class="rs-onboard-option-body">
              <span class="rs-onboard-option-title">Continue Unlock Transaction</span>
              <span class="rs-onboard-option-desc">Import an unlock transaction that already has outputs assigned so you can review it, add witnesses or signatures, and publish it.</span>
            </span>
            <span class="rs-onboard-option-chevron" aria-hidden="true">›</span>
          </button>

          <button type="button" class="rs-onboard-option" data-import="saved-script">
            <span class="rs-onboard-option-icon">${optionIcon('create')}</span>
            <span class="rs-onboard-option-body">
              <span class="rs-onboard-option-title">Import Saved Script</span>
              <span class="rs-onboard-option-desc">Import a JSON script you created earlier and use it to protect new SAITO or NFT assets.</span>
            </span>
            <span class="rs-onboard-option-chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </div>
    </div>
  `;
};

module.exports = {
  WelcomeSplashTemplate,
  WelcomeBuildChoiceTemplate,
  WelcomeImportChoiceTemplate
};
