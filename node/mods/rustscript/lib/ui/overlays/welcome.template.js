const WelcomeSplashTemplate = () => {
  return `
    <div class="rs-onboard-appspace" data-step="splash">
      <div class="rs-onboard-panel">
        <div class="rs-onboard-hero">
          <div class="rs-onboard-mark">◈</div>
          <h1 class="rs-onboard-title">RustScript</h1>
          <p class="rs-onboard-lead">
            Create programmable ownership rules, challenges, vaults, and shared contracts.
          </p>
        </div>

        <div class="rs-onboard-paths">
          <button type="button" class="rs-onboard-path rs-onboard-path-primary" data-path="create">
            <span class="rs-onboard-path-kicker">Start here</span>
            <span class="rs-onboard-path-title">Create a Contract</span>
            <span class="rs-onboard-path-desc">Build programmable rules from templates or from scratch.</span>
          </button>

          <button type="button" class="rs-onboard-path" data-path="interact">
            <span class="rs-onboard-path-title">Interact with a Contract</span>
            <span class="rs-onboard-path-desc">Load an existing rule and provide proof data to run it.</span>
          </button>

          <button type="button" class="rs-onboard-path rs-onboard-path-muted" data-path="expert">
            <span class="rs-onboard-path-title">Expert Mode</span>
            <span class="rs-onboard-path-desc">Direct access to the full scripting workstation.</span>
          </button>
        </div>
      </div>
    </div>
  `;
};

const WelcomeCreateChoiceTemplate = () => {
  return `
    <div class="rs-onboard-appspace" data-step="create-choice">
      <div class="rs-onboard-panel rs-onboard-panel-narrow">
        <button type="button" class="rs-onboard-back" data-action="back-splash">← back</button>
        <h2 class="rs-onboard-step-title">Create a Contract</h2>
        <p class="rs-onboard-step-lead">First define the rule. Proof data comes later.</p>

        <div class="rs-onboard-choices">
          <button type="button" class="rs-onboard-choice" data-choice="template">
            <span class="rs-onboard-choice-title">Start from template</span>
            <span class="rs-onboard-choice-desc">Pick a mechanism — wallet, vault, timer, challenge…</span>
          </button>
          <button type="button" class="rs-onboard-choice" data-choice="scratch">
            <span class="rs-onboard-choice-title">Build from scratch</span>
            <span class="rs-onboard-choice-desc">Begin with a minimal ownership rule.</span>
          </button>
        </div>
      </div>
    </div>
  `;
};

const WelcomeTemplatePickerTemplate = (templates) => {
  const cards = templates
    .map(
      (t) => `
      <button type="button" class="rs-onboard-template" data-template-id="${t.id}">
        <span class="rs-onboard-template-name">${t.name}</span>
        <span class="rs-onboard-template-desc">${t.description}</span>
      </button>
    `
    )
    .join('');

  return `
    <div class="rs-onboard-appspace" data-step="create-templates">
      <div class="rs-onboard-panel">
        <button type="button" class="rs-onboard-back" data-action="back-create-choice">← back</button>
        <h2 class="rs-onboard-step-title">Choose a mechanism</h2>
        <p class="rs-onboard-step-lead">Templates are starting rules — not finished code.</p>
        <div class="rs-onboard-template-grid">${cards}</div>
      </div>
    </div>
  `;
};

const WelcomeInteractTemplate = () => {
  return `
    <div class="rs-onboard-appspace" data-step="interact">
      <div class="rs-onboard-panel rs-onboard-panel-narrow">
        <button type="button" class="rs-onboard-back" data-action="back-splash">← back</button>
        <h2 class="rs-onboard-step-title">Interact with a Contract</h2>
        <p class="rs-onboard-step-lead">Load a live rule and satisfy its proof requirements.</p>

        <div class="rs-onboard-import-zone" data-dropzone="1">
          <p class="rs-onboard-import-hint">Drop a transaction file or paste contract JSON below.</p>
          <textarea class="rs-onboard-import-input" spellcheck="false" placeholder='{ "op": "CHECKSIG", ... }'></textarea>
        </div>

        <button type="button" class="rs-onboard-primary-btn" data-action="import-contract">Load contract</button>
      </div>
    </div>
  `;
};

module.exports = {
  WelcomeSplashTemplate,
  WelcomeCreateChoiceTemplate,
  WelcomeTemplatePickerTemplate,
  WelcomeInteractTemplate
};
