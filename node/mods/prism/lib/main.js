// Prism dashboard client script (extracted from inline HTML)
(function () {
  // ── Helpers ──────────────────────────────
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;');
  }

  function abbrevKey(key, head, tail) {
    return key;
    //   head = head || 8; tail = tail || 6;
    //   if (!key || key.length < head + tail + 3) return key || '--';
    //   return key.substring(0, head) + '...' + key.slice(-tail);
  }

  function relativeTime(ts) {
    if (!ts) return '--';
    var now = Math.floor(Date.now() / 1000);
    var t = ts > 1e12 ? Math.floor(ts / 1000) : ts;
    var diff = now - t;
    if (diff < 5) return 'just now';
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function formatUptime(ms) {
    if (!ms || ms <= 0) return '--';
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400);
    s %= 86400;
    var h = Math.floor(s / 3600);
    s %= 3600;
    var m = Math.floor(s / 60);
    s %= 60;
    if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
    if (h > 0) return h + 'h ' + m + 'm';
    return m + 'm ' + s + 's';
  }

  function formatTime(ts) {
    var t = ts > 1e12 ? ts : ts * 1000;
    return new Date(t).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatSaito(nolanStr) {
    var n = parseFloat(nolanStr) / 100000000;
    return n.toFixed(4);
  }

  function txTypeLabel(type, sender) {
    if (type === 0 && !sender) return 'fee';
    if (type === 1) return 'bound';
    if (type === 6) return 'issuance';
    if (type === 7) return 'stake';
    return 'normal';
  }

  // ── Paginated Block Table ────────────────
  var blkTablePage = 1;
  var BLOCKS_PER_PAGE = 50;
  var MAX_PAGES = 10; // 10 pages * 50 = 500 blocks max
  var latestBlockIdForTable = 0;
  var blkTableLoading = false;

  function loadBlockTablePage(page) {
    if (blkTableLoading || !latestBlockIdForTable || latestBlockIdForTable <= 0) return;
    blkTableLoading = true;
    blkTablePage = page;

    var startId = latestBlockIdForTable - (page - 1) * BLOCKS_PER_PAGE;
    var endId = startId - BLOCKS_PER_PAGE + 1;
    if (endId < 1) endId = 1;
    if (startId < 1) {
      blkTableLoading = false;
      return;
    }

    var tbody = document.getElementById('blk-table-body');
    tbody.innerHTML =
      '<tr><td colspan="5" class="blk-table-empty"><i class="fas fa-spinner fa-spin" style="margin-right:6px"></i>Loading...</td></tr>';

    fetch('/prism/api/blocks/' + startId + '/' + endId)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        renderBlockTableRows(data.blocks || []);
        renderBlockPagination();
        blkTableLoading = false;
      })
      .catch(function () {
        tbody.innerHTML =
          '<tr><td colspan="5" class="blk-table-empty">Failed to load blocks</td></tr>';
        blkTableLoading = false;
      });
  }

  function renderBlockTableRows(blocks) {
    var tbody = document.getElementById('blk-table-body');
    if (!blocks || blocks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="blk-table-empty">No blocks found</td></tr>';
      return;
    }
    var html = '';
    blocks.forEach(function (b) {
      html += '<tr class="blk-tbl-row" onclick="viewBlock(\'' + escapeHtml(b.hash) + '\')">';
      html += '<td><span class="blk-tbl-id">' + escapeHtml(b.id) + '</span></td>';
      html +=
        '<td><span class="mono" title="' +
        escapeHtml(b.hash) +
        '">' +
        abbrevKey(b.hash, 10, 6) +
        '</span></td>';
      html +=
        '<td><span class="mono" title="' +
        escapeHtml(b.creator) +
        '">' +
        abbrevKey(b.creator, 8, 4) +
        '</span></td>';
      html += '<td>' + (b.txCount || 0) + '</td>';
      html +=
        '<td style="color:var(--pr-text-secondary);font-size:12px">' +
        relativeTime(b.timestamp) +
        '</td>';
      html += '</tr>';
    });
    tbody.innerHTML = html;
  }

  function renderBlockPagination() {
    var container = document.getElementById('blk-pagination');
    if (!latestBlockIdForTable || latestBlockIdForTable <= 0) {
      container.innerHTML = '';
      return;
    }

    var totalPages = Math.min(Math.ceil(latestBlockIdForTable / BLOCKS_PER_PAGE), MAX_PAGES);
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    var html = '';

    // Prev button
    html +=
      '<button class="blk-page-btn' +
      (blkTablePage <= 1 ? ' disabled' : '') +
      '" onclick="loadBlockTablePage(' +
      (blkTablePage - 1) +
      ')"><i class="fas fa-chevron-left"></i></button>';

    // Page numbers
    for (var p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= blkTablePage - 2 && p <= blkTablePage + 2)) {
        html +=
          '<button class="blk-page-btn' +
          (p === blkTablePage ? ' active' : '') +
          '" onclick="loadBlockTablePage(' +
          p +
          ')">' +
          p +
          '</button>';
      } else if (p === blkTablePage - 3 || p === blkTablePage + 3) {
        html += '<span class="blk-page-info">...</span>';
      }
    }

    // Next button
    html +=
      '<button class="blk-page-btn' +
      (blkTablePage >= totalPages ? ' disabled' : '') +
      '" onclick="loadBlockTablePage(' +
      (blkTablePage + 1) +
      ')"><i class="fas fa-chevron-right"></i></button>';

    container.innerHTML = html;
  }

  // ── DOM Updates ─────────────────────────
  function updateStats(data) {
    document.getElementById('stat-height').textContent = data.latestBlockId || '--';
    document.getElementById('block-height').textContent = data.latestBlockId || '--';
    document.getElementById('stat-txs').textContent = data.todayTxCount || 0;
    document.getElementById('stat-addresses').textContent = data.todayActiveAddresses || 0;
    document.getElementById('stat-mempool').textContent = data.mempoolCount || 0;
    document.getElementById('stat-blocks-today').textContent = data.todayBlockCount || 0;
    document.getElementById('uptime').textContent = formatUptime(data.uptime);
  }

  // Track previous block IDs for diff-based animation
  var prevBlockIds = new Set();
  var blockFeedInitialized = false;
  var MAX_BLOCK_CARDS = 20;

  function blockDensityClass(txCount) {
    if (!txCount || txCount === 0) return 'blk-empty-block';
    if (txCount >= 50) return 'blk-hot';
    if (txCount >= 10) return 'blk-busy';
    return '';
  }

  function buildBlockCard(b, isNew) {
    var card = document.createElement('div');
    var density = blockDensityClass(b.txCount);
    card.className = 'blk-card' + (density ? ' ' + density : '');
    card.setAttribute('data-blockid', b.id);
    if (isNew) card.classList.add('blk-new');

    if (isNew) {
      card.addEventListener('animationend', function handler(e) {
        if (e.animationName === 'blkSlideIn') {
          card.classList.remove('blk-new');
          card.removeEventListener('animationend', handler);
        }
      });
    }

    card.onclick = function () {
      viewBlock(b.hash);
    };

    var html = '<div class="blk-card-accent"></div>';
    html += '<div class="blk-card-body">';
    html += '<div class="blk-card-id">' + escapeHtml(b.id) + '</div>';
    html += '<div class="blk-card-hash">' + abbrevKey(b.hash, 6, 4) + '</div>';
    html += '<div class="blk-card-txcount">' + (b.txCount || 0) + '</div>';
    html += '<div class="blk-card-txlabel">transactions</div>';
    html +=
      '<div class="blk-card-creator" title="' +
      escapeHtml(b.creator) +
      '">' +
      abbrevKey(b.creator, 6, 4) +
      '</div>';
    html += '<div class="blk-card-time">' + relativeTime(b.timestamp) + '</div>';
    html += '</div>';

    card.innerHTML = html;
    return card;
  }

  function updateBlockTable(blocks) {
    var container = document.getElementById('block-rail');
    if (!blocks || blocks.length === 0) {
      container.innerHTML =
        '<div class="blk-empty"><i class="fas fa-cubes" style="margin-right:6px"></i>No blocks yet</div>';
      blockFeedInitialized = true;
      return;
    }

    // First load — render all without animation (skip duplicate IDs)
    if (!blockFeedInitialized) {
      container.innerHTML = '';
      blocks.forEach(function (b) {
        if (prevBlockIds.has(String(b.id))) return;
        prevBlockIds.add(String(b.id));
        container.appendChild(buildBlockCard(b, false));
      });
      blockFeedInitialized = true;
      return;
    }

    // Find new blocks
    var newBlocks = [];
    blocks.forEach(function (b) {
      if (!prevBlockIds.has(String(b.id))) newBlocks.push(b);
    });

    // Remove empty state
    var emptyEl = container.querySelector('.blk-empty');
    if (emptyEl) emptyEl.remove();

    // Prepend new block cards from the left (newest leftmost)
    for (var i = newBlocks.length - 1; i >= 0; i--) {
      var card = buildBlockCard(newBlocks[i], true);
      container.insertBefore(card, container.firstChild);
      prevBlockIds.add(String(newBlocks[i].id));
    }

    // Trim excess from right
    while (container.children.length > MAX_BLOCK_CARDS) {
      var removed = container.lastChild;
      if (removed) {
        prevBlockIds.delete(removed.getAttribute('data-blockid'));
        container.removeChild(removed);
      }
    }

    // Scroll to left to show new blocks
    if (newBlocks.length > 0) {
      container.scrollTo({ left: 0, behavior: 'smooth' });
    }

    // Update timestamps on existing cards (they go stale)
    blocks.forEach(function (b) {
      var existing = container.querySelector('[data-blockid="' + b.id + '"] .blk-card-time');
      if (existing) existing.textContent = relativeTime(b.timestamp);
    });
  }

  // Track previous tx set for diff-based animation
  var prevTxKeys = new Set();
  var txFeedInitialized = false;

  function txKey(tx) {
    return (tx.blockId || '') + '-' + (tx.txIndex !== undefined ? tx.txIndex : Math.random());
  }

  function isWhaleTx(feeStr) {
    // Whale if fee > 1 Saito (100000000 nolan)
    try {
      return BigInt(feeStr || '0') > BigInt(100000000);
    } catch (e) {
      return false;
    }
  }

  var MAX_TX_CARDS = 30;

  function buildTxCard(tx, isNew) {
    var label = txTypeLabel(tx.type, tx.sender);
    var whale = isWhaleTx(tx.fee);

    var card = document.createElement('div');
    card.className = 'tx-card t-' + label;
    card.setAttribute('data-txkey', txKey(tx));
    if (isNew) card.classList.add('tx-new');
    if (whale) card.classList.add('tx-whale');

    // Remove tx-new class after animation completes so it doesn't replay
    if (isNew) {
      card.addEventListener('animationend', function handler(e) {
        if (e.animationName === 'txSlideIn') {
          card.classList.remove('tx-new');
          card.removeEventListener('animationend', handler);
        }
      });
    }

    var html = '';
    // Header: badge + module + time
    html += '<div class="tx-card-header">';
    html += '<span class="tx-badge ' + label + '">' + label + '</span>';
    if (tx.module) {
      html +=
        '<span class="tx-module-tag" title="' +
        escapeHtml(tx.module) +
        '">' +
        escapeHtml(tx.module) +
        '</span>';
    }
    html += '<span class="tx-card-time">' + relativeTime(tx.timestamp) + '</span>';
    html += '</div>';

    // Fee
    html += '<div class="tx-fee-row">';
    if (tx.fee && tx.fee !== '0') {
      html += '<span class="tx-fee-amount">' + formatSaito(tx.fee) + '</span>';
      html += '<span class="tx-fee-unit">saito</span>';
    } else {
      html += '<span class="tx-fee-nofee">No fee</span>';
    }
    html += '</div>';

    // Footer: sender → block
    html += '<div class="tx-card-footer">';
    html +=
      '<span class="tx-addr" title="' +
      escapeHtml(tx.sender) +
      '">' +
      (tx.sender ? abbrevKey(tx.sender, 8, 4) : 'system') +
      '</span>';
    html += '<span class="tx-arrow"><i class="fas fa-arrow-right"></i></span>';
    html += '<span class="tx-block-ref">blk ' + escapeHtml(tx.blockId) + '</span>';
    html += '</div>';

    card.innerHTML = html;
    card.addEventListener('click', function () {
      if (card.closest && card.closest('.dragging')) return;
      viewTransaction(tx);
    });
    return card;
  }

  function viewTransaction(tx) {
    var overlay = document.getElementById('search-overlay');
    var content = document.getElementById('search-result-content');
    overlay.classList.add('active');

    var label = txTypeLabel(tx.type, tx.sender);
    var ts = tx.timestamp ? (tx.timestamp > 1e12 ? tx.timestamp : tx.timestamp * 1000) : 0;
    var dateStr = ts ? new Date(ts).toLocaleString() : '--';

    var html =
      '<div class="result-title"><i class="fas fa-exchange-alt" style="color:var(--pr-accent)"></i> Transaction Detail</div>';

    html += '<div class="tx-detail-grid">';

    // Type badge
    html += '<div class="tx-detail-label">Type</div>';
    html +=
      '<div class="tx-detail-value"><span class="tx-badge ' +
      label +
      '">' +
      label +
      '</span></div>';

    // Module
    html += '<div class="tx-detail-label">Module</div>';
    html +=
      '<div class="tx-detail-value">' +
      (tx.module
        ? escapeHtml(tx.module)
        : '<span style="color:var(--pr-text-secondary)">--</span>') +
      '</div>';

    // Fee
    html += '<div class="tx-detail-label">Fee</div>';
    if (tx.fee && tx.fee !== '0') {
      html +=
        '<div class="tx-detail-value">' +
        formatSaito(tx.fee) +
        ' <span style="color:var(--pr-text-secondary)">SAITO</span> <span style="font-size:11px;color:var(--pr-text-secondary)">(' +
        escapeHtml(tx.fee) +
        ' nolan)</span></div>';
    } else {
      html += '<div class="tx-detail-value" style="color:var(--pr-text-secondary)">No fee</div>';
    }

    // Sender
    html += '<div class="tx-detail-label">Sender</div>';
    if (tx.sender) {
      html +=
        '<div class="tx-detail-value" style="word-break:break-all;font-family:monospace;font-size:12px">' +
        escapeHtml(tx.sender) +
        '</div>';
    } else {
      html += '<div class="tx-detail-value" style="color:var(--pr-text-secondary)">system</div>';
    }

    // Recipients
    if (tx.recipients && tx.recipients.length > 0) {
      html += '<div class="tx-detail-label">Recipients</div>';
      html += '<div class="tx-detail-value">';
      tx.recipients.forEach(function (r) {
        html +=
          '<div style="word-break:break-all;font-family:monospace;font-size:12px;margin-bottom:4px">' +
          escapeHtml(r) +
          '</div>';
      });
      html += '</div>';
    }

    // Block
    html += '<div class="tx-detail-label">Block</div>';
    html +=
      '<div class="tx-detail-value"><a style="color:var(--pr-accent);cursor:pointer" onclick="viewBlock(\'' +
      escapeHtml(tx.blockHash || '') +
      '\')">#' +
      escapeHtml(String(tx.blockId)) +
      '</a></div>';

    // Tx Index
    if (tx.txIndex !== undefined) {
      html += '<div class="tx-detail-label">Index</div>';
      html += '<div class="tx-detail-value">' + escapeHtml(String(tx.txIndex)) + '</div>';
    }

    // Timestamp
    html += '<div class="tx-detail-label">Time</div>';
    html += '<div class="tx-detail-value">' + dateStr + '</div>';

    html += '</div>';
    content.innerHTML = html;
  }

  function updateTxFeed(transactions) {
    var container = document.getElementById('tx-feed');
    if (!transactions || transactions.length === 0) {
      container.innerHTML =
        '<div class="tx-empty"><i class="fas fa-bolt" style="margin-right:6px"></i>No transactions yet</div>';
      txFeedInitialized = true;
      return;
    }

    // Build new key set
    var newKeys = new Set();
    transactions.forEach(function (tx) {
      newKeys.add(txKey(tx));
    });

    // First load — build everything without animation
    if (!txFeedInitialized) {
      container.innerHTML = '';
      transactions.forEach(function (tx) {
        container.appendChild(buildTxCard(tx, false));
      });
      prevTxKeys = newKeys;
      txFeedInitialized = true;
      return;
    }

    // Find genuinely new txs (ones not in the previous set)
    var newTxs = [];
    transactions.forEach(function (tx) {
      if (!prevTxKeys.has(txKey(tx))) newTxs.push(tx);
    });

    // Show activity indicator
    if (newTxs.length > 0) {
      var actEl = document.getElementById('tx-activity');
      var countEl = document.getElementById('tx-activity-count');
      var dotEl = document.getElementById('tx-activity-dot');
      actEl.style.display = 'flex';
      countEl.textContent = '+' + newTxs.length + ' new';
      dotEl.style.animation = 'none';
      dotEl.offsetHeight;
      dotEl.style.animation = '';
      clearTimeout(window._txActivityTimer);
      window._txActivityTimer = setTimeout(function () {
        actEl.style.display = 'none';
      }, 5000);
    }

    // Remove any empty-state message
    var emptyEl = container.querySelector('.tx-empty');
    if (emptyEl) emptyEl.remove();

    // Prepend new cards at the start (left side) with animation — in reverse so newest is leftmost
    for (var i = newTxs.length - 1; i >= 0; i--) {
      var card = buildTxCard(newTxs[i], true);
      container.insertBefore(card, container.firstChild);
    }

    // Trim excess cards from the right
    while (container.children.length > MAX_TX_CARDS) {
      container.removeChild(container.lastChild);
    }

    // Auto-scroll to left (start) to show new cards
    if (newTxs.length > 0) {
      container.scrollTo({ left: 0, behavior: 'smooth' });
    }

    prevTxKeys = newKeys;
  }

  // ── Search ──────────────────────────────
  function doSearch() {
    var q = document.getElementById('search-input').value.trim();
    if (!q) return;

    var overlay = document.getElementById('search-overlay');
    var content = document.getElementById('search-result-content');
    overlay.classList.add('active');
    content.innerHTML =
      '<div style="text-align:center;padding:40px;color:var(--pr-text-secondary)"><i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Searching...</div>';

    // If it looks like a block hash, go directly to block detail
    if (/^[a-f0-9]{64}$/i.test(q)) {
      viewBlock(q);
      return;
    }

    fetch('/prism/api/search?q=' + encodeURIComponent(q))
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.type === 'block') {
          renderBlockSearchResult(data.data);
        } else if (data.type === 'address') {
          renderAddressResult(data.data);
        } else {
          content.innerHTML =
            '<div class="result-title"><i class="fas fa-exclamation-circle" style="color:var(--pr-red)"></i> Not Found</div><p style="color:var(--pr-text-secondary)">No results for: ' +
            escapeHtml(q) +
            '</p>';
        }
      })
      .catch(function () {
        content.innerHTML =
          '<div class="result-title"><i class="fas fa-exclamation-triangle" style="color:var(--pr-red)"></i> Error</div><p style="color:var(--pr-text-secondary)">Search failed. Please try again.</p>';
      });
  }

  function viewBlock(hash) {
    var overlay = document.getElementById('search-overlay');
    var content = document.getElementById('search-result-content');
    overlay.classList.add('active');
    content.innerHTML =
      '<div style="text-align:center;padding:40px;color:var(--pr-text-secondary)"><i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Loading block...</div>';

    fetch('/prism/api/block/' + hash)
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data.error) {
          content.innerHTML =
            '<div class="result-title"><i class="fas fa-exclamation-circle" style="color:var(--pr-red)"></i> Not Found</div><p style="color:var(--pr-text-secondary)">' +
            escapeHtml(data.error) +
            '</p>';
          return;
        }
        renderBlockDetail(data);
      })
      .catch(function () {
        content.innerHTML =
          '<div class="result-title"><i class="fas fa-exclamation-triangle" style="color:var(--pr-red)"></i> Error</div><p style="color:var(--pr-text-secondary)">Failed to load block.</p>';
      });
  }

  function renderBlockSearchResult(data) {
    // For search results, redirect to full block detail
    viewBlock(data.hash);
  }

  function renderBlockDetail(data) {
    var content = document.getElementById('search-result-content');
    var html =
      '<div class="result-title"><i class="fas fa-cube" style="color:var(--pr-accent)"></i> Block ' +
      escapeHtml(data.id) +
      '</div>';

    html += '<div class="result-grid">';
    html +=
      '<div class="result-label">Hash</div><div class="result-value">' +
      escapeHtml(data.hash) +
      '</div>';
    html +=
      '<div class="result-label">Creator</div><div class="result-value">' +
      escapeHtml(data.creator) +
      '</div>';
    html +=
      '<div class="result-label">Timestamp</div><div class="result-value">' +
      formatTime(data.timestamp) +
      ' (' +
      relativeTime(data.timestamp) +
      ')</div>';
    html +=
      '<div class="result-label">Previous Hash</div><div class="result-value">' +
      escapeHtml(data.previousBlockHash || '--') +
      '</div>';
    html +=
      '<div class="result-label">Transactions</div><div class="result-value">' +
      (data.txCount !== undefined
        ? data.txCount
        : data.transactions
          ? data.transactions.length
          : 0) +
      '</div>';
    html +=
      '<div class="result-label">Golden Ticket</div><div class="result-value">' +
      (data.hasGoldenTicket ? '<span style="color:var(--pr-green)">Yes</span>' : 'No') +
      '</div>';
    html +=
      '<div class="result-label">Burn Fee</div><div class="result-value">' +
      (data.burnFee || 0) +
      '</div>';
    html +=
      '<div class="result-label">Difficulty</div><div class="result-value">' +
      (data.difficulty || 0) +
      '</div>';
    html += '</div>';

    // Transaction table
    if (data.transactions && data.transactions.length > 0) {
      html +=
        '<div class="card-title" style="margin-top:8px"><i class="fas fa-exchange-alt"></i> Transactions (' +
        data.transactions.length +
        ')</div>';
      html += '<div style="overflow-x:auto"><table class="detail-tx-table">';
      html +=
        '<thead><tr><th>#</th><th>Sender</th><th>Fee</th><th>Type</th><th>Module</th></tr></thead>';
      html += '<tbody>';
      data.transactions.forEach(function (tx) {
        var label = tx.typeLabel || txTypeLabel(tx.type, tx.sender);
        html += '<tr>';
        html += '<td>' + tx.index + '</td>';
        html +=
          '<td title="' +
          escapeHtml(tx.sender) +
          '">' +
          (tx.sender
            ? abbrevKey(tx.sender, 10, 6)
            : '<span style="color:var(--pr-text-secondary)">--</span>') +
          '</td>';
        html += '<td>' + (tx.fee && tx.fee !== '0' ? formatSaito(tx.fee) : '--') + '</td>';
        html +=
          '<td><span class="tx-badge ' +
          label +
          '" style="font-size:8px">' +
          label +
          '</span></td>';
        html += '<td>' + (tx.module ? escapeHtml(tx.module) : '--') + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html +=
        '<p style="color:var(--pr-text-secondary);margin-top:12px;font-size:13px"><i class="fas fa-info-circle" style="margin-right:6px"></i>Transaction data not available (block may be pruned)</p>';
    }

    // Navigation
    html += '<div class="result-nav">';
    if (data.previousBlockHash) {
      html +=
        '<button class="result-nav-btn" onclick="viewBlock(\'' +
        escapeHtml(data.previousBlockHash) +
        '\')"><i class="fas fa-chevron-left"></i> Previous</button>';
    }
    if (data.nextBlockHash) {
      html +=
        '<button class="result-nav-btn" onclick="viewBlock(\'' +
        escapeHtml(data.nextBlockHash) +
        '\')">Next <i class="fas fa-chevron-right"></i></button>';
    }
    html += '</div>';

    content.innerHTML = html;
  }

  function renderAddressResult(data) {
    var content = document.getElementById('search-result-content');
    var html =
      '<div class="result-title"><i class="fas fa-wallet" style="color:var(--pr-purple)"></i> Wallet Address</div>';
    html += '<div class="result-grid">';
    html +=
      '<div class="result-label">Address</div><div class="result-value">' +
      escapeHtml(data.address) +
      '</div>';
    html +=
      '<div class="result-label">Balance (Saito)</div><div class="result-value" style="font-size:18px;font-weight:700">' +
      escapeHtml(data.balanceSaito) +
      '</div>';
    html +=
      '<div class="result-label">Balance (Nolan)</div><div class="result-value">' +
      escapeHtml(data.balanceNolan) +
      '</div>';
    html += '</div>';
    content.innerHTML = html;
  }

  function viewMempool() {
    var overlay = document.getElementById('search-overlay');
    var content = document.getElementById('search-result-content');
    overlay.classList.add('active');
    content.innerHTML =
      '<div style="text-align:center;padding:40px;color:var(--pr-text-secondary)"><i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Loading mempool...</div>';

    fetch('/prism/api/mempool')
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var html =
          '<div class="result-title"><i class="fas fa-hourglass-half" style="color:var(--pr-yellow)"></i> Mempool — ' +
          (data.count || 0) +
          ' pending</div>';

        if (!data.transactions || data.transactions.length === 0) {
          html +=
            '<p style="color:var(--pr-text-secondary);font-size:13px"><i class="fas fa-check-circle" style="color:var(--pr-green);margin-right:6px"></i>Mempool is empty — no pending transactions</p>';
        } else {
          html += '<div style="overflow-x:auto"><table class="detail-tx-table">';
          html += '<thead><tr><th>#</th><th>Sender</th><th>Type</th><th>Module</th></tr></thead>';
          html += '<tbody>';
          data.transactions.forEach(function (tx, i) {
            var label = txTypeLabel(tx.type, tx.sender);
            html += '<tr>';
            html += '<td>' + (i + 1) + '</td>';
            html +=
              '<td title="' +
              escapeHtml(tx.sender) +
              '">' +
              (tx.sender
                ? abbrevKey(tx.sender, 10, 6)
                : '<span style="color:var(--pr-text-secondary)">--</span>') +
              '</td>';
            html +=
              '<td><span class="tx-badge ' +
              label +
              '" style="font-size:8px">' +
              label +
              '</span></td>';
            html += '<td>' + (tx.module ? escapeHtml(tx.module) : '--') + '</td>';
            html += '</tr>';
          });
          html += '</tbody></table></div>';
        }

        content.innerHTML = html;
      })
      .catch(function () {
        content.innerHTML =
          '<div class="result-title"><i class="fas fa-exclamation-triangle" style="color:var(--pr-red)"></i> Error</div><p style="color:var(--pr-text-secondary)">Failed to load mempool data.</p>';
      });
  }

  function closeSearch() {
    document.getElementById('search-overlay').classList.remove('active');
  }

  // Close overlay on background click
  document.getElementById('search-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeSearch();
  });

  // Search on Enter
  document.getElementById('search-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doSearch();
  });

  // ── Drag-to-Scroll for horizontal rails ──
  function enableDragScroll(el) {
    var isDown = false;
    var startX = 0;
    var scrollLeft = 0;
    var hasMoved = false;

    el.addEventListener('mousedown', function (e) {
      isDown = true;
      hasMoved = false;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      el.style.scrollBehavior = 'auto';
    });

    el.addEventListener('mouseleave', function () {
      isDown = false;
    });

    el.addEventListener('mouseup', function (e) {
      isDown = false;
      el.style.scrollBehavior = 'smooth';
      // If we dragged, prevent the click from triggering viewBlock
      if (hasMoved) {
        e.stopPropagation();
        // Temporarily block clicks on child cards
        el.style.pointerEvents = 'none';
        setTimeout(function () {
          el.style.pointerEvents = '';
        }, 50);
      }
    });

    el.addEventListener('mousemove', function (e) {
      if (!isDown) return;
      e.preventDefault();
      var x = e.pageX - el.offsetLeft;
      var walk = (x - startX) * 1.5;
      if (Math.abs(walk) > 3) hasMoved = true;
      el.scrollLeft = scrollLeft - walk;
    });
  }

  // Expose functions used by inline handlers
  window.doSearch = doSearch;
  window.viewBlock = viewBlock;
  window.viewMempool = viewMempool;
  window.closeSearch = closeSearch;
  window.loadBlockTablePage = loadBlockTablePage;

  // Enable drag scroll on both rails
  enableDragScroll(document.getElementById('block-rail'));
  enableDragScroll(document.getElementById('tx-feed'));

  // ── Polling Loop ────────────────────────
  var blockTableInitialized = false;

  async function refresh() {
    try {
      var results = await Promise.all([
        fetch('/prism/api/stats').then(function (r) {
          return r.json();
        }),
        fetch('/prism/api/blocks?limit=20').then(function (r) {
          return r.json();
        }),
        fetch('/prism/api/transactions?limit=30').then(function (r) {
          return r.json();
        })
      ]);
      updateStats(results[0]);
      updateBlockTable(results[1].blocks);
      updateTxFeed(results[2].transactions);

      // Initialize block table on first load with valid block height
      var newLatest = parseInt(results[0].latestBlockId) || 0;
      if (newLatest > 0 && !blockTableInitialized) {
        latestBlockIdForTable = newLatest;
        loadBlockTablePage(1);
        blockTableInitialized = true;
      } else if (newLatest > latestBlockIdForTable) {
        latestBlockIdForTable = newLatest;
        // If on page 1, refresh the table to show newest blocks
        if (blkTablePage === 1) {
          loadBlockTablePage(1);
        } else {
          renderBlockPagination();
        }
      }
    } catch (err) {
      console.error('[Prism] Refresh failed:', err);
    }
  }

  refresh();
  setInterval(refresh, 10000);
})();
