const SupplyTemplate = require('./supply.template');
const {
	EXPLORER_PRODUCE_BLOCK_REQUEST,
	EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST,
} = require('../manual-block-production');

/**
 * Manual block production reuses wallet/WASM produce helpers via Explorer peer
 * requests:
 *   - "explorer-new-block-with-no-gt"  → Produce Block
 *   - "explorer-new-block-with-gt"     → Produce Block + Golden Ticket
 *
 * Explorer only exposes the UI; production itself stays in existing wallet/WASM APIs.
 */
class Supply {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.container = '.explorer-view';
		this.fullWidth = false;
		this.producing = false;
	}

	shouldShowBlockControls() {
		if (typeof this.mod.canExposeManualBlockProduction === 'function') {
			return this.mod.canExposeManualBlockProduction();
		}
		return false;
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		this.mod.supplyComponent = this;
		this.paint();

		if (!this.mod.supplyReady && this.mod.explorerPeer) {
			this.mod.fetchSupplyData(this.app, this.mod.explorerPeer);
		}
	}

	paint() {
		const loading = !this.mod.supplyReady;
		const error = this.mod.supplyError
			? this.app.browser.escapeHTML(this.mod.supplyError)
			: null;
		const view = this.mod.supplyView || null;

		this.app.browser.replaceElementContentBySelector(
			SupplyTemplate({
				loading,
				error,
				columns: view?.columns || [],
				rows: view?.rows || [],
				hasData: Boolean(view?.hasData),
				fullWidth: this.fullWidth,
				showBlockControls: this.shouldShowBlockControls(),
			}),
			this.container
		);

		this.attachEvents();
	}

	setProducingState(isProducing) {
		this.producing = isProducing;
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}

		root.querySelectorAll('.explorer-supply-admin-button').forEach((button) => {
			button.disabled = isProducing;
		});
	}

	async refreshSupplyAfterProduce() {
		if (!this.mod.explorerPeer) {
			return;
		}
		await this.mod.fetchSupplyData(this.app, this.mod.explorerPeer);
	}

	async produceBlock(request) {
		if (this.producing || !this.shouldShowBlockControls()) {
			return;
		}

		this.setProducingState(true);
		try {
			await this.app.network.sendRequestAsTransaction(request);
			await this.refreshSupplyAfterProduce();
		} catch (err) {
			console.error('Explorer: manual block production failed', { request, err });
		} finally {
			this.setProducingState(false);
		}
	}

	attachEvents() {
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}

		root.querySelectorAll('.explorer-supply-block-link').forEach((link) => {
			link.onclick = (event) => {
				event.preventDefault();
				const hash = link.closest('[data-block-hash]')?.dataset?.blockHash;
				if (hash) {
					this.mod.renderBlock(hash, { pushState: true, animate: true });
				}
			};
		});

		const produceBlockButton = root.querySelector('[data-supply-produce-block]');
		if (produceBlockButton) {
			produceBlockButton.onclick = (event) => {
				event.preventDefault();
				this.produceBlock(EXPLORER_PRODUCE_BLOCK_REQUEST);
			};
		}

		const produceBlockGtButton = root.querySelector('[data-supply-produce-block-gt]');
		if (produceBlockGtButton) {
			produceBlockGtButton.onclick = (event) => {
				event.preventDefault();
				this.produceBlock(EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST);
			};
		}

		const widthToggle = root.querySelector('[data-supply-width-toggle]');
		const supplyContainer = root.querySelector('.explorer-supply-page .explorer-container');
		if (widthToggle && supplyContainer) {
			const toggleFullWidth = () => {
				this.fullWidth = !this.fullWidth;
				supplyContainer.classList.toggle('full-width', this.fullWidth);

				const label = this.fullWidth
					? 'Collapse supply dashboard'
					: 'Expand supply dashboard';
				widthToggle.setAttribute('aria-label', label);
				widthToggle.setAttribute('title', label);
				widthToggle.setAttribute('aria-expanded', this.fullWidth ? 'true' : 'false');
			};

			widthToggle.onclick = toggleFullWidth;
			widthToggle.onkeydown = (event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					toggleFullWidth();
				}
			};
		}
	}
}

module.exports = Supply;
