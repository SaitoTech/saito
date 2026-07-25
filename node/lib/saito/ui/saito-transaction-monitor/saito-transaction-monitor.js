const SaitoOverlay = require('../saito-overlay/saito-overlay');
const Template = require('./saito-transaction-monitor.template');

class SaitoTransactionMonitor {
	constructor(app, mod, container = '') {

		this.app = app;
		this.mod = mod;
		this.container = container;

		this.overlay = new SaitoOverlay(app, mod, true, true, false);
		this.overlay.clickBackdropToClose = false;

		this.tx = null;
		this.callback = null;
		this.options = {};
		this._countdown_timer = null;

		//
		// wrap onConfirmation
		//
		if (mod && typeof mod.onConfirmation === 'function') {
			const existing = mod.onConfirmation.bind(mod);
			mod.onConfirmation = async (...args) => {
				this.onConfirmation(...args);
				return await existing(...args);
			};
		}
	}

	/**
	 * Begin watching a transaction and show the waiting UI.
	 *
	 * options:
	 *   tx                 - transaction to monitor
	 *   callback           - Create-NFT style terminal callback
	 *   title / lead / subtitle
	 *   successTitle / successLead / successActionLabel
	 */
	render(options = {}) {

		this.stopCountdown();

		this.options = options;
		this.tx = options.tx || null;
		this.callback = typeof options.callback === 'function' ? options.callback : null;

		this.overlay.clickBackdropToClose = false;
		this.overlay.show(
			Template.pending({
				title: options.title || 'Waiting for Confirmation',
				lead:
					options.lead ||
					'Your transaction has been broadcast to the Saito network.',
				subtitle:
					options.subtitle ||
					'It will become visible once included in a block.'
			}),
			() => {
				this.onOverlayClosed();
			}
		);

		this.startCountdown();
	}

	attachEvents() {
		const btn = document.querySelector(
			'.saito-transaction-monitor [data-action="continue"]'
		);
		if (!btn) {
			return;
		}

		btn.onclick = (e) => {
			e.preventDefault();
			this.hide();
		};
	}

	onConfirmation(blk, tx, conf) {
		if (!this.tx) {
			return;
		}
		if (Number(conf) !== 0) {
			return;
		}
		if (!tx || tx.signature !== this.tx.signature) {
			return;
		}

		this.stopCountdown();
		this.fireCallback({
			status: 'confirmed',
			tx,
			signature: tx.signature
		});
		this.tx = null;

		this.overlay.clickBackdropToClose = true;
		this.overlay.show(
			Template.complete({
				title: this.options.successTitle || 'Confirmed',
				lead: this.options.successLead || '',
				actionLabel: this.options.successActionLabel || 'Continue'
			}),
			() => {
				this.onOverlayClosed();
			}
		);
		this.attachEvents();
	}

	hide() {
		this.stopCountdown();
		this.overlay.close();
	}

	onOverlayClosed() {
		this.stopCountdown();

		// Callback still set means the user closed while waiting.
		if (typeof this.callback === 'function') {
			this.fireCallback({ status: 'cancelled' });
		}

		this.tx = null;
		this.callback = null;
		this.options = {};
		this.overlay.clickBackdropToClose = false;
	}

	fireCallback(result) {
		if (typeof this.callback !== 'function') {
			return;
		}
		const cb = this.callback;
		this.callback = null;
		cb(result);
	}

	startCountdown() {
		this.stopCountdown();

		// Consensus timing lives in options (no blockchain getter).
		const heartbeat =
			Number(this.app?.options?.consensus?.heartbeat_interval) || 30000;
		const full_cycle = Math.round((2 * heartbeat) / 1000);

		// Initial: remaining time until the next expected block
		// (2 × heartbeat after the last block timestamp).
		let seconds = full_cycle;
		const last_ts = Number(this.app?.options?.blockchain?.last_timestamp || 0);
		if (Number.isFinite(last_ts) && last_ts > 0) {
			const elapsed = Math.max(0, Math.floor((Date.now() - last_ts) / 1000));
			const remaining = full_cycle - elapsed;
			// Already past the window → waiting for the following full cycle.
			seconds = remaining > 0 ? remaining : full_cycle;
		}

		const renderSeconds = () => {
			const el = document.querySelector('.saito-transaction-monitor .countdown');
			if (el) {
				el.textContent = String(seconds);
			}
		};

		renderSeconds();

		this._countdown_timer = setInterval(() => {
			seconds -= 1;
			// Subsequent waits are a complete heartbeat period until the next block.
			if (seconds <= 0) {
				seconds = full_cycle;
			}
			renderSeconds();
		}, 1000);
	}

	stopCountdown() {
		if (this._countdown_timer) {
			clearInterval(this._countdown_timer);
			this._countdown_timer = null;
		}
	}
}

module.exports = SaitoTransactionMonitor;
