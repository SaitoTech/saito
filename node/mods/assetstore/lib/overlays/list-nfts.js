let ListNft = require('../../../../lib/saito/ui/saito-nft/overlays/list-overlay');
let SendNft = require('./send-nft');

class ListNftsOverlay extends ListNft {

  constructor(app, mod) {

    super(app, mod, false);

    this.send_nft_overlay = new SendNft(app, mod, false);

    app.connection.on('wallet-updated', async () => {

        let { updated, rebroadcast, persisted } = await this.app.wallet.updateNftList();

        if (persisted) {
          siteMessage(`NFT updated in wallet`, 3000);
        }

        // re-render send-nft overlay if its open
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
	  this.send_nft_overlay.nft = nft;
	  this.send_nft_overlay.render();
	  list_self.overlay.hide();
        };
      }
    }


  }

}

module.exports = ListNftsOverlay;
