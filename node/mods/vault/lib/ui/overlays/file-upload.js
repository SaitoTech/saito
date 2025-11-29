const ListNFTsOverlay = require('./list-nfts.js');
const FileInfoOverlay = require('./file-info.js');
const FileUploadTemplate = require('./file-upload.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');
let SaitoNFT = require('./../../../../../lib/saito/ui/saito-nft/saito-nft');

class FileUpload {

  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.list_nfts_overlay = new ListNFTsOverlay(this.app, this.mod);
    this.file_info_overlay = new FileInfoOverlay(this.app, this.mod);
    this.submit_button_active = false;

    // will hold id of NFT minted for this file
    this.nft_id = '';
  }

  render() {
    this.overlay.show(FileUploadTemplate(this.app, this.mod, this));
    setTimeout(() => this.attachEvents(), 25);
  }

  attachEvents() {
    let this_self = this;
    try {

      document.querySelector('.vault-upload-overlay .nft-creator .button-container').style.display = "none";
      document.querySelector('.vault-upload-overlay .nft-creator .textarea-container').style.display = "flex";

      //
      // drag-and-drop file upload
      //
      this.app.browser.addDragAndDropFileUploadToElement(
        'vault-file-upload',
        async (file, confirm = false, fileobj = null) => {
          try {
            this.mod.file = file;
            this.mod.filename = fileobj.name;
            document.querySelector('.vault-upload-overlay .nft-creator .button-container').style.display = "flex";
            document.querySelector('.vault-upload-overlay .nft-creator .textarea-container').style.display = "none";
          } catch (err) {
            console.log("ERROR: " + err);
          }
        },
        true
      );

      //
      // nft-binding buttons
      //
      if (document.querySelector('.private-nft')) {
        document.querySelector('.private-nft').onclick = async (e) => {
          this.overlay.hide();
          this.list_nfts_overlay.render();
        }
      }

      document.querySelector('.public-nft').onclick = async (e) => {
        let this_self = this;

        if (!this_self.mod.file) {
          alert("Please upload a file before creating an NFT.");
          return;
        }

        //
        // Prepare NFT tx (not signed, not propagated)
        //
        let numNFT = 1;
        let depositAmt = BigInt(this_self.app.wallet.convertSaitoToNolan(1));
        let fee = BigInt(0n);
        let nft_type = 'vault';

        let balance = await this_self.app.wallet.getBalance();
        if (balance < depositAmt) {
          alert('Insufficient funds to mint NFT');
          return;
        }

        let tx_msg = {
          data: {
            filename: this_self.mod.filename,
            file_id: ""   //
                         // will be filled after we know file tx signature
                         //
          }
        };

        let owner_publicKey = this_self.app.wallet.publicKey;
        console.log("owner_publicKey: ", owner_publicKey);

        let nft_tx = await this_self.app.wallet.createMintNFTTransaction(
          BigInt(numNFT),
          depositAmt,
          tx_msg,
          fee,
          owner_publicKey,
          nft_type
        );

        //
        // get nft_id from the unsigned NFT tx
        //
        let nft_obj = new SaitoNFT(this_self.app, this_self.mod, nft_tx);
        this_self.nft_id = nft_obj.id;

        console.log("Vault FileUpload: nft_id:", this_self.nft_id);

        if (!this_self.nft_id) {
          alert("Unable to compute NFT ID for minted NFT");
          return;
        }

        //
        // Create and sign vault file tx bound to this nft_id
        //
        let file_tx = await this_self.mod.createVaultAddFileTransaction(this_self.nft_id);
        if (!file_tx) {
          alert("Error creating Vault file transaction");
          return;
        }

        let file_id = file_tx.signature;
        console.log("Vault FileUpload: file_id (file tx sig):", file_id);

        //
        // Add file_id into NFT tx msg.data and sign NFT tx
        //
        if (!nft_tx.msg) { nft_tx.msg = {}; }
        if (!nft_tx.msg.data) { nft_tx.msg.data = {}; }

        nft_tx.msg.data.file_id = file_id;

        await nft_tx.sign();

        //
        // Propagate NFT tx
        //
        await this_self.app.network.propagateTransaction(nft_tx);
        console.log("Vault FileUpload: propagated NFT tx:", nft_tx.signature);

        //
        // Send file tx as 'vault add file' request
        //
        let callback_func = (res) => {
          this_self.overlay.hide();
          siteMessage('File Upload Successful..', 3000);
          this_self.file_info_overlay.sig = file_tx.signature;
          // this_self.file_info_overlay.nft_id = this_self.nft_id;
          this_self.file_info_overlay.render();
        };

        if (this_self.mod.peer) {
          siteMessage('Transferring File to Archive...', 3000);
          document.querySelector('.spinner-helper').style.display = "block";
          document.querySelector('.public-nft').style.display = "none";

          await this_self.app.network.sendRequestAsTransaction(
            'vault add file',
            file_tx.serialize_to_web(this_self.app),
            callback_func
          );
        } else {
          alert("ERROR: issue connecting to server. Please try again later.");
        }
      };

    } catch (err) {}
  }

}

module.exports = FileUpload;
