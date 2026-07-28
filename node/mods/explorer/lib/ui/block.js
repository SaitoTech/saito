const BlockTemplate = require('./block.template');
const { formatBlockForPage, normalizeBlockRecord } = require('../explorer-format');
const {
  collectP2shUnlockTargets,
  exportTransaction,
  unlockTransactionInRustscript
} = require('../tx-actions');

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
    this.fetchingTransactions = false;
    this.fetchTransactionsError = null;
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
    this.fetchingTransactions = false;
    this.fetchTransactionsError = null;

    this.paint();
    this.attachEvents();
    this.loadBlock();
  }

  paint() {
    const error = this.error ? this.app.browser.escapeHTML(this.error) : null;
    const block = this.block ? formatBlockForPage(this.app, this.block) : null;
    const expandedSignature = this.expandedSignature || this.pendingExpandSignature;

    // A block only carries SPV placeholder transactions when it was read from
    // the browser's local lite chain. Offer to pull the full copy from the
    // Explorer peer whenever one is connected.
    const canFetchTransactions = !!block?.hasSpvTransactions && !!this.mod.explorerPeer;
    const fetchTransactionsError = this.fetchTransactionsError
      ? this.app.browser.escapeHTML(this.fetchTransactionsError)
      : null;

    this.app.browser.replaceElementContentBySelector(
      BlockTemplate({
        blockHash: this.app.browser.escapeHTML(this.blockHash),
        loading: this.loading,
        loadingMessage: this.app.browser.escapeHTML(this.loadingMessage),
        error,
        block,
        expandedSignature,
        canFetchTransactions,
        fetchingTransactions: this.fetchingTransactions,
        fetchTransactionsError
      }),
      this.container
    );
  }

  async fetchFullTransactions() {
    if (this.fetchingTransactions) {
      return;
    }

    const peer = this.mod.explorerPeer;
    if (!peer) {
      return;
    }

    this.fetchingTransactions = true;
    this.fetchTransactionsError = null;
    this.paint();
    this.attachEvents();

    let fullBlock = null;
    try {
      fullBlock = await this.mod.requestBlockFromPeerPromise(this.app, peer, this.blockHash, true);
    } catch (err) {
      fullBlock = null;
    }

    // The user may have navigated to another view while the request was in
    // flight; only apply the result if this component is still the active one.
    if (this.mod.blockComponent !== this) {
      return;
    }

    this.fetchingTransactions = false;

    if (fullBlock && Array.isArray(fullBlock.transactions)) {
      // Preserve the metadata already derived from the local block (burn fee,
      // difficulty, etc.) and only swap in the full transaction list so the
      // summary panel does not regress to placeholder values.
      const merged = normalizeBlockRecord(this.block);
      if (merged && typeof merged === 'object') {
        merged.transactions = fullBlock.transactions;
        this.block = merged;
      } else {
        this.block = fullBlock;
      }
      // The previously expanded row was an SPV placeholder that no longer
      // exists in the full transaction list.
      this.expandedSignature = null;
    } else {
      this.fetchTransactionsError =
        'Could not fetch transactions from the Explorer peer. Please try again.';
    }

    this.paint();
    this.attachEvents();
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

  findRawTransaction(signature) {
    if (!signature || !this.block?.transactions?.length) {
      return null;
    }
    for (let i = 0; i < this.block.transactions.length; i++) {
      const tx = this.block.transactions[i];
      const sig = tx?.signature || tx?.hash || '';
      if (sig === signature) {
        return tx;
      }
    }
    return null;
  }

  escapeHtml(text) {
    return this.app.browser.escapeHTML(String(text ?? ''));
  }

  pickP2shUnlockTarget(targets) {
    if (!targets?.length) {
      return Promise.resolve(null);
    }
    if (targets.length === 1) {
      return Promise.resolve(targets[0]);
    }

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'explorer-tx-picker-overlay';
      overlay.innerHTML = `
        <div class="explorer-tx-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="explorer-tx-picker-title">
          <h3 class="explorer-tx-picker-title" id="explorer-tx-picker-title">Select P2SH slip to unlock</h3>
          <div class="explorer-tx-picker-options">
            ${targets
              .map(
                (target, index) => `
              <button type="button" class="explorer-tx-picker-option" data-target-index="${index}">
                ${this.escapeHtml(target.label)}
              </button>
            `
              )
              .join('')}
          </div>
          <button type="button" class="explorer-tx-picker-cancel">Cancel</button>
        </div>
      `;

      const close = (value) => {
        overlay.remove();
        document.removeEventListener('keydown', onKeyDown, true);
        resolve(value);
      };

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close(null);
        }
      };

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          close(null);
        }
      });

      overlay.querySelectorAll('.explorer-tx-picker-option').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const index = Number(btn.getAttribute('data-target-index'));
          close(Number.isFinite(index) ? targets[index] : null);
        });
      });

      overlay.querySelector('.explorer-tx-picker-cancel')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        close(null);
      });

      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKeyDown, true);
      overlay.querySelector('.explorer-tx-picker-option')?.focus();
    });
  }

  async handleUnlockScript(signature) {
    const rawTx = this.findRawTransaction(signature);
    if (!rawTx) {
      return;
    }

    const targets = collectP2shUnlockTargets(rawTx);
    if (!targets.length) {
      return;
    }

    const target = await this.pickP2shUnlockTarget(targets);
    if (!target) {
      return;
    }

    unlockTransactionInRustscript(this.app, rawTx, target);
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

    root.querySelectorAll('.explorer-block-prev-link[data-block-hash]').forEach((link) => {
      link.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const hash = link.getAttribute('data-block-hash');
        if (hash) {
          this.mod.renderBlock(hash, { pushState: true, animate: true });
        }
      };
    });

    root.querySelectorAll('.explorer-block-fetch-txns').forEach((btn) => {
      btn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.fetchFullTransactions();
      };
    });

    root.querySelectorAll('.explorer-block-meta-toggle').forEach((toggle) => {
      toggle.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const panel = toggle
          .closest('.explorer-block-summary-panel')
          ?.querySelector('.explorer-block-detail-panel');
        if (!panel) {
          return;
        }
        const isOpen = panel.hidden;
        panel.hidden = !isOpen;
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        toggle.textContent = isOpen ? 'Hide full block metadata' : 'View full block metadata';
      };
    });

    root.querySelectorAll('.explorer-tx-row').forEach((row) => {
      const teaser = row.querySelector('.explorer-tx-teaser');
      if (!teaser) {
        return;
      }

      const toggleRow = (e) => {
        if (e?.target?.closest('.explorer-action, .explorer-json-toggle, .explorer-link')) {
          return;
        }
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

    root.querySelectorAll('.explorer-txmsg-toggle').forEach((toggle) => {
      toggle.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const section = toggle.closest('.explorer-txmsg-section');
        const payload = section?.querySelector('.explorer-txmsg-payload');
        if (!section || !payload) {
          return;
        }
        const isOpen = !section.classList.contains('is-open');
        section.classList.toggle('is-open', isOpen);
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        payload.hidden = !isOpen;
      };
    });

    root.querySelectorAll('[data-action="tx-export"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const row = btn.closest('.explorer-tx-row');
        const signature = row?.getAttribute('data-tx-signature') || '';
        const rawTx = this.findRawTransaction(signature);
        if (!rawTx) {
          return;
        }
        try {
          exportTransaction(this.app, rawTx);
        } catch (err) {
          console.warn('Explorer: export transaction failed', err);
        }
      });
    });

    root.querySelectorAll('[data-action="tx-unlock-script"]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const row = btn.closest('.explorer-tx-row');
        const signature = row?.getAttribute('data-tx-signature') || '';
        this.handleUnlockScript(signature);
      });
    });
  }
}

module.exports = Block;
