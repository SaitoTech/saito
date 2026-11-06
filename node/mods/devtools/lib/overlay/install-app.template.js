module.exports = InstallAppOverlayTemplate = (app, mod, this_self) => {
  const name = this_self.name || 'Untitled Module';
  const description = this_self.description || '';
  const version = String(this_self.version ?? '').match(/\d+(?:\.\d+)*/)?.[0] || '—';
  const image = this_self.image || '';

  const publisherKey = this_self.tx?.from?.[0]?.publicKey;
  const publisherHtml = publisherKey
    ? `<span class="value publisher">${publisherKey}</span>`
    : `<em class="value unknown">unknown</em>`;

  const mediaHtml = image
    ? `<img class="preview" src="${image}" alt="" />`
    : `<div class="preview saito-app-placeholder" role="img" aria-label="Saito Application">
        <img class="saito-app-placeholder-logo" src="/saito/img/saito-cube.svg" alt="" />
        <span class="saito-app-placeholder-name">Saito</span>
        <span class="saito-app-placeholder-type">Application</span>
      </div>`;

  const descriptionHtml = description
    ? `<p class="description">${description}</p>`
    : '';

  return `
  <div class="saito-overlay-form saito-app-install-overlay">
    <div class="saito-overlay-form-header">
      <h2 class="saito-overlay-form-header-title">${name}</h2>
    </div>

    <div class="body">
      <div class="content">
        ${mediaHtml}
        ${descriptionHtml}
      </div>

      <div class="footer">
        <div class="meta">
          <div class="field">
            <span class="label">Version</span>
            <span class="value">${version}</span>
          </div>
          <div class="field">
            <span class="label publisher-label">Publisher <button type="button" class="publisher-help" id="saito-app-publisher-help" aria-label="About publisher trust and wallet safety"><i class="fa-regular fa-circle-question" aria-hidden="true"></i></button></span>
            ${publisherHtml}
          </div>
        </div>
        <div class="saito-button-row">
          <button type="button" class="saito-button-primary" id="saito-app-install-btn">Install</button>
        </div>
      </div>
    </div>
  </div>
  `;
};
