let SaitoModuleTemplate = (app, mod) => {
  let html = `
	<div class="saito-module-overlay">
		<header class="saito-module-header" style="background-image: url(${mod.returnBanner()});">
			<h1 class="saito-module-titlebar">${mod.returnName()}</h1>
		</header>

		<section class="saito-module-details">
			<div class="detail-key">Version</div>
			<div class="detail-value">${mod.version.toFixed(2)}</div>

			<div class="detail-key">Publisher</div>
			<div class="detail-value">${mod?.publisher ? mod.publisher : 'Saito'}</div>

			<div class="detail-key">Categories</div>
			<div class="detail-value">${mod.categories}</div>

			<div class="detail-key">Description</div>
			<div class="detail-value">${mod.description}</div>
		</section>`;

  if (mod.hasSettings()) {
    html += `<h4>Settings</h4>
		<section class="saito-module-settings">
		</section>`;
  }

  html += `</div>`;
  return html;
};

module.exports = SaitoModuleTemplate;
