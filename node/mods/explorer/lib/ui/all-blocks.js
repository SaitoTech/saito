const AllBlocksTemplate = require('./all-blocks.template');
const { formatBlocksForTeaser } = require('../explorer-format');
const { sendExplorerPeerRequest } = require('../peer/client');

const PAGE_SIZE = 25;

class AllBlocks {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.container = '.explorer-view';
    this.rawBlocks = [];
    this.loading = true;
    this.loadingMore = false;
    this.hasMore = true;
    this.error = null;
    this.scrollHandler = null;
    this.autoRefresh = false;
    this.showForkBlocks = false;
    this.loadToken = 0;
    this.newBlockHash = null;
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.rawBlocks = [];
    this.loading = true;
    this.loadingMore = false;
    this.hasMore = true;
    this.error = null;
    this.newBlockHash = null;
    this.paint();
    this.loadInitial();
  }

  paint() {
    const blocks = formatBlocksForTeaser(this.app, this.rawBlocks);

    this.app.browser.replaceElementContentBySelector(
      AllBlocksTemplate({
        blocks,
        loading: this.loading,
        loadingMore: this.loadingMore,
        hasMore: this.hasMore,
        error: this.error,
        autoRefresh: this.autoRefresh,
        showForkBlocks: this.showForkBlocks,
        newBlockHash: this.newBlockHash
      }),
      this.container
    );

    this.attachEvents();
  }

  attachEvents() {
    document
      .querySelectorAll('.explorer-all-blocks-feed .explorer-block-card[data-block-hash]')
      .forEach((el) => {
        const navigate = (event) => {
          const blockLink = event?.target?.closest(
            '.explorer-block-card-hash-link[data-block-hash]'
          );
          if (blockLink) {
            event.preventDefault();
            const hash = blockLink.getAttribute('data-block-hash');
            if (hash) {
              this.cleanup();
              this.mod.renderBlock(hash, { pushState: true, animate: true });
            }
            return;
          }

          if (event?.target?.closest('.explorer-pubkey-link')) {
            return;
          }
          event?.preventDefault?.();
          const hash = el.getAttribute('data-block-hash');
          if (hash) {
            this.cleanup();
            this.mod.renderBlock(hash, { pushState: true, animate: true });
          }
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

    const autoRefreshCheckbox = document.querySelector('[data-explorer-auto-refresh]');
    if (autoRefreshCheckbox) {
      autoRefreshCheckbox.checked = this.autoRefresh;
      autoRefreshCheckbox.onchange = () => {
        this.autoRefresh = autoRefreshCheckbox.checked;
      };
    }

    const showForkBlocksCheckbox = document.querySelector('[data-explorer-show-forks]');
    if (showForkBlocksCheckbox) {
      showForkBlocksCheckbox.checked = this.showForkBlocks;
      showForkBlocksCheckbox.onchange = () => {
        this.showForkBlocks = showForkBlocksCheckbox.checked;
        this.reload();
      };
    }

    const newBlockRow = document.querySelector('.explorer-block-card--new');
    if (newBlockRow) {
      const animatedHash = newBlockRow.getAttribute('data-block-hash');
      newBlockRow.addEventListener(
        'animationend',
        () => {
          newBlockRow.classList.remove('explorer-block-card--new');
          if (this.newBlockHash === animatedHash) {
            this.newBlockHash = null;
          }
        },
        { once: true }
      );
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
    this.loadToken++;
    this.cleanupScroll();
  }

  reload() {
    this.loadToken++;
    this.rawBlocks = [];
    this.loading = true;
    this.loadingMore = false;
    this.hasMore = true;
    this.error = null;
    this.newBlockHash = null;
    this.paint();
    this.loadInitial();
  }

  onNewBlock(block, longestChain) {
    if (!this.autoRefresh || (!this.showForkBlocks && !longestChain) || !block) {
      return;
    }

    let nextBlock = block;
    if (typeof block.toJson === 'function') {
      try {
        nextBlock = JSON.parse(block.toJson());
      } catch (err) {
        nextBlock = block;
      }
    }

    nextBlock = {
      ...nextBlock,
      in_longest_chain: Boolean(longestChain)
    };

    if (nextBlock.has_golden_ticket == null) {
      try {
        nextBlock.has_golden_ticket = Boolean(block.hasGoldenTicket);
      } catch (err) {
        nextBlock.has_golden_ticket = false;
      }
    }

    const hash = String(nextBlock.hash || '');
    const currentLength = Math.max(this.rawBlocks.length, PAGE_SIZE);
    this.rawBlocks = this.rawBlocks.filter((entry) => String(entry?.hash || '') !== hash);
    this.rawBlocks.unshift(nextBlock);
    this.rawBlocks = this.rawBlocks.slice(0, currentLength);
    this.newBlockHash = hash;
    this.loading = false;
    this.error = null;
    this.paint();
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

  loadInitial() {
    const peer = this.mod.explorerPeer;
    if (!peer) {
      this.loading = false;
      this.error = 'Waiting for Explorer peer connection.';
      this.paint();
      return;
    }

    const token = ++this.loadToken;
    sendExplorerPeerRequest(this.app, 'request blocks', {
      data: {
        request: 'request blocks',
        count: PAGE_SIZE,
        include_offchain: this.showForkBlocks
      },
      callback: (response) => {
        if (token !== this.loadToken) {
          return;
        }
        this.loading = false;
        if (response?.err || !response?.success) {
          this.error = response?.error || 'Failed to load blocks.';
          this.paint();
          return;
        }
        const data = Array.isArray(response.data) ? response.data : [];
        this.rawBlocks = data;
        this.hasMore = data.length >= PAGE_SIZE;
        this.paint();
      },
      peer
    });
  }

  loadMore() {
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

    const token = this.loadToken;
    sendExplorerPeerRequest(this.app, 'request blocks', {
      data: {
        request: 'request blocks',
        count: PAGE_SIZE,
        include_offchain: this.showForkBlocks,
        before_id: beforeId
      },
      callback: (response) => {
        if (token !== this.loadToken) {
          return;
        }
        this.loadingMore = false;
        if (response?.err || !response?.success) {
          this.hasMore = false;
          this.paint();
          return;
        }
        const data = Array.isArray(response.data) ? response.data : [];
        if (data.length === 0) {
          this.hasMore = false;
        } else {
          this.rawBlocks = this.rawBlocks.concat(data);
          this.hasMore = data.length >= PAGE_SIZE;
        }
        this.paint();
      },
      peer
    });
  }
}

module.exports = AllBlocks;
