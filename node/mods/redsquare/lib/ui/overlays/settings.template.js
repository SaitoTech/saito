module.exports = (app, mod) => {
  const curated = mod.curated !== false;
  const modtools = app.options.modtools || {};
  const whitelistCount = Array.isArray(modtools.whitelist) ? modtools.whitelist.length : 0;
  const blacklistCount = Array.isArray(modtools.blacklist) ? modtools.blacklist.length : 0;

  let whitelistSection = '';
  let blacklistSection = '';

  if (Array.isArray(modtools.whitelist)) {
    whitelistSection = `
      <div class="row action" id="whitelisted-accounts" role="button" tabindex="0">
        <span class="icon" aria-hidden="true">
          <i class="fa-regular fa-face-smile-beam"></i>
        </span>
        <span class="label">Whitelisted accounts (${whitelistCount})</span>
        <span class="chevron" aria-hidden="true">
          <i class="fa-solid fa-chevron-right"></i>
        </span>
      </div>
      <div class="row inline">
        <button class="saito-button-secondary small" id="add-whitelist" type="button">Add to whitelist</button>
      </div>
    `;
  }

  if (Array.isArray(modtools.blacklist)) {
    blacklistSection = `
      <div class="row action" id="blacklisted-accounts" role="button" tabindex="0">
        <span class="icon" aria-hidden="true">
          <i class="fa-solid fa-ban"></i>
        </span>
        <span class="label">Manage blocked accounts (${blacklistCount})</span>
        <span class="chevron" aria-hidden="true">
          <i class="fa-solid fa-chevron-right"></i>
        </span>
      </div>
    `;
  }

  return `
    <section class="settings" id="redsquare-settings-overlay" aria-label="RedSquare settings">
      <header class="header">
        <h2 class="title">Settings</h2>
      </header>

      <div class="body">
        <section class="section">
          <h3 class="title">Feed moderation</h3>
          <p class="description">
            Blacklist users to remove their tweets. Whitelist users to ensure their tweets show up.
            Unless you have whitelisted an account, your browser will also respect the filtering
            preferences of your friends on the network.
          </p>

          <div
            id="curation-toggle"
            class="preference-group"
            role="radiogroup"
            aria-label="RedSquare feed preference"
          >
            <label class="preference">
              <input
                type="radio"
                name="redsquare-feed-curation"
                value="curated"
                ${curated ? 'checked' : ''}
              />
              <span class="indicator" aria-hidden="true"></span>
              <span class="text">I would prefer a curated feed</span>
            </label>
            <label class="preference">
              <input
                type="radio"
                name="redsquare-feed-curation"
                value="unfiltered"
                ${curated ? '' : 'checked'}
              />
              <span class="indicator" aria-hidden="true"></span>
              <span class="text">I would prefer a totally unfiltered feed</span>
            </label>
          </div>
        </section>

        <section class="section">
          <h3 class="title">Account lists</h3>
          <div class="list saito-menu-select-subtle">
            ${whitelistSection}
            ${blacklistSection}
          </div>
        </section>
      </div>
    </section>
  `;
};
