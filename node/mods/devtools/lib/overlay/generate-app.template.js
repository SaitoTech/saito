module.exports = InstallAppOverlayTemplate = (app, mod, this_self) => {
  console.log('template mod details:', this_self.mod_details);

  return `
  <div class="saito-module-overlay saito-overlay-form">
    <header class="saito-overlay-form-header">
      <h2 class="saito-overlay-form-header-title">${this_self.mod_details.name}</h2>
    </header>

    <section class="details">
      <div class="field">
        <span class="label">Version</span>
        <span class="value">${this_self.mod_details.version}</span>
      </div>
      <div class="field">
        <span class="label">Publisher</span>
        <span class="value" id="publisher">${this_self.mod_details.publisher}</span>
      </div>
      <div class="field">
        <span class="label">Categories</span>
        <span class="value">${this_self.mod_details.categories}</span>
      </div>
      <div class="field">
        <span class="label">Description</span>
        <span class="value">${this_self.mod_details.description}</span>
      </div>
    </section>

    <button type="submit" class="withdraw-submit saito-button-primary fat saito-overlay-form-submit" id="saito-app-generate-btn">Generate App</button>
  </div>
  `;
};
