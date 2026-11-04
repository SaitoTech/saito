const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Card = require('./lib/card');
const Main = require('./lib/ui/main');
const HomePage = require('./index');

class TSCardGen extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'TSCardGen';
    this.slug = 'tscardgen';
    this.description = 'Create custom Twilight Struggle event cards in the browser.';
    this.categories = 'Games Utilities';
    this.class = 'utility';
    this.status = 'beta';
    this.icon = 'fa-solid fa-clone';

    this.styles = ['/saito/saito.css', '/tscardgen/style.css'];

    this.card = new Card(app, this);
    this.header = null;
    this.main = null;
    this.create_nft_overlay = null;
    this.transaction_monitor = null;
  }

  async initialize(app) {
    await super.initialize(app);

    if (this.app.BROWSER) {
      const SaitoTransactionMonitor = require('../../lib/saito/ui/saito-transaction-monitor/saito-transaction-monitor');
      this.transaction_monitor = new SaitoTransactionMonitor(this.app, this);
    }

    if (this.browser_active) {
      this.header = new SaitoHeader(app, this);
      await this.header.initialize(app);
    }
  }

  shouldAffixCallbackToModule(modname, tx = null) {
    if (modname === this.name) {
      return 1;
    }
    // Allow the shared transaction monitor to receive NFT mint confirmations.
    if (
      this.transaction_monitor?.tx &&
      tx?.signature &&
      tx.signature === this.transaction_monitor.tx.signature
    ) {
      return 1;
    }
    return 0;
  }

  async onConfirmation(blk, tx, conf) {
    // Monitor wraps this method at construction time.
  }

  respondTo(type = '', obj = null) {
    if (type === 'saito-create-nft') {
      return {
        title: 'Twilight Struggle Card',
        class: [Card.NFT_TYPE],
        upload_text: 'Twilight Struggle card image',
        createData: async (file, metadata = {}) => {
          const card = metadata.card;
          if (!card || typeof card !== 'object') {
            salert('Missing card data for NFT');
            return false;
          }

          const name = String(card.name || '').trim();
          if (!name) {
            salert('Card title is required');
            return false;
          }

          const image = card.image || metadata.image || '';
          if (!image) {
            salert('Paint and attach a card image before minting');
            return false;
          }

          const text = String(card.text || '');
          if (!text.trim()) {
            salert('Card text is required');
            return false;
          }

          const player = ['us', 'ussr', 'both'].includes(card.player) ? card.player : 'both';
          const deck = ['early', 'mid', 'late'].includes(card.deck) ? card.deck : 'early';
          // Preserve legacy string or multi-event [{ name, code }, ...] payloads.
          let code = '';
          if (typeof card.code === 'string') {
            code = card.code.replace(/\t/g, ' ');
          } else if (Array.isArray(card.code)) {
            code = card.code
              .map((entry) => {
                if (typeof entry === 'string') {
                  return entry.replace(/\t/g, ' ');
                }
                if (!entry || typeof entry !== 'object') {
                  return null;
                }
                const name = String(entry.name || '').trim();
                const body = String(entry.code || '').replace(/\t/g, ' ');
                if (!name || !body.trim()) {
                  return null;
                }
                return { name, code: body };
              })
              .filter(Boolean);
            if (code.length === 1) {
              code = code[0].code;
            } else if (!code.length) {
              code = '';
            }
          }

          return {
            module: 'TSCardGen',
            type: 'card',
            name,
            scoring: Number(card.scoring) ? 1 : 0,
            player,
            ops: Number(card.ops) || 0,
            recurring: Number(card.recurring) ? 1 : 0,
            permanent: Number(card.permanent) ? 1 : 0,
            non_card: Number(card.non_card) ? 1 : 0,
            deck,
            text,
            code,
            img: typeof card.img === 'string' ? card.img : '',
            image
          };
        }
      };
    }

    return super.respondTo(type, obj);
  }

  async openCreateNft() {
    // Paint to a capture canvas so minting works in Code workspace
    // (sidebar shows reference docs, not the live preview).
    let canvas = this.main?.card_ui?.canvas?.();
    if (canvas) {
      await this.main.card_ui.draw();
    } else if (this.main?.paintCaptureCanvas) {
      canvas = await this.main.paintCaptureCanvas();
    } else {
      canvas = document.createElement('canvas');
      await this.card.paint(canvas);
    }

    let image = this.card.toDataURL(canvas);
    if (!image) {
      salert('Unable to capture the card image');
      return;
    }

    // Card canvas is 375×525; still compress large PNG data-URLs before minting.
    if (typeof this.app.browser?.resizeImg === 'function') {
      try {
        image = await this.app.browser.resizeImg(image, 128, {
          w: Card.WIDTH,
          h: Card.HEIGHT
        });
      } catch (err) {
        console.warn('TSCardGen: resizeImg failed, using original canvas capture', err);
      }
    }

    const snapshot = this.card.buildSnapshot(image);
    if (!snapshot.name) {
      salert('Enter a card title before creating an NFT');
      return;
    }
    if (!String(snapshot.text || '').trim()) {
      salert('Enter card text before creating an NFT');
      return;
    }

    let createNft =
      this.header && this.header.select_nft_overlay && this.header.select_nft_overlay.create_nft_overlay;

    if (!createNft) {
      if (!this.create_nft_overlay) {
        const CreateNFT = require('../../lib/saito/ui/saito-nft/overlays/create-overlay');
        this.create_nft_overlay = new CreateNFT(this.app, this);
      }
      createNft = this.create_nft_overlay;
    }

    createNft.render({
      type: Card.NFT_TYPE,
      locked: ['type'],
      image: snapshot.image,
      title: snapshot.name,
      description: `Twilight Struggle Optional Card - ${snapshot.name}`,
      create_data: { card: snapshot },
      callback: (obj) => {
        if (obj?.status === 'created') {
          this.watchMintTransaction(obj.tx, obj.nft_id);
          return;
        }
        if (obj?.status === 'cancelled') {
          // User closed Create NFT without minting.
        }
      }
    });
  }

  watchMintTransaction(tx, nft_id = '') {
    if (!this.transaction_monitor) {
      console.error('TSCardGen: transaction_monitor is not initialized');
      this.main?.showHome?.();
      return;
    }

    this.transaction_monitor.render({
      tx,
      nft_id: nft_id || '',
      title: 'Creating Twilight Card',
      lead: 'Your Twilight Struggle card NFT has been broadcast to the Saito network.',
      subtitle: '',
      successTitle: 'Card Received',
      successLead: 'Your Twilight Struggle card has arrived in your wallet.',
      successActionLabel: 'Continue',
      callback: async (result) => {
        if (result?.status === 'confirmed') {
          try {
            await this.app.wallet.updateNFTList();
          } catch (err) {
            console.warn('TSCardGen: updateNFTList after mint failed', err);
          }
          this.main?.showHome?.();
          return;
        }
        if (result?.status === 'cancelled') {
          // User dismissed the monitor before confirmation.
        }
      }
    });
  }

  async render() {
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    if (!this.header) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
    }

    if (!this.main) {
      this.main = new Main(this.app, this);
    }

    this.addComponent(this.header);
    await super.render();
    this.main.render('home');
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

module.exports = TSCardGen;
