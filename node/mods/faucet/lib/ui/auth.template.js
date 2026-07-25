function escapeHtml(value = '') {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function renderMessage(message = '') {
	const paragraphs = String(message)
		.split(/\n+/)
		.map((line) => line.trim())
		.filter(Boolean);

	if (!paragraphs.length) {
		return '';
	}

	return paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n    ');
}

function renderProviders(providers = []) {
	return providers
		.map((provider) => {
			const id = escapeHtml(provider.id || '');
			const name = escapeHtml(provider.name || provider.id || 'Continue');
			const icon = escapeHtml(provider.icon || '');
			const iconHtml = icon ? `<i class="${icon}" aria-hidden="true"></i>` : '';
			return `
    <button type="button" class="saito-button-primary" data-auth-provider="${id}">
      ${iconHtml}
      Continue with ${name}
    </button>`;
		})
		.join('');
}

module.exports = ({ title = 'Welcome to Saito', message = '', providers = [] } = {}) => {
	const safeTitle = escapeHtml(title);
	const body = renderMessage(message);
	const actions = renderProviders(providers);

	return `
<div class="auth">
  <header class="saito-overlay-form-header">
    <h2 class="saito-overlay-form-header-title">${safeTitle}</h2>
  </header>

  <div class="body">
    ${body}
  </div>

  <div class="actions">
    ${actions}
    <button type="button" class="saito-button-secondary" data-auth-cancel>
      Cancel
    </button>
  </div>
</div>
`;
};
