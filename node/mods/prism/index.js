module.exports = async function (app, mod, build_number) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Prism — Saito Explorer</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
  <link rel="stylesheet" type="text/css" href="/${mod.returnSlug()}/style.css?v=${build_number}">
  </head>
<body>
  <div class="dashboard">

    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <div class="header-logo"><i class="fas fa-gem"></i></div>
        <div>
          <div class="header-title">Prism</div>
          <div class="header-subtitle">Saito Blockchain Explorer</div>
        </div>
      </div>
      <div class="header-meta">
        <span>
          <span class="pulse-dot"></span>
          <span class="label">Node</span>
          <span class="value" id="node-key" title="${mod.publicKey}">${mod.publicKey}</span>
        </span>
        <span>
          <i class="fas fa-cube" style="color:var(--pr-accent)"></i>
          <span class="label">Height</span>
          <span class="value" id="block-height">--</span>
        </span>
        <span>
          <i class="fas fa-clock" style="color:var(--pr-text-secondary)"></i>
          <span class="label">Uptime</span>
          <span class="value" id="uptime">--</span>
        </span>
      </div>
    </div>

    <!-- Search -->
    <div class="search-bar">
      <input type="text" id="search-input" placeholder="Search by block hash, block ID, or wallet address..." />
      <button onclick="doSearch()"><i class="fas fa-search"></i> Search</button>
    </div>

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">
          <div class="stat-icon accent"><i class="fas fa-cubes"></i></div>
          Block Height
        </div>
        <div class="stat-value" id="stat-height">--</div>
        <div class="stat-sub">Latest block ID</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          <div class="stat-icon green"><i class="fas fa-exchange-alt"></i></div>
          Txs Today
        </div>
        <div class="stat-value" id="stat-txs">--</div>
        <div class="stat-sub">Transactions today</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          <div class="stat-icon purple"><i class="fas fa-wallet"></i></div>
          Active Addresses
        </div>
        <div class="stat-value" id="stat-addresses">--</div>
        <div class="stat-sub">Unique today</div>
      </div>
      <div class="stat-card stat-card-clickable" onclick="viewMempool()">
        <div class="stat-label">
          <div class="stat-icon yellow"><i class="fas fa-hourglass-half"></i></div>
          Mempool
        </div>
        <div class="stat-value" id="stat-mempool">--</div>
        <div class="stat-sub">Pending transactions — click to view</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">
          <div class="stat-icon blue"><i class="fas fa-layer-group"></i></div>
          Blocks Today
        </div>
        <div class="stat-value" id="stat-blocks-today">--</div>
        <div class="stat-sub">Produced today</div>
      </div>
    </div>

    <!-- Recent Blocks — horizontal draggable cards -->
    <div class="section-card">
      <div class="card-title"><i class="fas fa-cubes"></i> Recent Blocks</div>
      <div class="block-scroll-wrap">
        <div class="block-rail" id="block-rail">
          <div class="blk-empty">Loading...</div>
        </div>
      </div>
    </div>

    <!-- Live Transactions — horizontal scroll -->
    <div class="section-card">
      <div class="card-title">
        <i class="fas fa-bolt"></i> Live Transactions
        <span class="tx-activity" id="tx-activity" style="display:none">
          <span class="tx-activity-dot" id="tx-activity-dot"></span>
          <span id="tx-activity-count"></span>
        </span>
      </div>
      <div class="tx-scroll-wrap">
        <div class="tx-rail" id="tx-feed">
          <div class="tx-empty">Loading...</div>
        </div>
      </div>
    </div>

    <!-- Block Table — paginated -->
    <div class="section-card">
      <div class="card-title"><i class="fas fa-list"></i> Block History</div>
      <div style="overflow-x:auto">
        <table class="blk-table">
          <thead>
            <tr>
              <th class="blk-tbl-id-th">ID</th>
              <th class="blk-tbl-hash-th">Hash</th>
              <th class="blk-tbl-creator-th">Creator</th>
              <th class="blk-tbl-txs-th">Txs</th>
              <th class="blk-tbl-time-th">Time</th>
            </tr>
          </thead>
          <tbody id="blk-table-body">
            <tr><td colspan="5" class="blk-table-empty">Loading...</td></tr>
          </tbody>
        </table>
      </div>
      <div class="blk-pagination" id="blk-pagination"></div>
    </div>
  </div>

  <!-- Search Result Overlay -->
  <div class="search-overlay" id="search-overlay">
    <div class="search-result" id="search-result">
      <button class="search-close" onclick="closeSearch()">&times;</button>
      <div id="search-result-content">Loading...</div>
    </div>
  </div>

  <script src="/prism/lib/main.js?v=${build_number}"></script>
</body>
</html>`;
};
