const BlockTemplate = require('./block.template');
const { formatBlockForPage } = require('../explorer-format');

class Block {
	constructor(app, mod, blockHash, expandTxSignature = null) {
		this.app = app;
		this.mod = mod;
		this.blockHash = blockHash;
		this.block = null;
		this.loading = true;
		this.loadingMessage = 'Loading block…';
		this.error = null;
		this.expandedSignature = null;
		this.pendingExpandSignature = expandTxSignature || null;
		this.container = '.explorer-view';
		this.fetchToken = 0;
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		this.loading = true;
		this.loadingMessage = 'Loading block…';
		this.error = null;
		this.block = null;
		this.expandedSignature = null;

		this.paint();
		this.attachEvents();
		this.loadBlock();
	}

	paint() {
		const error = this.error ? this.app.browser.escapeHTML(this.error) : null;
		const block = this.block ? formatBlockForPage(this.app, this.block) : null;
		const expandedSignature = this.expandedSignature || this.pendingExpandSignature;

		this.app.browser.replaceElementContentBySelector(
			BlockTemplate({
				blockHash: this.app.browser.escapeHTML(this.blockHash),
				loading: this.loading,
				loadingMessage: this.app.browser.escapeHTML(this.loadingMessage),
				error,
				block,
				expandedSignature,
			}),
			this.container
		);
	}

	expandAndScrollToTransaction(signature) {
		if (!signature) {
			return;
		}

		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}

		const row = root.querySelector(
			`.explorer-tx-row[data-tx-signature="${CSS.escape(signature)}"]`
		);
		if (!row) {
			return;
		}

		root.querySelectorAll('.explorer-tx-row.is-expanded').forEach((openRow) => {
			if (openRow !== row) {
				openRow.classList.remove('is-expanded');
				const openTeaser = openRow.querySelector('.explorer-tx-teaser');
				if (openTeaser) {
					openTeaser.setAttribute('aria-expanded', 'false');
				}
			}
		});

		row.classList.add('is-expanded');
		const teaser = row.querySelector('.explorer-tx-teaser');
		if (teaser) {
			teaser.setAttribute('aria-expanded', 'true');
		}

		this.expandedSignature = signature;
		this.pendingExpandSignature = null;

		requestAnimationFrame(() => {
			row.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}

	async tryLocalBlock() {
		try {
			if (!this.app?.core?.blockchain?.getBlock) {
				return null;
			}
			return await this.app.core.blockchain.getBlock(this.blockHash, true);
		} catch (err) {
			return null;
		}
	}

	async tryPeerBlock() {
		const peer = this.mod.explorerPeer;
		if (!peer) {
			return null;
		}

		return this.mod.requestBlockFromPeerPromise(this.app, peer, this.blockHash, true);
	}

	async tryCachedBlock() {
		const cached = (this.mod.blocks || []).find((block) => block?.hash === this.blockHash);
		if (!cached) {
			return null;
		}

		if (Array.isArray(cached.transactions) && cached.transactions.length) {
			return cached;
		}

		return null;
	}

	async loadBlock() {
		const token = ++this.fetchToken;
		const expandTarget = this.pendingExpandSignature;

		let rawBlock = await this.tryLocalBlock();
		if (token !== this.fetchToken) {
			return;
		}

		if (!rawBlock) {
			rawBlock = await this.tryCachedBlock();
		}

		if (token !== this.fetchToken) {
			return;
		}

		if (!rawBlock) {
			this.loading = true;
			this.loadingMessage = 'Attempting to load block from network…';
			this.error = null;
			this.paint();

			rawBlock = await this.tryPeerBlock();
		}

		if (token !== this.fetchToken) {
			return;
		}

		if (!rawBlock) {
			this.loading = false;
			this.error = 'Block not found on local chain or Explorer peer.';
			this.block = null;
			this.pendingExpandSignature = null;
		} else {
			this.block = rawBlock;
			this.loading = false;
			this.error = null;
			if (expandTarget) {
				this.expandedSignature = expandTarget;
			}
		}

		this.paint();
		this.attachEvents();

		if (expandTarget && this.block) {
			this.expandAndScrollToTransaction(expandTarget);
		}
	}

	attachEvents() {
		const root = document.querySelector(this.container);
		if (!root) {
			return;
		}

		const backBtn = root.querySelector('[data-explorer-nav="home"]');
		if (backBtn) {
			backBtn.onclick = (e) => {
				e.preventDefault();
				this.mod.renderHome();
			};
		}

		root.querySelectorAll('.explorer-tx-row').forEach((row) => {
			const teaser = row.querySelector('.explorer-tx-teaser');
			if (!teaser) {
				return;
			}

			const toggleRow = (e) => {
				if (e) {
					e.preventDefault();
				}
				const signature = row.getAttribute('data-tx-signature') || '';
				const isExpanded = row.classList.contains('is-expanded');

				root.querySelectorAll('.explorer-tx-row.is-expanded').forEach((openRow) => {
					if (openRow !== row) {
						openRow.classList.remove('is-expanded');
						const btn = openRow.querySelector('.explorer-tx-teaser');
						if (btn) {
							btn.setAttribute('aria-expanded', 'false');
						}
					}
				});

				if (isExpanded) {
					row.classList.remove('is-expanded');
					teaser.setAttribute('aria-expanded', 'false');
					this.expandedSignature = null;
				} else {
					row.classList.add('is-expanded');
					teaser.setAttribute('aria-expanded', 'true');
					this.expandedSignature = signature;
				}
			};

			teaser.onclick = toggleRow;
			teaser.onkeydown = (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					toggleRow(e);
				}
			};
		});

		root.querySelectorAll('.explorer-json-toggle').forEach((toggle) => {
			toggle.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				const node = toggle.closest('.explorer-json-node');
				if (!node) {
					return;
				}
				const isOpen = node.getAttribute('data-json-open') === 'true';
				node.setAttribute('data-json-open', isOpen ? 'false' : 'true');
				toggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
			};
		});
	}
}

module.exports = Block;
