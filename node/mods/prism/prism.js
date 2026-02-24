const ModTemplate = require('../../lib/templates/modtemplate');
const JSON = require('json-bigint');
const S = require('saito-js/saito').default;
const PrismHome = require('./index');

class Prism extends ModTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.name = 'Prism';
    this.slug = 'prism';
    this.description = 'Saito blockchain explorer with real-time monitoring';
    this.categories = 'Utilities Devtools';

    this.publicKey = 'loading...';
    this.startTime = null;

    // Recent blocks (newest-first, capped)
    this.recentBlocks = [];
    this.MAX_RECENT_BLOCKS = 50;

    // Recent transactions (newest-first, capped)
    this.recentTransactions = [];
    this.MAX_RECENT_TXS = 100;

    // Block history for chart (oldest-first, capped)
    this.blockHistory = [];
    this.MAX_BLOCK_HISTORY = 200;

    // Daily stats keyed by YYYY-MM-DD
    this.dailyStats = {};
    this.MAX_DAILY_DAYS = 30;

    return this;
  }

  async initialize(app) {
    super.initialize(app);

    if (this.app.BROWSER === 1) {
      return;
    }

    this.startTime = Date.now();

    if (this.app.wallet && typeof this.app.wallet.returnPublicKey === 'function') {
      this.publicKey = this.app.wallet.returnPublicKey();
    } else {
      try {
        this.publicKey = await this.app.wallet.getPublicKey();
      } catch (e) {}
    }

    console.log('[Prism] Module initialized');
    console.log('[Prism] Node Public Key: ' + this.publicKey);

    // Pre-populate recent blocks from chain
    await this.loadInitialBlocks();
  }

  async loadInitialBlocks() {
    try {
      const latestId = await this.app.blockchain.getLatestBlockId();
      if (!latestId || latestId <= BigInt(0)) return;

      const count = Math.min(Number(latestId), 20);
      console.log('[Prism] Loading last ' + count + ' blocks...');

      for (let i = 0; i < count; i++) {
        const blockId = latestId - BigInt(i);
        if (blockId <= BigInt(0)) break;

        try {
          const hash = await this.app.blockchain.getLongestChainHashAtId(blockId);
          if (!hash) continue;

          const block = await this.app.blockchain.getBlock(hash);
          if (!block) continue;

          const blockData = this.extractBlockData(block);
          this.recentBlocks.push(blockData);
          this.blockHistory.push({
            timestamp: blockData.timestamp,
            blockId: blockData.id.toString(),
            txCount: blockData.txCount
          });

          // Process transactions if available
          if (block.transactions && block.transactions.length > 0) {
            const { txs, addresses } = this.processBlockTransactions(block, blockData);
            for (let t = 0; t < txs.length; t++) {
              this.recentTransactions.push(txs[t]);
            }
            this.updateDailyStats(blockData.timestamp, txs.length, blockData, addresses);
          } else {
            this.updateDailyStats(blockData.timestamp, 0, blockData, new Set());
          }
        } catch (e) {
          // Skip blocks that can't be loaded
        }
      }

      // blockHistory should be oldest-first for chart
      this.blockHistory.reverse();

      // Trim
      if (this.recentTransactions.length > this.MAX_RECENT_TXS) {
        this.recentTransactions = this.recentTransactions.slice(0, this.MAX_RECENT_TXS);
      }

      console.log(
        '[Prism] Loaded ' +
          this.recentBlocks.length +
          ' blocks, ' +
          this.recentTransactions.length +
          ' transactions'
      );
    } catch (err) {
      console.error('[Prism] Error loading initial blocks: ' + err.message);
    }
  }

  extractBlockData(block) {
    let blockJson = {};
    try {
      blockJson = JSON.parse(block.toJson());
    } catch (e) {}

    return {
      id: block.id ? block.id.toString() : '0',
      hash: block.hash || '',
      creator: blockJson.creator || '',
      timestamp: Number(blockJson.timestamp || block.timestamp || 0),
      txCount: block.transactions ? block.transactions.length : 0,
      previousBlockHash: block.previousBlockHash || '',
      burnFee: (() => {
        try {
          return Number(block.burnFee) || 0;
        } catch (e) {
          return 0;
        }
      })(),
      difficulty: (() => {
        try {
          return Number(block.difficulty) || 0;
        } catch (e) {
          return 0;
        }
      })(),
      hasGoldenTicket: !!block.hasGoldenTicket
    };
  }

  processBlockTransactions(block, blockData) {
    const txs = [];
    const addresses = new Set();

    if (!block.transactions) return { txs, addresses };

    for (let i = 0; i < block.transactions.length; i++) {
      try {
        const tx = block.transactions[i];
        let txJson = {};
        try {
          txJson =
            typeof tx.toJson === 'function'
              ? typeof tx.toJson() === 'string'
                ? JSON.parse(tx.toJson())
                : tx.toJson()
              : {};
        } catch (e) {}

        const fromArr = txJson.from || [];
        const toArr = txJson.to || [];

        // Calculate fee
        let inputs = BigInt(0);
        let outputs = BigInt(0);
        for (let v = 0; v < fromArr.length; v++) {
          try {
            inputs += BigInt(fromArr[v].amount || 0);
          } catch (e) {}
        }
        for (let v = 0; v < toArr.length; v++) {
          try {
            if (toArr[v].type != 1 && toArr[v].type != 2) {
              outputs += BigInt(toArr[v].amount || 0);
            }
          } catch (e) {}
        }
        let fee = inputs - outputs;
        if (fee < BigInt(0)) fee = BigInt(0);

        // Sender
        let sender = '';
        if (fromArr.length > 0 && fromArr[0].publicKey) {
          sender = fromArr[0].publicKey;
          addresses.add(sender);
        }

        // Receivers
        for (let v = 0; v < toArr.length; v++) {
          if (toArr[v].publicKey) addresses.add(toArr[v].publicKey);
        }

        // Module info
        let moduleName = '';
        try {
          const msg = tx.returnMessage();
          if (msg && msg.module) moduleName = msg.module;
        } catch (e) {}

        // Type label
        const txType =
          txJson.type !== undefined
            ? Number(txJson.type)
            : tx.type !== undefined
              ? Number(tx.type)
              : 0;

        // Recipients list
        let recipients = [];
        for (let v = 0; v < toArr.length; v++) {
          if (toArr[v].publicKey && toArr[v].type != 1 && toArr[v].type != 2) {
            recipients.push(toArr[v].publicKey);
          }
        }

        txs.push({
          blockId: blockData.id,
          blockHash: blockData.hash,
          txIndex: i,
          sender: sender,
          recipients: recipients,
          fee: fee.toString(),
          type: txType,
          module: moduleName,
          timestamp: blockData.timestamp
        });
      } catch (e) {
        // Skip malformed transactions
      }
    }

    return { txs, addresses };
  }

  updateDailyStats(timestamp, txCount, blockData, addresses) {
    // Normalize: if timestamp looks like seconds (< 1e12), convert to ms
    const tsMs =
      timestamp && timestamp > 0 ? (timestamp > 1e12 ? timestamp : timestamp * 1000) : Date.now();
    const date = new Date(tsMs).toISOString().split('T')[0];

    if (!this.dailyStats[date]) {
      this.dailyStats[date] = {
        txCount: 0,
        activeAddresses: new Set(),
        blockCount: 0
      };
    }

    this.dailyStats[date].txCount += txCount;
    this.dailyStats[date].blockCount += 1;
    console.log(
      '[Prism] dailyStats[' +
        date +
        '] txCount=' +
        this.dailyStats[date].txCount +
        ' blockCount=' +
        this.dailyStats[date].blockCount +
        ' addresses=' +
        this.dailyStats[date].activeAddresses.size
    );

    if (addresses && addresses.size > 0) {
      for (const addr of addresses) {
        this.dailyStats[date].activeAddresses.add(addr);
      }
    }

    // Prune old days
    const days = Object.keys(this.dailyStats).sort();
    while (days.length > this.MAX_DAILY_DAYS) {
      delete this.dailyStats[days.shift()];
    }
  }

  getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  // ─── Lifecycle callback: real-time block tracking ───
  onNewBlock(blk, lc) {
    if (this.app.BROWSER === 1) return;
    if (!blk) return;

    try {
      const blockData = this.extractBlockData(blk);

      // Deduplicate by hash or block ID
      for (let i = 0; i < this.recentBlocks.length; i++) {
        if (
          this.recentBlocks[i].hash === blockData.hash ||
          this.recentBlocks[i].id === blockData.id
        )
          return;
      }

      // Add to recent blocks (newest-first)
      this.recentBlocks.unshift(blockData);
      if (this.recentBlocks.length > this.MAX_RECENT_BLOCKS) {
        this.recentBlocks.length = this.MAX_RECENT_BLOCKS;
      }

      // Add to block history (oldest-first for chart)
      this.blockHistory.push({
        timestamp: blockData.timestamp,
        blockId: blockData.id,
        txCount: blockData.txCount
      });
      if (this.blockHistory.length > this.MAX_BLOCK_HISTORY) {
        this.blockHistory = this.blockHistory.slice(-this.MAX_BLOCK_HISTORY);
      }

      // Process transactions
      if (blk.transactions && blk.transactions.length > 0) {
        const { txs, addresses } = this.processBlockTransactions(blk, blockData);

        // Add to recent transactions (newest-first)
        for (let i = txs.length - 1; i >= 0; i--) {
          this.recentTransactions.unshift(txs[i]);
        }
        if (this.recentTransactions.length > this.MAX_RECENT_TXS) {
          this.recentTransactions.length = this.MAX_RECENT_TXS;
        }

        this.updateDailyStats(blockData.timestamp, txs.length, blockData, addresses);
      } else {
        this.updateDailyStats(blockData.timestamp, 0, blockData, new Set());
      }

      console.log('[Prism] New block ' + blockData.id + ' — ' + blockData.txCount + ' txs');
    } catch (err) {
      console.error('[Prism] onNewBlock error: ' + err.message);
    }
  }

  // ─── Web Server ───
  webServer(app, expressapp, express) {
    var self = this;
    var baseUri = '/' + this.returnSlug();
    var webdir = `${__dirname}/web`;
    var libdir = `${__dirname}/lib`;

    // Serve static files from web and lib directories (CSS, JS, etc.)
    expressapp.use(baseUri, express.static(webdir));
    expressapp.use(baseUri + '/lib', express.static(libdir));

    // Dashboard HTML
    expressapp.get(baseUri, async function (req, res) {
      try {
        var html = await PrismHome(app, self, app.build_number || 'dev');
        if (!res.headersSent) {
          res.setHeader('Content-type', 'text/html');
          res.send(html);
        }
      } catch (err) {
        console.error('[Prism] Error rendering dashboard: ' + (err.message || 'unknown'));
        res.status(500).send('<h1>Internal Error</h1>');
      }
    });

    // ─── API: Stats ───
    expressapp.get(baseUri + '/api/stats', async function (req, res) {
      try {
        let latestBlockId = '0';
        try {
          const id = await app.blockchain.getLatestBlockId();
          latestBlockId = id ? id.toString() : '0';
        } catch (e) {}

        let mempoolCount = 0;
        try {
          const txs = await S.getInstance().getMempoolTxs();
          mempoolCount = txs ? txs.length : 0;
        } catch (e) {}

        const today = self.getTodayKey();
        const todayData = self.dailyStats[today] || {
          txCount: 0,
          activeAddresses: new Set(),
          blockCount: 0
        };

        res.json({
          latestBlockId,
          nodeKey: self.publicKey,
          uptime: self.startTime ? Date.now() - self.startTime : 0,
          mempoolCount,
          todayTxCount: todayData.txCount,
          todayActiveAddresses: todayData.activeAddresses ? todayData.activeAddresses.size : 0,
          todayBlockCount: todayData.blockCount
        });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch stats' });
      }
    });

    // ─── API: Recent Blocks ───
    expressapp.get(baseUri + '/api/blocks', function (req, res) {
      const limit = Math.min(parseInt(req.query.limit) || 20, self.MAX_RECENT_BLOCKS);
      res.json({ blocks: self.recentBlocks.slice(0, limit) });
    });

    // ─── API: Block Detail ───
    expressapp.get(baseUri + '/api/block/:hash', async function (req, res) {
      const hash = req.params.hash;
      if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
        return res.status(400).json({ error: 'Invalid block hash' });
      }

      try {
        let block = await app.blockchain.getBlock(hash);
        if (!block) {
          return res.status(404).json({ error: 'Block not found' });
        }

        let blockJson = {};
        try {
          blockJson = JSON.parse(block.toJson());
        } catch (e) {}

        const blockData = {
          id: block.id ? block.id.toString() : '0',
          hash: block.hash || hash,
          creator: blockJson.creator || '',
          timestamp: Number(blockJson.timestamp || block.timestamp || 0),
          previousBlockHash: block.previousBlockHash || '',
          burnFee: (() => {
            try {
              return Number(block.burnFee) || 0;
            } catch (e) {
              return 0;
            }
          })(),
          difficulty: (() => {
            try {
              return Number(block.difficulty) || 0;
            } catch (e) {
              return 0;
            }
          })(),
          hasGoldenTicket: !!block.hasGoldenTicket,
          transactions: []
        };

        // Try to get transactions
        if (block.transactions && block.transactions.length > 0) {
          blockData.transactions = self.formatTransactionsForApi(block, blockData);
          blockData.txCount = blockData.transactions.length;
        } else {
          // Try loading from storage
          try {
            const stored = await app.storage.loadBlockByHash(hash);
            if (stored && stored.transactions && stored.transactions.length > 0) {
              blockData.transactions = self.formatTransactionsForApi(stored, blockData);
              blockData.txCount = blockData.transactions.length;
            } else {
              blockData.txCount = 0;
            }
          } catch (e) {
            blockData.txCount = 0;
          }
        }

        // Get next block hash
        try {
          const nextId = BigInt(blockData.id) + BigInt(1);
          const nextHash = await app.blockchain.getLongestChainHashAtId(nextId);
          blockData.nextBlockHash = nextHash || null;
        } catch (e) {
          blockData.nextBlockHash = null;
        }

        res.json(blockData);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch block' });
      }
    });

    // ─── API: Block Range ───
    expressapp.get(baseUri + '/api/blocks/:startId/:endId', async function (req, res) {
      try {
        let startId, endId;
        try {
          startId = BigInt(req.params.startId);
          endId = BigInt(req.params.endId);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid block IDs' });
        }

        if (startId < endId || endId < BigInt(0)) {
          return res.status(400).json({ error: 'start_id must be >= end_id' });
        }
        if (startId - endId + BigInt(1) > BigInt(50)) {
          return res.status(400).json({ error: 'Max 50 blocks per request' });
        }

        const blocks = [];
        for (let id = startId; id >= endId; id--) {
          try {
            const hash = await app.blockchain.getLongestChainHashAtId(id);
            if (!hash) continue;
            const block = await app.blockchain.getBlock(hash);
            if (!block) continue;
            blocks.push(self.extractBlockData(block));
          } catch (e) {}
        }

        res.json({ blocks });
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch blocks' });
      }
    });

    // ─── API: Recent Transactions ───
    expressapp.get(baseUri + '/api/transactions', function (req, res) {
      const limit = Math.min(parseInt(req.query.limit) || 30, self.MAX_RECENT_TXS);
      res.json({ transactions: self.recentTransactions.slice(0, limit) });
    });

    // ─── API: Mempool ───
    expressapp.get(baseUri + '/api/mempool', async function (req, res) {
      try {
        const txs = await S.getInstance().getMempoolTxs();
        const formatted = [];
        if (txs && txs.length > 0) {
          for (let i = 0; i < txs.length; i++) {
            try {
              let txJson = {};
              try {
                txJson = typeof txs[i].toJson === 'function' ? JSON.parse(txs[i].toJson()) : txs[i];
              } catch (e) {
                txJson = txs[i];
              }

              const fromArr = txJson.from || [];
              let sender = fromArr.length > 0 ? fromArr[0].publicKey || '' : '';
              let moduleName = '';
              try {
                const msg =
                  typeof txs[i].returnMessage === 'function'
                    ? txs[i].returnMessage()
                    : txJson.msg || {};
                moduleName = msg.module || '';
              } catch (e) {}

              formatted.push({
                sender,
                type: txJson.type !== undefined ? Number(txJson.type) : 0,
                module: moduleName
              });
            } catch (e) {}
          }
        }
        res.json({ count: txs ? txs.length : 0, transactions: formatted });
      } catch (err) {
        res.json({ count: 0, transactions: [] });
      }
    });

    // ─── API: Search ───
    expressapp.get(baseUri + '/api/search', async function (req, res) {
      const q = (req.query.q || '').trim();
      if (!q) return res.status(400).json({ error: 'Missing query parameter' });

      // Detect type: 64-char hex = hash, numeric = block ID, else = address
      if (/^[a-f0-9]{64}$/i.test(q)) {
        // Block hash
        try {
          const block = await app.blockchain.getBlock(q);
          if (block) {
            let blockJson = {};
            try {
              blockJson = JSON.parse(block.toJson());
            } catch (e) {}
            const data = {
              id: block.id ? block.id.toString() : '0',
              hash: block.hash || q,
              creator: blockJson.creator || '',
              timestamp: Number(blockJson.timestamp || block.timestamp || 0),
              txCount: block.transactions ? block.transactions.length : 0,
              previousBlockHash: block.previousBlockHash || ''
            };
            return res.json({ type: 'block', data });
          }
        } catch (e) {}
        return res.status(404).json({ type: 'not_found', query: q });
      } else if (/^\d+$/.test(q)) {
        // Block ID
        try {
          const hash = await app.blockchain.getLongestChainHashAtId(BigInt(q));
          if (hash) {
            const block = await app.blockchain.getBlock(hash);
            if (block) {
              let blockJson = {};
              try {
                blockJson = JSON.parse(block.toJson());
              } catch (e) {}
              const data = {
                id: block.id ? block.id.toString() : q,
                hash: block.hash || hash,
                creator: blockJson.creator || '',
                timestamp: Number(blockJson.timestamp || block.timestamp || 0),
                txCount: block.transactions ? block.transactions.length : 0,
                previousBlockHash: block.previousBlockHash || ''
              };
              return res.json({ type: 'block', data });
            }
          }
        } catch (e) {}
        return res.status(404).json({ type: 'not_found', query: q });
      } else {
        // Address / public key
        try {
          const snapshot = await S.getInstance().getBalanceSnapshot([q]);
          if (snapshot) {
            // Parse snapshot text
            const lines = snapshot.toString().split(/\n/).filter(Boolean);
            let balance = BigInt(0);
            for (let i = 1; i < lines.length; i++) {
              const parts = lines[i].split(/\s+/);
              if (parts[0] === q || parts.length >= 5) {
                try {
                  balance += BigInt(parts[4] || 0);
                } catch (e) {}
              }
            }
            return res.json({
              type: 'address',
              data: {
                address: q,
                balanceNolan: balance.toString(),
                balanceSaito: (Number(balance) / 100000000).toFixed(8)
              }
            });
          }
        } catch (e) {}
        return res.json({
          type: 'address',
          data: { address: q, balanceNolan: '0', balanceSaito: '0.00000000' }
        });
      }
    });

    // ─── API: History (chart data) ───
    expressapp.get(baseUri + '/api/history', function (req, res) {
      res.json({ blocks: self.blockHistory });
    });

    // ─── API: Daily Stats ───
    expressapp.get(baseUri + '/api/daily', function (req, res) {
      const days = Object.keys(self.dailyStats)
        .sort()
        .map((date) => ({
          date,
          txCount: self.dailyStats[date].txCount,
          activeAddresses: self.dailyStats[date].activeAddresses
            ? self.dailyStats[date].activeAddresses.size
            : 0,
          blockCount: self.dailyStats[date].blockCount
        }));
      res.json({ days });
    });

    // ─── API: Balance ───
    expressapp.get(baseUri + '/api/balance/:pubkey', async function (req, res) {
      const pubkey = req.params.pubkey;
      if (!pubkey) return res.status(400).json({ error: 'Missing public key' });

      try {
        const snapshot = await S.getInstance().getBalanceSnapshot([pubkey]);
        const lines = snapshot.toString().split(/\n/).filter(Boolean);
        let balance = BigInt(0);
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(/\s+/);
          try {
            balance += BigInt(parts[4] || 0);
          } catch (e) {}
        }
        res.json({
          address: pubkey,
          balanceNolan: balance.toString(),
          balanceSaito: (Number(balance) / 100000000).toFixed(8)
        });
      } catch (err) {
        res.json({ address: pubkey, balanceNolan: '0', balanceSaito: '0.00000000' });
      }
    });
  }

  formatTransactionsForApi(block, blockData) {
    const result = [];
    if (!block.transactions) return result;

    for (let i = 0; i < block.transactions.length; i++) {
      try {
        const tx = block.transactions[i];
        let txJson = {};
        try {
          txJson =
            typeof tx.toJson === 'function'
              ? typeof tx.toJson() === 'string'
                ? JSON.parse(tx.toJson())
                : tx.toJson()
              : {};
        } catch (e) {}

        const fromArr = txJson.from || [];
        const toArr = txJson.to || [];

        let inputs = BigInt(0);
        let outputs = BigInt(0);
        for (let v = 0; v < fromArr.length; v++) {
          try {
            inputs += BigInt(fromArr[v].amount || 0);
          } catch (e) {}
        }
        for (let v = 0; v < toArr.length; v++) {
          try {
            if (toArr[v].type != 1 && toArr[v].type != 2) {
              outputs += BigInt(toArr[v].amount || 0);
            }
          } catch (e) {}
        }
        let fee = inputs - outputs;
        if (fee < BigInt(0)) fee = BigInt(0);

        let sender = fromArr.length > 0 ? fromArr[0].publicKey || '' : '';
        let moduleName = '';
        try {
          const msg = tx.returnMessage();
          if (msg && msg.module) moduleName = msg.module;
        } catch (e) {}

        const txType =
          txJson.type !== undefined
            ? Number(txJson.type)
            : tx.type !== undefined
              ? Number(tx.type)
              : 0;

        let typeLabel = 'normal';
        if (txType === 0 && sender === '') typeLabel = 'fee';
        else if (txType === 1) typeLabel = 'bound';
        else if (txType === 6) typeLabel = 'issuance';
        else if (txType === 7) typeLabel = 'stake';

        result.push({
          index: i,
          sender,
          fee: fee.toString(),
          type: txType,
          typeLabel,
          module: moduleName,
          from: fromArr.map((f) => ({
            publicKey: f.publicKey || '',
            amount: (f.amount || '0').toString()
          })),
          to: toArr.map((t) => ({
            publicKey: t.publicKey || '',
            amount: (t.amount || '0').toString(),
            type: t.type
          }))
        });
      } catch (e) {}
    }

    return result;
  }
}

module.exports = Prism;
