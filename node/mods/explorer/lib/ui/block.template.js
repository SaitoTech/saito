const TransactionTeaserTemplate = require('./tx/transaction-teaser.template');
const TransactionExpandedTemplate = require('./tx/transaction-expanded.template');
const BlockSummaryTemplate = require('./block-summary.template');
const TransactionSkeletonTemplate = require('./tx/transaction-skeleton.template');

module.exports = ({
	blockHash = '',
	loading = true,
	loadingMessage = 'Loading block…',
	error = null,
	block = null,
	expandedSignature = null,
	canFetchTransactions = false,
	fetchingTransactions = false,
	fetchTransactionsError = null,
} = {}) => {
	const title = loading && !block
		? 'Block'
		: error
			? 'Block unavailable'
			: `Block ${block?.number ?? ''}`;

	let body = '';

	if (loading && !block) {
		body = `
      <div class="explorer-block-loading" aria-busy="true" aria-live="polite">
        <p class="explorer-block-loading-message">${loadingMessage}</p>
        <div class="explorer-block-summary explorer-block-summary-skeleton">
          <div class="explorer-info-table-wrap">
            <table class="explorer-info-table">
              <tbody>
                ${Array.from({ length: 7 })
									.map(
										() => `
                  <tr class="explorer-info-row">
                    <th class="explorer-info-label"><div class="explorer-skeleton-line explorer-skeleton-line-sm"></div></th>
                    <td class="explorer-info-value"><div class="explorer-skeleton-line"></div></td>
                  </tr>
                `
									)
									.join('')}
              </tbody>
            </table>
          </div>
        </div>
        <section class="explorer-block-transactions" aria-label="Block transactions">
          <div class="explorer-panel-header">
            <h2 class="explorer-heading explorer-m-0">Transactions</h2>
          </div>
          ${TransactionSkeletonTemplate(6)}
        </section>
      </div>
    `;
	} else if (error) {
		body = `
      <div class="explorer-teaser-loading explorer-teaser-error">
        <p class="explorer-teaser-loading-title">Unable to load block</p>
        <p class="explorer-teaser-loading-message">${error}</p>
      </div>
    `;
	} else if (block) {
		const txRows = (block.transactions || []).map((tx) => {
			const isExpanded = expandedSignature && tx.signatureRaw === expandedSignature;
			return `
          <div class="explorer-tx-row${isExpanded ? ' is-expanded' : ''}" data-tx-signature="${tx.signatureRaw}">
            ${TransactionTeaserTemplate(tx)}
            <div class="explorer-tx-row-expanded">
              ${TransactionExpandedTemplate(tx)}
            </div>
          </div>
        `;
		});

		const spvNotice = canFetchTransactions
			? `
        <div class="explorer-block-spv-notice">
          <p class="explorer-block-spv-text">This is a lightweight (SPV) copy of the block from your local node, so most transactions are hidden.</p>
          <button type="button" class="explorer-block-fetch-txns"${fetchingTransactions ? ' disabled aria-busy="true"' : ''}>
            ${fetchingTransactions ? 'Fetching transactions…' : 'Click to fetch transactions'}
          </button>
          ${fetchTransactionsError ? `<p class="explorer-block-spv-error" role="alert">${fetchTransactionsError}</p>` : ''}
        </div>
      `
			: '';

		body = `
      <div class="explorer-block-summary">
        ${BlockSummaryTemplate({
					primary: block.summaryPrimary || [],
					detail: block.summaryDetail || [],
					badges: block.summaryBadges || null,
				})}
      </div>
      <section class="explorer-block-transactions" aria-label="Block transactions">
        <div class="explorer-panel-header">
          <h2 class="explorer-heading explorer-m-0">Transactions <span class="explorer-panel-count">${block.transactions?.length ?? 0}</span></h2>
        </div>
        ${spvNotice}
        <div class="explorer-tx-list explorer-feed">
          ${
						txRows.length
							? txRows.join('')
							: '<div class="explorer-teaser-loading"><p class="explorer-teaser-loading-message">No transactions in this block.</p></div>'
					}
        </div>
      </section>
    `;
	}

	return `
    <main class="explorer-content explorer-view-panel">
      <div class="explorer-container explorer-stack">
        <div class="explorer-block-header">
          <button type="button" class="explorer-back-link" data-explorer-nav="home" aria-label="Back to Explorer">
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
          </button>
          <div class="explorer-block-header-text">
            <h1 class="explorer-page-title explorer-block-page-title">${title}</h1>
          </div>
        </div>
        <section class="explorer-block explorer-panel">
          ${body}
        </section>
      </div>
    </main>
  `;
};
