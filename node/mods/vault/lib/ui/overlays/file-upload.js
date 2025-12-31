const ListNFTsOverlay = require('./list-nfts.js');
const ScriptingKeyOverlay = require('./scripting.js');
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
    this.scripting_overlay = new ScriptingKeyOverlay(this.app, this.mod);
    this.submit_button_active = false;

    // will hold id of NFT minted for this file
    this.nft_id = '';
  }

  render() {
    this.overlay.show(FileUploadTemplate(this.app, this.mod, this));
    setTimeout(() => this.attachEvents(), 25);
  }

  attachEvents() {
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
            // Check if file read failed (null file from FileReader error or size limit)
            if (!file && fileobj) {
              if (fileobj.size > this.app.browser.MAX_FILE_SIZE) {
                salert(`File size exceeds browser limit. Please choose a smaller file.`);
              } else {
                salert(`Failed to read file. File may be too large (${(fileobj.size / 1024 / 1024).toFixed(2)} MB). Try a smaller file.`);
              }
              return;
            }

            if (fileobj && fileobj.size > this.app.browser.MAX_FILE_SIZE) {
              salert(`File size exceeds browser limit. Please choose a smaller file.`);
              return;
            }

            // Validate file exists
            if (!file || !fileobj) {
              salert('Invalid file. Please try again.');
              return;
            }

            this.mod.file = file;
            this.mod.filename = fileobj.name;
            document.querySelector('.vault-upload-overlay .saito-overlay-form-header .saito-overlay-form-header-title').innerHTML = "Select Key Type:";
            document.querySelector('.vault-upload-overlay .nft-creator .button-container').style.display = "flex";
            document.querySelector('.vault-upload-overlay .nft-creator .textarea-container').style.display = "none";
          } catch (err) {
            console.error("Vault file upload error:", err);
            salert('Error processing file. Please try again.');
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
          this.scripting_overlay.render();
	  this.scripting_overlay.callback = (obj) => {
	    let access_hash = obj.access_hash;
	    let access_script = obj.access_script;
	    if (access_script) {
	      this.mintNFT(access_script);
	    } else {
	    }
	  } 
        }
      }

      document.querySelector('.public-nft').onclick = async (e) => {
	this.mintNFT();
      };

    } catch (err) {}
  }


  async mintNFT(access_script=null) {

    if (!this.mod.file) {
      alert("Please upload a file before creating an NFT.");
      return;
    }

    //
    // Prepare NFT tx (not signed, not propagated)
    //
    let numNFT = 1;
    let depositAmt = BigInt(this.app.wallet.convertSaitoToNolan(1));
    let fee = BigInt(0n);
    let nft_type = 'vault';

    let balance = await this.app.wallet.getBalance();
    if (balance < depositAmt) {
      alert('Insufficient funds to mint NFT');
      return;
    }

    let tx_msg = {
      data : {
        filename: this.mod.filename,
        file_id: ""  //
                     // will be filled after we know file tx signature
                     //
      }
    };

    let owner_publicKey = this.app.wallet.publicKey;

    let nft_tx = await this.app.wallet.createMintNFTTransaction(
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
    let nft_obj = new SaitoNFT(this.app, this.mod, nft_tx);
    this.nft_id = nft_obj.id;

    if (!this.nft_id) {
      alert("Unable to compute NFT ID for minted NFT");
      return;
    }

    siteMessage("Binding Access Key to File...", 2000);

    //
    // Create and sign vault file tx bound to this nft_id
    //
    let file_tx = await this.mod.createVaultAddFileTransaction(this.nft_id, access_script);
    if (!file_tx) {
      alert("Error creating Vault file transaction");
      return;
    }

    let file_id = file_tx.signature;

    //
    // Add file_id into NFT tx msg.data and sign NFT tx
    //
    if (!nft_tx.msg) { nft_tx.msg = {}; }
    if (!nft_tx.msg.data) { nft_tx.msg.data = {}; }

    nft_tx.msg.data.file_id = file_id;
    if (access_script != null) { nft_tx.msg.data.file_access_script = access_script; }

    siteMessage("Signing and Propagating...", 2000);

    await nft_tx.sign();

    //
    // Propagate NFT tx
    //
    await this.app.network.propagateTransaction(nft_tx);

    //
    // Send file tx as 'vault add file' request
    //
    let callback_func = (res) => {
      this.overlay.hide();
      siteMessage('File Upload Successful..', 3000);
      this.file_info_overlay.sig = file_tx.signature;
      this.file_info_overlay.render();
    };

    if (this.mod.peer) {
      siteMessage('Transferring File to Archive...', 3000);
      document.querySelector('.spinner-helper').style.display = "block";
      document.querySelector('.public-nft').style.display = "none";
      document.querySelector('.private-nft').style.display = "none";

      await this.app.network.sendRequestAsTransaction(
        'vault add file',
        file_tx.serialize_to_web(this.app),
        callback_func
      );
    } else {
      alert("ERROR: issue connecting to server. Please try again later.");
    }

  }

}

module.exports = FileUpload;
