module.exports = (app, mod) => {
  const curated = mod.curated !== false;
  const modtools = app.options.modtools || {};
  const whitelistCount = Array.isArray(modtools.whitelist) ? modtools.whitelist.length : 0;
  const blacklistCount = Array.isArray(modtools.blacklist) ? modtools.blacklist.length : 0;

  let whitelistSection = '';
  let blacklistSection = '';

  if (Array.isArray(modtools.whitelist)) {
    whitelistSection = `
      <div class="settings-row settings-row-action" id="whitelisted-accounts" role="button" tabindex="0">
        <span class="settings-row-icon" aria-hidden="true">
          <i class="fa-regular fa-face-smile-beam"></i>
        </span>
        <span class="settings-row-label">Whitelisted accounts (${whitelistCount})</span>
        <span class="settings-row-chevron" aria-hidden="true">
          <i class="fa-solid fa-chevron-right"></i>
        </span>
      </div>
      <div class="settings-row settings-row-inline disabled-option">
        <button class="saito-button-primary small" id="add-whitelist" type="button">Add to whitelist</button>
      </div>
    `;
  }

  if (Array.isArray(modtools.blacklist)) {
    blacklistSection = `
      <div class="settings-row settings-row-action" id="blacklisted-accounts" role="button" tabindex="0">
        <span class="settings-row-icon" aria-hidden="true">
          <i class="fa-solid fa-ban"></i>
        </span>
        <span class="settings-row-label">Manage blocked accounts (${blacklistCount})</span>
        <span class="settings-row-chevron" aria-hidden="true">
          <i class="fa-solid fa-chevron-right"></i>
        </span>
      </div>
    `;
  }

  return `
    <section class="settings-overlay" id="redsquare-settings-overlay" aria-label="RedSquare settings">
      <header class="settings-overlay-header">
        <h2 class="settings-overlay-title">Settings</h2>
      </header>

      <div class="settings-overlay-body">
        <section class="settings-section">
          <h3 class="settings-section-title">Feed moderation</h3>
          <p class="settings-section-description">
            Blacklist users to remove their tweets. Whitelist users to ensure their tweets show up.
            Unless you have whitelisted an account, your browser will also respect the filtering
            preferences of your friends on the network.
          </p>

          <div class="settings-field">
            <span class="settings-field-label">RedSquare feed</span>
            <div id="curation-toggle" class="settings-toggle${curated ? '' : ' active-right'}">
              <div
                class="settings-toggle-option${curated ? ' active' : ''}"
                role="button"
                tabindex="0"
                data-view="curated"
              >
                Curated
              </div>
              <div
                class="settings-toggle-option${curated ? '' : ' active'}"
                role="button"
                tabindex="0"
                data-view="unfiltered"
              >
                Unfiltered
              </div>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h3 class="settings-section-title">Account lists</h3>
          <div class="settings-list saito-menu-select-subtle">
            ${whitelistSection}
            ${blacklistSection}
          </div>
        </section>
      </div>
    </section>
  `;
};
