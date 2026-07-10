const SupplyTemplate = require('./supply.template');
const {
	EXPLORER_ENSURE_TEST_MODE_REQUEST,
	EXPLORER_PRODUCE_BLOCK_REQUEST,
	EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST,
} = require('../manual-block-production');
const {
	parseSimulationFeeSaito,
	addFeeTransaction,
} = require('../simulation-transaction');
const { sendExplorerPeerRequest } = require('../peer/client');

function formatProduceError(err) {
	if (!err) {
		return 'Block production failed.';
	}
	if (typeof err === 'string') {
		return err;
	}
	if (err?.message) {
		return err.message;
	}
	return 'Block production failed.';
}

/**
 * Manual block production:
 *   send one produce request → wait for server → refresh supply
 */
class Supply {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.container = '.explorer-view';
		this.fullWidth = false;
		this.producing = false;
		this.produceError = null;
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
				produceError: this.produceError
					? this.app.browser.escapeHTML(this.produceError)
					: null,
				columns: view?.columns || [],
				rows: view?.rows || [],
				hasData: Boolean(view?.hasData),
				fullWidth: this.fullWidth,
				showBlockControls: this.shouldShowBlockControls(),
				produceBlockRequest: EXPLORER_PRODUCE_BLOCK_REQUEST,
				produceBlockWithGtRequest: EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST,
			}),
			this.container
		);

		this.attachEvents();
		this.mod.renderSimulationToolbar();
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

		const feeInput = root.querySelector('[data-supply-fee-input]');
		if (feeInput) {
			feeInput.disabled = isProducing;
		}
	}

	clearProduceError() {
		this.produceError = null;
	}

	showProduceError(message) {
		this.produceError = message;
		this.mod.setSimulationToolbarMessage(message, { isError: true });
		this.paint();
	}

	clearFeeError() {
		const root = document.querySelector(this.container);
		const feeInput = root?.querySelector('[data-supply-fee-input]');
		if (feeInput) {
			feeInput.classList.remove('explorer-supply-fee-input-error');
			feeInput.removeAttribute('aria-invalid');
		}
	}

	showFeeError(message) {
		const root = document.querySelector(this.container);
		const feeInput = root?.querySelector('[data-supply-fee-input]');
		if (feeInput) {
			feeInput.classList.add('explorer-supply-fee-input-error');
			feeInput.setAttribute('aria-invalid', 'true');
			feeInput.focus();
		}
		this.hideFeeSuccess();
		console.warn('Explorer: invalid simulation fee', message);
	}

	resetFeeDiagnostics() {
		const root = document.querySelector(this.container);
		const panel = root?.querySelector('[data-supply-fee-diagnostics]');
		if (!panel) {
			return;
		}

		panel.hidden = false;
		panel.querySelectorAll('[data-fee-step]').forEach((item) => {
			item.dataset.state = 'pending';
			const icon = item.querySelector('[data-fee-step-icon]');
			if (icon) {
				icon.textContent = '…';
			}
		});

		const success = panel.querySelector('[data-supply-fee-success]');
		if (success) {
			success.hidden = true;
		}
	}

	updateFeeDiagnostic(step, ok) {
		const root = document.querySelector(this.container);
		const item = root?.querySelector(`[data-fee-step="${step}"]`);
		if (!item) {
			return;
		}

		item.dataset.state = ok ? 'pass' : 'fail';
		const icon = item.querySelector('[data-fee-step-icon]');
		if (icon) {
			icon.textContent = ok ? '✓' : '✗';
		}
	}

	showFeeSuccess() {
		const root = document.querySelector(this.container);
		const success = root?.querySelector('[data-supply-fee-success]');
		if (success) {
			success.hidden = false;
		}
	}

	hideFeeSuccess() {
		const root = document.querySelector(this.container);
		const success = root?.querySelector('[data-supply-fee-success]');
		if (success) {
			success.hidden = true;
		}
	}

	hideFeeDiagnostics() {
		const root = document.querySelector(this.container);
		const panel = root?.querySelector('[data-supply-fee-diagnostics]');
		if (panel) {
			panel.hidden = true;
		}
		this.hideFeeSuccess();
	}

	async createTransaction() {
		if (this.producing || !this.shouldShowBlockControls()) {
			return;
		}

		if (!this.mod.explorerPeer) {
			this.showFeeError('Explorer peer is not connected.');
			return;
		}

		const root = document.querySelector(this.container);
		const feeInput = root?.querySelector('[data-supply-fee-input]');
		const feeValue = feeInput?.value ?? '';
		const parsed = parseSimulationFeeSaito(feeValue);

		this.clearFeeError();
		if (parsed.error) {
			this.showFeeError(parsed.error);
			return;
		}

		const feeNolan = this.app.wallet.convertSaitoToNolan(parsed.feeSaito);
		if (feeNolan > 0n) {
			let balance = 0n;
			try {
				balance = await this.app.wallet.getBalance();
			} catch (err) {
				console.error('Explorer: failed to read wallet balance', err);
				const message = 'Unable to read wallet balance.';
				if (this.app.browser?.alert) {
					this.app.browser.alert(message);
				} else {
					this.showFeeError(message);
				}
				return;
			}

			if (balance < feeNolan) {
				const message = 'Your wallet does not have enough SAITO to pay this fee.';
				if (this.app.browser?.alert) {
					this.app.browser.alert(message);
				} else {
					this.showFeeError(message);
				}
				return;
			}
		}

		this.setProducingState(true);
		this.resetFeeDiagnostics();
		try {
			await this.sendManualTestingRequest(EXPLORER_ENSURE_TEST_MODE_REQUEST);
			await addFeeTransaction(this.app, parsed.feeSaito, (step, ok) => {
				this.updateFeeDiagnostic(step, ok);
			});
		} catch (err) {
			console.error('Explorer: simulation transaction failed', err);
			this.showFeeError(err?.message || 'Failed to create transaction.');
		} finally {
			this.setProducingState(false);
		}
	}

	sendManualTestingRequest(request) {
		return new Promise((resolve, reject) => {
			sendExplorerPeerRequest(this.app, request, {
				data: { request },
				peer: this.mod.explorerPeer,
				callback: (response) => {
					if (response?.err) {
						reject(response.err);
						return;
					}
					if (!response?.success) {
						reject(new Error(response?.error || 'Block production failed.'));
						return;
					}
					resolve(response);
				},
			});
		});
	}

	async produceBlock(request) {
		if (this.producing || !this.shouldShowBlockControls()) {
			return;
		}

		if (!this.mod.explorerPeer) {
			this.showProduceError('Explorer peer is not connected.');
			return;
		}

		const withGt = request === EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST;

		this.clearProduceError();
		this.mod.clearSimulationToolbarMessage();
		this.setProducingState(true);

		if (withGt) {
			this.mod.beginManualProductionUI(request);
		} else {
			this.mod.setSimulationToolbarMessage('Waiting for block production...');
		}

		try {
			await this.sendManualTestingRequest(request);
			await this.mod.refreshSupplyAfterProduce();
		} catch (err) {
			this.showProduceError(formatProduceError(err));
		} finally {
			if (withGt) {
				this.mod.stopManualProductionUI();
			} else {
				this.mod.clearSimulationToolbarMessage();
			}
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

		root.querySelectorAll('[data-produce-block-request]').forEach((button) => {
			button.onclick = (event) => {
				event.preventDefault();
				this.produceBlock(button.dataset.produceBlockRequest);
			};
		});

		const createTransactionButton = root.querySelector('[data-supply-create-transaction]');
		const feeInput = root.querySelector('[data-supply-fee-input]');
		if (createTransactionButton) {
			createTransactionButton.onclick = (event) => {
				event.preventDefault();
				this.createTransaction();
			};
		}
		if (feeInput) {
			feeInput.onkeydown = (event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					this.createTransaction();
				}
			};
			feeInput.oninput = () => {
				this.clearFeeError();
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
