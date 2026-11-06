let SaitoModuleTemplate = (app, mod) => {
  const esc = (value) => app.browser.escapeHTML(value == null ? '' : String(value));

  let version = mod.version;
  if (typeof version === 'number' && Number.isFinite(version)) {
    version = version.toFixed(2);
  }

  let settings = '';
  if (mod.hasSettings()) {
    settings = `<section class="saito-module-settings"></section>`;
  }

  return `
	<div class="saito-module-overlay saito-overlay-form">
		<header class="saito-overlay-form-header">
			<h2 class="saito-overlay-form-header-title">${esc(mod.returnName())}</h2>
		</header>

		<section class="details">
			<div class="field">
				<span class="label">Version</span>
				<span class="value">${esc(version)}</span>
			</div>
			<div class="field">
				<span class="label">Publisher</span>
				<span class="value">${esc(mod.publisher ? mod.publisher : 'Saito')}</span>
			</div>
			<div class="field">
				<span class="label">Categories</span>
				<span class="value">${esc(mod.categories)}</span>
			</div>
			<div class="field">
				<span class="label">Description</span>
				<span class="value">${esc(mod.description)}</span>
			</div>
		</section>
		${settings}
	</div>`;
};

module.exports = SaitoModuleTemplate;
