const ListNftsOverlay = require('./list-nfts.js');
const FileInfoOverlay = require('./file-info.js');
const FileUploadTemplate = require('./file-upload.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');


class FileUpload {

  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod);
    this.list_nfts_overlay = new ListNftsOverlay(this.app, this.mod);
    this.file_info_overlay = new FileInfoOverlay(this.app, this.mod);
    this.submit_button_active = false;
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

        let newtx = await this.mod.createVaultAddFileTransaction();

        let callback_func = (res) => {
	  this.overlay.hide();
          siteMessage('File Upload Successful..', 3000);
 	  this.file_info_overlay.render();
        }
        if (this.mod.peer) {
          try { 
            siteMessage('Transferring File to Archive...', 3000);
            document.querySelector('.spinner-helper').style.display = "block";
//            document.querySelector('.private-nft').style.display = "none";
            document.querySelector('.public-nft').style.display = "none";
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
      }
    } catch (err) {}
  }

}

module.exports = FileUpload;

