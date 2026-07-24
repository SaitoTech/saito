const SalesViewTemplate = require('./sales-view.template');

const OWN_STORE_DESCRIPTION =
	'This page shows items actively listed on your store. If you are new to Saito visit our <a class="saito-text-link" href="https://wiki.saito.io" target="_blank" rel="noopener noreferrer">Guide for Sellers</a> which explains how the sales process works. The dropdown to your left can be used to browse your listings by category. When sharing your store online, share the following address, which is specific to your store:';

class SalesView {
	constructor(app, mod, container = '', callbacks = {}) {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.onViewChange = callbacks.onViewChange;
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		if (!this.container) {
			return;
		}

		const publicKey = this.mod.publicKey || '';
		const shareUrl = publicKey ? this.mod.returnStorefrontUrl?.(publicKey) || '' : '';

		this.app.browser.replaceElementContentBySelector(
			SalesViewTemplate({
				title: 'Your Store',
				description: OWN_STORE_DESCRIPTION,
				shareUrl: this.escapeHtml(shareUrl),
				showCopy: !!shareUrl
			}),
			this.container
		);

		this.attachEvents(shareUrl);
	}

	attachEvents(shareUrl = '') {
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}

		const copyBtn = root.querySelector('[data-action="copy-url"]');
		if (copyBtn) {
			copyBtn.onclick = async (e) => {
				e.preventDefault();
				const urlEl = root.querySelector('[data-storefront-url]');
				const raw = (urlEl?.textContent || shareUrl || '').trim();
				if (!raw) {
					return;
				}
				try {
					if (navigator.clipboard?.writeText) {
						await navigator.clipboard.writeText(raw);
					} else {
						const input = document.createElement('input');
						input.value = raw;
						document.body.appendChild(input);
						input.select();
						document.execCommand('copy');
						input.remove();
					}
					if (typeof siteMessage === 'function') {
						siteMessage('Storefront URL copied', 1500);
					}
				} catch (err) {
					console.warn('Store: copy storefront URL failed', err?.message || err);
				}
			};
		}

		const viewSelect = root.querySelector('[data-action="store-view"]');
		if (viewSelect) {
			viewSelect.onchange = (e) => {
				const mode = e.target.value === 'sold' ? 'sold' : 'active';
				if (typeof this.onViewChange === 'function') {
					this.onViewChange(mode);
				}
			};
		}
	}

	escapeHtml(value = '') {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}
}

module.exports = SalesView;
module.exports.OWN_STORE_DESCRIPTION = OWN_STORE_DESCRIPTION;
