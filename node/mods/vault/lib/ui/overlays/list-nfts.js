let FileInfoOverlay = require('./file-info');
let ListNFT = require('./../../../../../lib/saito/ui/saito-nft/overlays/list-overlay');


class ListNFTsOverlay extends ListNFT {

  constructor(app, mod) {

    super(app, mod, false);

    this.file_info_overlay = new FileInfoOverlay(app, mod);

    app.connection.on('wallet-updated', async () => {
        let { updated, rebroadcast, persisted } = await this.app.wallet.updateNFTList();
        if (persisted) {
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
        this.card_list[z].callback = async () => {

	  //
	  // extract the slips and create the script 
	  //
	  list_self.overlay.hide();

	  //
	  //
	  //
          let newtx = await this.mod.createVaultAddFileTransaction();

          let callback_func = (res) => {
            this.overlay.hide();
            siteMessage('NFT Binding Successful...', 3000);
            this.file_info_overlay.render();
          }

          if (this.mod.peer) {
            try {
              siteMessage('Binding NFT to Secure File Access...', 3000);
              this.file_info_overlay.sig = newtx.signature;
              await this.app.network.sendRequestAsTransaction(
                'vault add file' ,
                newtx.serialize_to_web(this.app) ,
                callback_func,
                this.mod.peer.peerIndex
              );
            } catch (err) { }
          } else {
            alert("ERROR: issue connecting to server. Please try again later.");
          }
        };
      }
    }

  }

}

module.exports = ListNFTsOverlay;
