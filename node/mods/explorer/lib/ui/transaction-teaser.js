const TransactionTeaserTemplate = require('./transaction-teaser.template');
const { formatTransactionsForTeaser } = require('../explorer-format');

class TransactionTeaser {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
	}

	render(container) {
		if (!container) {
			return;
		}

		const loading = !this.mod.transactionsReady;
		const error = this.mod.transactionsError
			? this.app.browser.escapeHTML(this.mod.transactionsError)
			: null;
		const transactions = loading
			? []
			: formatTransactionsForTeaser(this.app, this.mod.transactions || []);

		this.app.browser.replaceElementContentBySelector(
			TransactionTeaserTemplate({
				transactions,
				loading,
				error,
				loadingMessage:
					'Fetching transaction data. Please be patient while we load recent transactions from the network.',
			}),
			container
		);

		this.attachEvents();
	}

	attachEvents() {
		document
			.querySelectorAll('.transaction-teaser .explorer-feed-item[data-tx-signature]')
			.forEach((el) => {
				const navigate = (event) => {
					if (event?.target?.closest('.explorer-pubkey-link')) {
						return;
					}
					event?.preventDefault?.();

					const signature = el.getAttribute('data-tx-signature');
					if (!signature) {
						return;
					}

					let blockHash = el.getAttribute('data-block-hash') || '';
					if (!blockHash) {
						blockHash = this.mod.resolveBlockHash('', el.getAttribute('data-block-id'));
					}

					if (!blockHash) {
						return;
					}

					this.mod.renderBlock(blockHash, { expandTxSignature: signature });
				};

				el.onclick = navigate;
				el.onkeydown = (event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						navigate(event);
					}
				};
			});
	}
}

module.exports = TransactionTeaser;
