const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ListingFieldEditTemplate = require('./listing-field-edit.template');

class ListingFieldEdit {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(app, mod);
		this.onSave = null;
	}

	/**
	 * @param {object} options
	 * @param {string} options.title
	 * @param {string} options.value
	 * @param {boolean} [options.multiline]
	 * @param {string} [options.inputType]
	 * @param {string} [options.placeholder]
	 * @param {(value: string) => void|boolean} options.onSave - return false to keep overlay open
	 */
	render(options = {}) {
		this.onSave = options.onSave || null;

		this.overlay.show(
			ListingFieldEditTemplate({
				title: options.title || 'Edit',
				value: options.value ?? '',
				multiline: !!options.multiline,
				inputType: options.inputType || 'text',
				placeholder: options.placeholder || ''
			})
		);

		this.attachEvents();
	}

	attachEvents() {
		const form = document.querySelector('.store-listing-field-edit');
		const input = document.getElementById('saito-overlay-form-input');
		if (!form || !input) {
			return;
		}

		input.focus();
		if (typeof input.select === 'function') {
			input.select();
		}

		form.querySelector('[data-action="cancel"]')?.addEventListener('click', (e) => {
			e.preventDefault();
			this.overlay.close();
		});

		form.querySelector('.saito-overlay-form-submit')?.addEventListener('click', (e) => {
			e.preventDefault();
			const value = input.value ?? '';
			if (typeof this.onSave === 'function') {
				const ok = this.onSave(value);
				if (ok === false) {
					return;
				}
			}
			this.overlay.close();
		});

		form.addEventListener('submit', (e) => {
			e.preventDefault();
			form.querySelector('.saito-overlay-form-submit')?.click();
		});
	}
}

module.exports = ListingFieldEdit;
