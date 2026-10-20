const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const PeerService = require('saito-js/lib/peer_service').default;
const HomePage = require('./index');
const Database = require('./lib/database');
const RedemptionMain = require('./lib/ui/main');
const {
  REQUEST_REDEEM,
  REQUEST_STATUS,
  REDEMPTION_NFT_TYPE,
  inspectRedemptionRequest,
  parseRedemptionTerms
} = require('./lib/transactions');

class Redemption extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'Redemption';
    this.slug = 'redemption';
    this.dbname = 'redemption';
    this.description = 'Redeem eligible NFTs for the assets specified in their signed claims.';
    this.categories = 'Finance Utility';
    this.class = 'utility';
    this.dependencies = ['Archive'];
    this.styles = ['/redemption/style.css'];

    this.database = new Database(app, this);
    this.transactions = require('./lib/transactions');
    this.servers = {};
    this.header = null;
    this.main = null;
  }

  peerForServer(publicKey) {
    if (!publicKey) {
      return null;
    }
    return this.servers[publicKey] || null;
  }

  async initialize(app) {
    await super.initialize(app);

    if (!this.app.BROWSER) {
      await this.database.ensureSchema();
    }

    if (this.browser_active) {
      this.main = new RedemptionMain(app, this);
      this.addComponent(this.main);
      this.header = new SaitoHeader(app, this);
      await this.header.initialize(app);
      this.addComponent(this.header);
    }
  }

  async render() {
    if (!this.browser_active) {
      return;
    }
    await super.render();
  }

  respondTo(type = '') {
    if (type === 'saito-create-nft') {
      return {
        title: 'Redemption NFT',
        class: [REDEMPTION_NFT_TYPE],
        createData: async () => this.createRedemptionData()
      };
    }
    return super.respondTo(type);
  }

  createRedemptionData() {
    const builtinTicker = document.querySelector('.saito-nft-create .secondary input.ticker');
    if (builtinTicker) {
      builtinTicker.value = '';
    }

    const value = (id) => document.querySelector(id)?.value || '';
    const parsed = parseRedemptionTerms({
      data: {
        ticker: value('#redemption-create-ticker'),
        amount: value('#redemption-create-amount'),
        blocks_required: value('#redemption-create-confirmations'),
        server_publickey: value('#redemption-create-server'),
        collateral_id: value('#redemption-create-collateral')
      }
    });
    if (!parsed.ok) {
      const notices = {
        'invalid-ticker': 'Enter the asset ticker, such as ETH or USDT.',
        'invalid-amount': 'Enter the claim amount as a whole number of base units.',
        'invalid-blocks-required': 'Enter the number of confirmations as a whole number of blocks.',
        'invalid-server': 'Enter the public key of the server that can process this claim.',
        'invalid-collateral-id': 'Enter the collateral id for the deposited funds.'
      };
      salert(notices[parsed.reason] || 'The redemption claim is incomplete.');
      return false;
    }
    return parsed.terms;
  }

  returnServices() {
    if (this.app.BROWSER) {
      return [];
    }
    return [new PeerService(null, 'Redemption', this.publicKey)];
  }

  async onPeerServiceUp(app, peer, service = {}) {
    if (service.service !== 'Redemption' || !peer?.publicKey) {
      return;
    }
    this.servers[peer.publicKey] = peer;
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback = null) {
    if (tx == null) {
      return 0;
    }
    let message = null;
    try {
      message = tx.returnMessage();
    } catch (err) {
      return super.handlePeerTransaction(app, tx, peer, mycallback);
    }

    if (message?.request === REQUEST_STATUS) {
      if (this.app.BROWSER || typeof mycallback !== 'function') {
        return 1;
      }
      const ids = Array.isArray(message.data?.nft_ids) ? message.data.nft_ids : [];
      mycallback({ statuses: await this.database.statusForNfts(ids) });
      return 1;
    }

    if (message?.request !== REQUEST_REDEEM) {
      return super.handlePeerTransaction(app, tx, peer, mycallback);
    }
    if (this.app.BROWSER || typeof mycallback !== 'function') {
      return 1;
    }

    const data = message.data || {};
    const address = String(data.withdrawal_address || '').trim();
    const instructions = String(data.instructions || '').trim();
    if (!address || address.length > 256 || instructions.length > 2000) {
      mycallback({
        result: 'rejected',
        notice: 'The withdrawal address is missing or the request is too large.'
      });
      return 1;
    }

    const existing = data.nft_id ? await this.database.activeForNft(data.nft_id) : null;
    const decision = await inspectRedemptionRequest(
      app,
      { ...data, existing_status: existing?.status || '' },
      this.publicKey
    );
    if (existing) {
      mycallback({
        result: 'duplicate',
        status: existing.status === 'processed' ? 'redeemed' : 'pending',
        authorizable: false,
        revalidated: decision.status,
        reasons: decision.reasons,
        notice:
          existing.status === 'processed'
            ? 'This redemption NFT has already been redeemed. No further payout was authorized.'
            : 'A redemption request for this NFT is already recorded. It was checked again and no payout was authorized.'
      });
      return 1;
    }
    const requester = this.requesterKey(tx, peer);
    const row = {
      nft_id: decision.nft_id || data.nft_id || '',
      nft_type: 'redemption-nft',
      custody_utxo: data.custody_utxo || '',
      tx_sig: data.tx_sig || '',
      requester,
      ticker: decision.terms?.ticker || '',
      amount: decision.terms?.amount || '',
      server_publickey: decision.terms?.server_publickey || '',
      blocks_required: decision.terms?.blocks_required || '',
      collateral_id: decision.terms?.collateral_id || '',
      custody_block_id: decision.custody_block_id || '',
      tip_block_id: decision.tip_block_id || '',
      withdrawal_address: address,
      instructions,
      reason: (decision.reasons || []).join(',')
    };

    if (!decision.eligible) {
      if (row.nft_id) {
        await this.database.recordTerminal(row, decision.status === 'unavailable' ? 'failed' : 'rejected');
      }
      mycallback({
        result: 'rejected',
        status: decision.status,
        reasons: decision.reasons,
        notice: 'This claim is not eligible for redemption. No payout was authorized.'
      });
      return 1;
    }

    const recorded = await this.database.recordPending(row);
    mycallback({
      result: recorded.result,
      status: recorded.status || 'pending',
      notice:
        recorded.notice ||
        'The redemption request is recorded as pending. This is not a cryptocurrency payout.'
    });
    return 1;
  }

  requesterKey(tx, peer) {
    const inputs = Array.isArray(tx?.from) ? tx.from : [];
    for (const slip of inputs) {
      if (slip?.publicKey) {
        return slip.publicKey;
      }
    }
    return peer?.publicKey || '';
  }

  async submitRedemption(claim, form) {
    if (!claim?.eligible) {
      return {
        result: 'rejected',
        notice: 'This claim is not eligible for a redemption request.'
      };
    }
    const peer = this.peerForServer(claim.terms?.server_publickey);
    if (!peer || typeof this.app.network?.sendRequest !== 'function') {
      return {
        result: 'unavailable',
        notice: 'The authorized redemption server is not connected.'
      };
    }
    return new Promise((resolve) => {
      this.app.network.sendRequest(
        REQUEST_REDEEM,
        {
          module: this.name,
          nft_id: claim.nft_id,
          tx_sig: claim.tx_sig,
          custody_utxo: claim.custody_utxo,
          slip1_utxo: claim.slip1_utxo,
          slip3_utxo: claim.slip3_utxo,
          withdrawal_address: form.withdrawal_address,
          instructions: form.instructions || ''
        },
        (response) => {
          resolve(response || { result: 'unavailable', notice: 'The redemption server did not respond.' });
        },
        peer
      );
    });
  }

  requestStatuses(nftIds) {
    const peers = Object.values(this.servers);
    if (!peers.length || typeof this.app.network?.sendRequest !== 'function') {
      return Promise.resolve({});
    }
    return new Promise((resolve) => {
      let pending = peers.length;
      let finished = false;
      const combined = {};
      const finish = () => {
        if (finished) {
          return;
        }
        finished = true;
        resolve(combined);
      };
      for (const peer of peers) {
        this.app.network.sendRequest(
          REQUEST_STATUS,
          { module: this.name, nft_ids: nftIds },
          (response) => {
            Object.assign(combined, response?.statuses || {});
            pending -= 1;
            if (pending <= 0) {
              finish();
            }
          },
          peer
        );
      }
      setTimeout(finish, 8000);
    });
  }

  webServer(app, expressapp, express) {
    const webdir = `${__dirname}/web`;
    const slug = encodeURI(this.returnSlug());
    const mod_self = this;

    expressapp.get(['/' + slug, '/' + slug + '/'], function (req, res) {
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.send(HomePage(app, mod_self, app.build_number));
    });
    expressapp.use('/' + slug, express.static(webdir));
  }
}

module.exports = Redemption;
