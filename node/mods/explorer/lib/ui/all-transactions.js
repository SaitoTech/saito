const AllTransactionsTemplate = require('./all-transactions.template');
const {
  formatTransactionsForTeaser,
  extractTransactionsFromBlocks,
  mergeBlockByHash
} = require('../explorer-format');
const { sendExplorerPeerRequest } = require('../peer/client');
const { detectTransactionModule } = require('../module-detect');

const PAGE_SIZE = 25;
const TX_ENRICH_COUNT = 5;

class AllTransactions {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.container = '.explorer-view';

    this.rawBlocks = [];
    this.rawTransactions = [];
    this.loading = true;
    this.loadingMore = false;
    this.hasMore = true;
    this.error = null;
    this.scrollHandler = null;
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.rawBlocks = [];
    this.rawTransactions = [];
    this.loading = true;
    this.loadingMore = false;
    this.hasMore = true;
    this.error = null;
    this.paint();
    this.loadInitial();
  }

  formatTransactions() {
    const app = this.app;
    const formatted = formatTransactionsForTeaser(
      app,
      this.rawTransactions,
      this.rawTransactions.length
    );
    for (let i = 0; i < formatted.length && i < this.rawTransactions.length; i++) {
      const raw = this.rawTransactions[i];
      const moduleName = detectTransactionModule(raw);
      formatted[i].module = app.browser.escapeHTML(moduleName);
    }
    return formatted;
  }

  paint() {
    const transactions =
      this.loading && !this.rawTransactions.length ? [] : this.formatTransactions();

    this.app.browser.replaceElementContentBySelector(
      AllTransactionsTemplate({
        transactions,
        loading: this.loading,
        loadingMore: this.loadingMore,
        hasMore: this.hasMore,
        error: this.error
      }),
      this.container
    );

    this.attachEvents();
  }

  attachEvents() {
    document
      .querySelectorAll('.explorer-all-tx-feed .explorer-feed-item[data-tx-signature]')
      .forEach((el) => {
        const navigate = (event) => {
          if (event?.target?.closest('.explorer-pubkey-link')) {
            return;
          }
          event?.preventDefault?.();

          const signature = el.getAttribute('data-tx-signature');
          if (!signature) return;

          let blockHash = el.getAttribute('data-block-hash') || '';
          if (!blockHash) {
            blockHash = this.mod.resolveBlockHash('', el.getAttribute('data-block-id'));
          }
          if (!blockHash) return;

          this.cleanup();
          this.mod.renderBlock(blockHash, {
            pushState: true,
            animate: true,
            expandTxSignature: signature
          });
        };
        el.onclick = navigate;
        el.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            navigate(event);
          }
        };
      });

    const loadMoreBtn = document.querySelector('.explorer-load-more-btn');
    if (loadMoreBtn) {
      loadMoreBtn.onclick = () => this.loadMore();
    }

    this.setupScrollListener();
  }

  setupScrollListener() {
    this.cleanupScroll();
    this.scrollHandler = () => {
      if (this.loadingMore || !this.hasMore) return;
      const sentinel = document.querySelector('.explorer-load-more');
      if (!sentinel) return;
      const rect = sentinel.getBoundingClientRect();
      if (rect.top < window.innerHeight + 200) {
        this.loadMore();
      }
    };
    window.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  cleanupScroll() {
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
    }
  }

  cleanup() {
    this.cleanupScroll();
  }

  getSmallestBlockId() {
    let smallest = Infinity;
    for (let i = 0; i < this.rawBlocks.length; i++) {
      const id = Number(this.rawBlocks[i]?.id);
      if (Number.isFinite(id) && id < smallest) {
        smallest = id;
      }
    }
    return Number.isFinite(smallest) ? smallest : null;
  }

  requestBlockPromise(peer, identifier) {
    const data = {
      request: 'request block',
      include_transactions: true
    };

    if (typeof identifier === 'bigint' || typeof identifier === 'number') {
      data.block_id = String(identifier);
    } else {
      data.hash = String(identifier);
    }

    return new Promise((resolve) => {
      sendExplorerPeerRequest(this.app, 'request block', {
        data,
        callback: (response) => {
          if (response?.success && response.data) {
            resolve(response.data);
            return;
          }
          resolve(null);
        },
        peer
      });
    });
  }

  async enrichBlocksWithTransactions(peer, blocks) {
    const enrichCount = Math.min(TX_ENRICH_COUNT, blocks.length);
    const requests = [];
    for (let i = 0; i < enrichCount; i++) {
      const id = blocks[i]?.hash || blocks[i]?.id;
      if (id != null && id !== '') {
        requests.push(this.requestBlockPromise(peer, id));
      }
    }

    const results = await Promise.all(requests);
    let enriched = blocks.slice();
    for (const fullBlock of results) {
      if (fullBlock) {
        enriched = mergeBlockByHash(enriched, fullBlock);
      }
    }
    return enriched;
  }

  async loadInitial() {
    const peer = this.mod.explorerPeer;
    if (!peer) {
      this.loading = false;
      this.error = 'Waiting for Explorer peer connection.';
      this.paint();
      return;
    }

    try {
      const headerBlocks = await this.requestBlocksPromise(peer, {
        count: PAGE_SIZE,
        include_offchain: false
      });
      if (!headerBlocks.length) {
        this.loading = false;
        this.hasMore = false;
        this.paint();
        return;
      }

      const enriched = await this.enrichBlocksWithTransactions(peer, headerBlocks);
      this.rawBlocks = enriched;
      this.rawTransactions = extractTransactionsFromBlocks(enriched);
      this.loading = false;
      this.hasMore = headerBlocks.length >= PAGE_SIZE;
      this.paint();
    } catch (err) {
      this.loading = false;
      this.error = 'Failed to load transactions.';
      this.paint();
    }
  }

  requestBlocksPromise(peer, options) {
    const count = options.count ?? 10;
    const includeOffchain = options.include_offchain ?? true;
    const data = {
      request: 'request blocks',
      count,
      include_offchain: includeOffchain
    };

    if (options.before_id != null) {
      data.before_id = Number(options.before_id);
    }

    return new Promise((resolve) => {
      sendExplorerPeerRequest(this.app, 'request blocks', {
        data,
        callback: (response) => {
          if (response?.err || !response?.success) {
            resolve([]);
            return;
          }
          resolve(Array.isArray(response.data) ? response.data : []);
        },
        peer
      });
    });
  }

  async loadMore() {
    if (this.loadingMore || !this.hasMore) return;

    const peer = this.mod.explorerPeer;
    if (!peer) return;

    const beforeId = this.getSmallestBlockId();
    if (!beforeId || beforeId <= 1) {
      this.hasMore = false;
      this.paint();
      return;
    }

    this.loadingMore = true;
    this.paint();

    try {
      const headerBlocks = await this.requestBlocksPromise(peer, {
        count: PAGE_SIZE,
        include_offchain: false,
        before_id: beforeId
      });

      if (!headerBlocks.length) {
        this.loadingMore = false;
        this.hasMore = false;
        this.paint();
        return;
      }

      const enriched = await this.enrichBlocksWithTransactions(peer, headerBlocks);
      this.rawBlocks = this.rawBlocks.concat(enriched);
      this.rawTransactions = extractTransactionsFromBlocks(this.rawBlocks);
      this.loadingMore = false;
      this.hasMore = headerBlocks.length >= PAGE_SIZE;
      this.paint();
    } catch (err) {
      this.loadingMore = false;
      this.hasMore = false;
      this.paint();
    }
  }
}

module.exports = AllTransactions;
