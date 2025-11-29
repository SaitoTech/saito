let ListNFT = require('./../../../../../lib/saito/ui/saito-nft/overlays/list-overlay');
let NFTInfo = require('./nft-info');

class ListNFTsOverlay extends ListNFT {

  constructor(app, mod) {

    super(app, mod, false);

    this.nft_info_overlay = new NFTInfo(app, mod, false);

    app.connection.on('wallet-updated', async () => {

        let { updated, rebroadcast, persisted } = await this.app.wallet.updateNFTList();

        if (persisted && this.app.BROWSER) {
          siteMessage(`NFT updated in wallet`, 3000);
        }

        if (this.overlay.visible) {
          this.render();
        }
    });

  }

  async render() {

    let list_self = this;
    await super.render();

    if (this.nft_list) {
      for (let z = 0; z < this.card_list.length; z++) {
	let nft = this.card_list[z].nft;
        this.card_list[z].callback = () => {
	  this.nft_info_overlay.nft = nft;
	  this.nft_info_overlay.render();
	  list_self.overlay.hide();
        };
      }
    }

  }

}

module.exports = ListNFTsOverlay;
